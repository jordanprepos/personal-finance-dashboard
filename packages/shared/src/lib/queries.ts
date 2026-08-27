import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import type {
  Budget,
  Category,
  CategoryInput,
  Profile,
  Transaction,
  TransactionInput,
  TransactionPatch,
  TransactionSeriesKey,
} from '../types.js';
import { monthsOfYear, shiftMonth, toYear, toYearMonth, assertYearMonth } from './dates.js';
import { colorForName } from '../data/defaultCategories.js';

/* ------------------------------------------------------------------ paths */

export const userPath = (userId: string): string => `users/${userId}`;

export const categoriesCollection = (db: Firestore, userId: string): CollectionReference<DocumentData> =>
  collection(db, 'users', userId, 'categories');

export const transactionsCollection = (db: Firestore, userId: string): CollectionReference<DocumentData> =>
  collection(db, 'users', userId, 'transactions');

export const budgetsCollection = (db: Firestore, userId: string): CollectionReference<DocumentData> =>
  collection(db, 'users', userId, 'budgets');

/**
 * `profile` is a single document. Firestore paths alternate
 * collection/document, so it lives at `users/{userId}/profile/main` rather
 * than as a bare `profile` segment — that keeps it under `users/{userId}`,
 * where the security rule applies.
 */
export const PROFILE_DOC_ID = 'main';

export const profileDoc = (db: Firestore, userId: string): DocumentReference<DocumentData> =>
  doc(db, 'users', userId, 'profile', PROFILE_DOC_ID);

/* ------------------------------------------------------------- converters */

function toCategory(snap: QueryDocumentSnapshot<DocumentData>): Category {
  const d = snap.data();
  const name = String(d['name'] ?? '');
  const order = Number(d['order'] ?? 0);
  return {
    id: snap.id,
    name,
    type: (d['type'] ?? 'variable') as Category['type'],
    // Resolved from the name, so the palette applies to accounts written
    // before it existed without rewriting a single document — see the note on
    // `colorForName` for why the stored value isn't read back.
    color: colorForName(name, order),
    icon: String(d['icon'] ?? ''),
    order,
    archived: Boolean(d['archived'] ?? false),
  };
}

function toTransaction(snap: QueryDocumentSnapshot<DocumentData>): Transaction {
  const d = snap.data();
  const date = String(d['date'] ?? '');
  const tx: Transaction = {
    id: snap.id,
    categoryId: String(d['categoryId'] ?? ''),
    item: String(d['item'] ?? ''),
    amount: Number(d['amount'] ?? 0),
    date,
    // Fall back to deriving these so a hand-written doc still renders; every
    // write path in this file sets them explicitly.
    yearMonth: String(d['yearMonth'] ?? (date ? toYearMonth(date) : '')),
    year: String(d['year'] ?? (date ? toYear(date) : '')),
    // Normalise a legacy doc written without the field to the same `null`
    // every write path now stores.
    seriesId: typeof d['seriesId'] === 'string' && d['seriesId'] !== '' ? d['seriesId'] : null,
    // createdAt is null locally until the server timestamp resolves.
    createdAt: (d['createdAt'] as Timestamp | null) ?? Timestamp.now(),
  };
  const note = d['note'];
  if (typeof note === 'string' && note !== '') tx.note = note;
  return tx;
}

function toBudget(id: string, d: DocumentData | undefined): Budget {
  return {
    id,
    income: Number(d?.['income'] ?? 0),
    categoryBudgets: (d?.['categoryBudgets'] ?? {}) as Record<string, number>,
  };
}

/* ------------------------------------------------------------- categories */

export async function fetchCategories(db: Firestore, userId: string): Promise<Category[]> {
  const snap = await getDocs(query(categoriesCollection(db, userId), orderBy('order', 'asc')));
  return snap.docs.map(toCategory);
}

export function watchCategories(
  db: Firestore,
  userId: string,
  onChange: (categories: Category[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(categoriesCollection(db, userId), orderBy('order', 'asc')),
    (snap) => onChange(snap.docs.map(toCategory)),
    onError,
  );
}

export async function createCategory(
  db: Firestore,
  userId: string,
  input: CategoryInput,
): Promise<Category> {
  const ref = doc(categoriesCollection(db, userId));
  const category: Category = { ...input, id: ref.id };
  await setDoc(ref, category);
  return category;
}

export async function updateCategory(
  db: Firestore,
  userId: string,
  categoryId: string,
  patch: Partial<CategoryInput>,
): Promise<void> {
  await updateDoc(doc(categoriesCollection(db, userId), categoryId), patch);
}

/** Soft delete — keeps historical transactions readable. Prefer this. */
export async function archiveCategory(db: Firestore, userId: string, categoryId: string): Promise<void> {
  await updateDoc(doc(categoriesCollection(db, userId), categoryId), { archived: true });
}

/**
 * Hard delete: removes the category and every transaction filed under it.
 * Returns the number of transactions removed.
 */
export async function deleteCategory(db: Firestore, userId: string, categoryId: string): Promise<number> {
  const snap = await getDocs(
    query(transactionsCollection(db, userId), where('categoryId', '==', categoryId)),
  );
  await deleteInBatches(db, snap.docs.map((d) => d.ref));
  await deleteDoc(doc(categoriesCollection(db, userId), categoryId));
  return snap.size;
}

/* ----------------------------------------------------------- transactions */

/**
 * Daily / monthly / yearly rollups are equality queries against the
 * denormalized `date`, `yearMonth` and `year` fields — no range scans.
 */

/** Daily: `date == "YYYY-MM-DD"`. */
export async function fetchTransactionsByDate(
  db: Firestore,
  userId: string,
  date: string,
): Promise<Transaction[]> {
  return runTransactionQuery(db, userId, [where('date', '==', date), orderBy('createdAt', 'desc')]);
}

/** Monthly: `yearMonth == "YYYY-MM"`. */
export async function fetchTransactionsByMonth(
  db: Firestore,
  userId: string,
  yearMonth: string,
): Promise<Transaction[]> {
  assertYearMonth(yearMonth);
  return runTransactionQuery(db, userId, [
    where('yearMonth', '==', yearMonth),
    orderBy('date', 'desc'),
  ]);
}

/** Yearly: `year == "YYYY"`. */
export async function fetchTransactionsByYear(
  db: Firestore,
  userId: string,
  year: string,
): Promise<Transaction[]> {
  return runTransactionQuery(db, userId, [where('year', '==', year), orderBy('date', 'desc')]);
}

/** Monthly, narrowed to one category. */
export async function fetchTransactionsByMonthAndCategory(
  db: Firestore,
  userId: string,
  yearMonth: string,
  categoryId: string,
): Promise<Transaction[]> {
  assertYearMonth(yearMonth);
  return runTransactionQuery(db, userId, [
    where('yearMonth', '==', yearMonth),
    where('categoryId', '==', categoryId),
    orderBy('date', 'desc'),
  ]);
}

export async function fetchRecentTransactions(
  db: Firestore,
  userId: string,
  count = 25,
): Promise<Transaction[]> {
  return runTransactionQuery(db, userId, [orderBy('date', 'desc'), limit(count)]);
}

export function watchTransactionsByMonth(
  db: Firestore,
  userId: string,
  yearMonth: string,
  onChange: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
): () => void {
  assertYearMonth(yearMonth);
  return watchTransactionQuery(
    db,
    userId,
    [where('yearMonth', '==', yearMonth), orderBy('date', 'desc')],
    onChange,
    onError,
  );
}

/** Yearly, live. Mirrors `fetchTransactionsByYear`. */
export function watchTransactionsByYear(
  db: Firestore,
  userId: string,
  year: string,
  onChange: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return watchTransactionQuery(
    db,
    userId,
    [where('year', '==', year), orderBy('date', 'desc')],
    onChange,
    onError,
  );
}

/** The watch counterpart of `runTransactionQuery` — same query, pushed. */
function watchTransactionQuery(
  db: Firestore,
  userId: string,
  constraints: QueryConstraint[],
  onChange: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(transactionsCollection(db, userId), ...constraints),
    (snap) => onChange(snap.docs.map(toTransaction)),
    onError,
  );
}

async function runTransactionQuery(
  db: Firestore,
  userId: string,
  constraints: QueryConstraint[],
): Promise<Transaction[]> {
  const snap = await getDocs(query(transactionsCollection(db, userId), ...constraints));
  return snap.docs.map(toTransaction);
}

/* ------------------------------------------------- transaction mutations */

/**
 * `yearMonth` and `year` are computed here, from `date`, on every write —
 * they are never supplied by the caller and never derived at query time.
 */
function denormalize(
  input: TransactionInput,
  id: string,
  seriesId: string | null = null,
): Omit<Transaction, 'createdAt'> {
  return {
    id,
    categoryId: input.categoryId,
    item: input.item,
    amount: input.amount,
    date: input.date,
    yearMonth: toYearMonth(input.date),
    year: toYear(input.date),
    ...(input.note ? { note: input.note } : {}),
    // Always written, null included — an absent field is not queryable.
    seriesId,
  };
}

/**
 * A series id is just a fresh Firestore document id, issued once per run and
 * stamped onto every month in it.
 */
export function newSeriesId(db: Firestore, userId: string): string {
  return doc(transactionsCollection(db, userId)).id;
}

export async function createTransaction(
  db: Firestore,
  userId: string,
  input: TransactionInput,
): Promise<Transaction> {
  const ref = doc(transactionsCollection(db, userId));
  const body = denormalize(input, ref.id);
  await setDoc(ref, { ...body, createdAt: serverTimestamp() });
  return { ...body, createdAt: Timestamp.now() };
}

/**
 * Writes one independent transaction document per month, from `input.date`
 * through `throughYearMonth` inclusive, all sharing one `seriesId`.
 *
 * Recurrence is expanded on write, so every rollup stays a plain equality
 * query; the shared `seriesId` is what makes the run addressable afterwards.
 */
export async function createTransactionSeries(
  db: Firestore,
  userId: string,
  input: TransactionInput,
  throughYearMonth: string,
): Promise<Transaction[]> {
  assertYearMonth(throughYearMonth);
  const dates = seriesDates(input.date, throughYearMonth);
  const seriesId = newSeriesId(db, userId);
  const batch = writeBatch(db);
  const created: Transaction[] = [];

  for (const date of dates) {
    const ref = doc(transactionsCollection(db, userId));
    const body = denormalize({ ...input, date }, ref.id, seriesId);
    batch.set(ref, { ...body, createdAt: serverTimestamp() });
    created.push({ ...body, createdAt: Timestamp.now() });
  }

  await batch.commit();
  return created;
}

/** Every transaction in one recurring run, oldest first. */
export async function fetchTransactionSeries(
  db: Firestore,
  userId: string,
  seriesId: string,
): Promise<Transaction[]> {
  return runTransactionQuery(db, userId, [
    where('seriesId', '==', seriesId),
    orderBy('date', 'asc'),
  ]);
}

/** The ISO dates a series occupies — same day-of-month, clamped to short months. */
export function seriesDates(startDate: string, throughYearMonth: string): string[] {
  const day = Number(startDate.slice(8, 10));
  const dates: string[] = [startDate];
  let ym = toYearMonth(startDate);

  while (ym < throughYearMonth) {
    ym = shiftMonth(ym, 1);
    const daysIn = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
    dates.push(`${ym}-${String(Math.min(day, daysIn)).padStart(2, '0')}`);
  }
  return dates;
}

/** Changing `date` re-derives `yearMonth` and `year` in the same write. */
export async function updateTransaction(
  db: Firestore,
  userId: string,
  transactionId: string,
  patch: TransactionPatch,
): Promise<void> {
  const body: Record<string, unknown> = { ...patch };
  if (patch.date !== undefined) {
    body['yearMonth'] = toYearMonth(patch.date);
    body['year'] = toYear(patch.date);
  }
  await updateDoc(doc(transactionsCollection(db, userId), transactionId), body);
}

export async function deleteTransaction(
  db: Firestore,
  userId: string,
  transactionId: string,
): Promise<void> {
  await deleteDoc(doc(transactionsCollection(db, userId), transactionId));
}

/**
 * "This and future months" for a recurring entry: every document sharing the
 * run's `seriesId` from `fromDate` onward. Earlier months are left alone.
 * Returns the number of documents removed.
 */
export async function deleteTransactionSeries(
  db: Firestore,
  userId: string,
  key: TransactionSeriesKey,
): Promise<number> {
  const snap = await getDocs(
    query(
      transactionsCollection(db, userId),
      where('seriesId', '==', key.seriesId),
      where('date', '>=', key.fromDate),
      orderBy('date', 'asc'),
    ),
  );
  await deleteInBatches(db, snap.docs.map((d) => d.ref));
  return snap.size;
}

async function deleteInBatches(db: Firestore, refs: DocumentReference<DocumentData>[]): Promise<void> {
  const CHUNK = 400; // Firestore caps a batch at 500 writes.
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + CHUNK)) batch.delete(ref);
    await batch.commit();
  }
}

/* ----------------------------------------------------------------- budgets */

export async function fetchBudget(db: Firestore, userId: string, yearMonth: string): Promise<Budget> {
  assertYearMonth(yearMonth);
  const snap = await getDoc(doc(budgetsCollection(db, userId), yearMonth));
  return toBudget(yearMonth, snap.data());
}

/** One month's budget, live. Missing doc still yields a zeroed `Budget`. */
export function watchBudget(
  db: Firestore,
  userId: string,
  yearMonth: string,
  onChange: (budget: Budget) => void,
  onError?: (error: Error) => void,
): () => void {
  assertYearMonth(yearMonth);
  return onSnapshot(
    doc(budgetsCollection(db, userId), yearMonth),
    (snap) => onChange(toBudget(yearMonth, snap.data())),
    onError,
  );
}

/** Every budget doc of one calendar year, keyed by "YYYY-MM". */
export async function fetchBudgetsByYear(
  db: Firestore,
  userId: string,
  year: string,
): Promise<Record<string, Budget>> {
  const ids = monthsOfYear(year);
  const snap = await getDocs(budgetsCollection(db, userId));
  const found = new Map(snap.docs.map((d) => [d.id, toBudget(d.id, d.data())]));
  const out: Record<string, Budget> = {};
  for (const id of ids) out[id] = found.get(id) ?? toBudget(id, undefined);
  return out;
}

export async function saveBudget(db: Firestore, userId: string, budget: Budget): Promise<void> {
  assertYearMonth(budget.id);
  await setDoc(doc(budgetsCollection(db, userId), budget.id), budget, { merge: true });
}

/**
 * Both of these read the current budget first so a first write still produces
 * a complete `Budget` document. Writing only the field being changed would
 * leave `income` or `categoryBudgets` undefined on a brand-new doc, which
 * dashboard queries would then have to defend against.
 */
export async function setCategoryBudget(
  db: Firestore,
  userId: string,
  yearMonth: string,
  categoryId: string,
  amount: number,
): Promise<void> {
  const current = await fetchBudget(db, userId, yearMonth);
  await saveBudget(db, userId, {
    ...current,
    categoryBudgets: { ...current.categoryBudgets, [categoryId]: amount },
  });
}

export async function setIncome(
  db: Firestore,
  userId: string,
  yearMonth: string,
  income: number,
): Promise<void> {
  const current = await fetchBudget(db, userId, yearMonth);
  await saveBudget(db, userId, { ...current, income });
}

/* ----------------------------------------------------------------- profile */

export const DEFAULT_PROFILE: Profile = { displayName: '', currency: 'IDR', locale: 'id-ID' };

function toProfile(d: DocumentData | undefined): Profile {
  if (!d) return DEFAULT_PROFILE;
  return {
    displayName: String(d['displayName'] ?? DEFAULT_PROFILE.displayName),
    currency: String(d['currency'] ?? DEFAULT_PROFILE.currency),
    locale: String(d['locale'] ?? DEFAULT_PROFILE.locale),
  };
}

export async function fetchProfile(db: Firestore, userId: string): Promise<Profile> {
  const snap = await getDoc(profileDoc(db, userId));
  return toProfile(snap.data());
}

/** The profile doc, live. Absent doc yields `DEFAULT_PROFILE`, as on read. */
export function watchProfile(
  db: Firestore,
  userId: string,
  onChange: (profile: Profile) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    profileDoc(db, userId),
    (snap) => onChange(toProfile(snap.data())),
    onError,
  );
}

export async function saveProfile(db: Firestore, userId: string, profile: Partial<Profile>): Promise<void> {
  await setDoc(profileDoc(db, userId), profile, { merge: true });
}
