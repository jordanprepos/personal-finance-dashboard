import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
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

import {
  isAccountType,
  UNKNOWN_ACCOUNT_TYPE,
  isIncomeCadence,
  isIncomeKind,
  isPaymentMethod,
  MAX_INCOME_DAY,
} from '../types.js';
import type {
  Account,
  AccountInput,
  AccountPatch,
  AlertSettings,
  Budget,
  Category,
  CategoryInput,
  Income,
  PaymentMethod,
  Profile,
  WarnPct,
  Transaction,
  TransactionInput,
  TransactionPatch,
  TransactionSeriesKey,
} from '../types.js';
import {
  assertISODate,
  assertYearMonth,
  clampCycleStartDay,
  monthsOfYear,
  shiftMonth,
  toYear,
  toYearMonth,
} from './dates.js';
import { colorForName } from '../data/defaultCategories.js';
import {
  DEFAULT_DASHBOARD_CARDS,
  normalizeDashboardCards,
} from './dashboardCards.js';

/* ------------------------------------------------------------------ paths */

export const userPath = (userId: string): string => `users/${userId}`;

export const accountsCollection = (db: Firestore, userId: string): CollectionReference<DocumentData> =>
  collection(db, 'users', userId, 'accounts');

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
  // Same conditional-attach as `note`: omitted rather than stored as "". A
  // value outside the union (hand-written doc, retired method) reads as unset
  // rather than becoming a typed one.
  const paymentMethod = d['paymentMethod'];
  if (isPaymentMethod(paymentMethod)) tx.paymentMethod = paymentMethod;
  // Third axis, same conditional-attach. Not validated against the accounts
  // that exist — that would need a second read here; `lib/accounts.ts` matches
  // on live ids instead, so a stale one moves no balance.
  const accountId = d['accountId'];
  if (typeof accountId === 'string' && accountId !== '') tx.accountId = accountId;
  return tx;
}

/** The id given to the source synthesised from a pre-`incomes` document. */
export const LEGACY_INCOME_ID = 'legacy-income';

/**
 * The shape a source takes when the document says nothing about it.
 *
 * Chosen so a month written before cadence/kind/paused existed reads back with
 * exactly the income it had: monthly and not paused both mean "counts in full
 * this month", which is what the old single `amount` meant. A `quarterly` or
 * `paused` default would silently divide or erase a live account's income.
 */
const INCOME_DEFAULTS = {
  cadence: 'monthly',
  kind: 'fixed',
  day: 1,
  received: false,
  paused: false,
} as const;

/** Clamps a stored pay day into the range every month can honour. */
const toIncomeDay = (value: unknown): number => {
  const day = Math.trunc(Number(value));
  if (!Number.isFinite(day) || day < 1) return INCOME_DEFAULTS.day;
  return Math.min(MAX_INCOME_DAY, day);
};

function toIncome(value: unknown, i: number): Income {
  const d = (value ?? {}) as Record<string, unknown>;
  // Same narrowing as `paymentMethod` above: a value outside the union reads
  // as the default rather than becoming a typed one.
  const cadence = d['cadence'];
  const kind = d['kind'];
  const income: Income = {
    id: String(d['id'] ?? `income-${i}`),
    name: String(d['name'] ?? 'Income'),
    amount: Number(d['amount'] ?? 0),
    cadence: isIncomeCadence(cadence) ? cadence : INCOME_DEFAULTS.cadence,
    kind: isIncomeKind(kind) ? kind : INCOME_DEFAULTS.kind,
    day: 'day' in d ? toIncomeDay(d['day']) : INCOME_DEFAULTS.day,
    received: d['received'] === true,
    paused: d['paused'] === true,
  };
  const note = d['note'];
  if (typeof note === 'string' && note !== '') income.note = note;
  return income;
}

/**
 * The month's income sources, from whichever shape the document is in.
 *
 * A budget written before income became a list carries a single `income`
 * number and no array. Synthesising one source from it means every existing
 * month keeps its income without a migration pass — the same move
 * `colorForName` makes for the palette. Once anything writes `incomes` the
 * array wins, and `income` is never read again.
 *
 * Exported because this is the one piece of the mapper with a behaviour worth
 * pinning down: it is what stands between a live account and a blank income.
 */
export function resolveIncomes(stored: unknown, legacyIncome: number): Income[] {
  if (Array.isArray(stored)) return stored.map(toIncome);
  if (legacyIncome > 0) {
    return [{ id: LEGACY_INCOME_ID, name: 'Income', amount: legacyIncome, ...INCOME_DEFAULTS }];
  }
  return [];
}

function toBudget(id: string, d: DocumentData | undefined): Budget {
  const legacy = Number(d?.['income'] ?? 0);
  return {
    id,
    income: legacy,
    incomes: resolveIncomes(d?.['incomes'], legacy),
    categoryBudgets: (d?.['categoryBudgets'] ?? {}) as Record<string, number>,
  };
}

/* --------------------------------------------------------------- accounts */

/**
 * Narrowing, same rules as everything else read back here: a type outside the
 * union reads as `UNKNOWN_ACCOUNT_TYPE` (an asset — never `'other'`, which is
 * a liability and would invert the sign of every expense tagged to it), a
 * malformed number as 0, and a missing `balanceAsOf` as the empty string —
 * which `lib/accounts.ts` treats as stale, since a figure with no date
 * attached cannot be projected from.
 */
function toAccount(snap: QueryDocumentSnapshot<DocumentData>): Account {
  const d = snap.data();
  const type = d['type'];
  const num = (value: unknown): number => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    id: snap.id,
    name: String(d['name'] ?? ''),
    type: isAccountType(type) ? type : UNKNOWN_ACCOUNT_TYPE,
    balance: num(d['balance']),
    balanceAsOf: String(d['balanceAsOf'] ?? ''),
    limit: num(d['limit']),
    monthlyPayment: num(d['monthlyPayment']),
    order: num(d['order']),
  };
}

/** Shared by `fetchAccounts` and `watchAccounts`, so the two cannot disagree. */
const accountsQuery = (db: Firestore, userId: string) =>
  query(accountsCollection(db, userId), orderBy('order', 'asc'));

export async function fetchAccounts(db: Firestore, userId: string): Promise<Account[]> {
  const snap = await getDocs(accountsQuery(db, userId));
  return snap.docs.map(toAccount);
}

/** The accounts, live. Mirrors `fetchAccounts` and shares its mapper. */
export function watchAccounts(
  db: Firestore,
  userId: string,
  onChange: (accounts: Account[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(accountsQuery(db, userId), (snap) => onChange(snap.docs.map(toAccount)), onError);
}

export async function createAccount(
  db: Firestore,
  userId: string,
  input: AccountInput,
): Promise<Account> {
  const ref = doc(accountsCollection(db, userId));
  const account: Account = { ...input, id: ref.id };
  await setDoc(ref, account);
  return account;
}

export async function updateAccount(
  db: Firestore,
  userId: string,
  accountId: string,
  patch: AccountPatch,
): Promise<void> {
  await updateDoc(doc(accountsCollection(db, userId), accountId), patch);
}

/**
 * Confirms what the account actually holds, as of a date.
 *
 * Its own write rather than a two-field `updateAccount`, because the pair is
 * meaningless apart: a balance without the day it was true cannot be projected
 * from, and moving one without the other silently invents history.
 */
export async function reconcileAccount(
  db: Firestore,
  userId: string,
  accountId: string,
  balance: number,
  asOf: string,
): Promise<void> {
  assertISODate(asOf);
  await updateDoc(doc(accountsCollection(db, userId), accountId), { balance, balanceAsOf: asOf });
}

/**
 * Hard delete, unlike a category's soft `archived`.
 *
 * The transactions that named this account are deliberately **not** rewritten:
 * `accountId` is omitted-when-unset, so a stale id already reads as
 * unattributed and moves no balance. Rewriting a year of documents to tidy a
 * field that is inert would be the more dangerous of the two.
 */
export async function deleteAccount(
  db: Firestore,
  userId: string,
  accountId: string,
): Promise<void> {
  await deleteDoc(doc(accountsCollection(db, userId), accountId));
}

/* ------------------------------------------------------------- categories */

/** Shared by `fetchCategories` and `watchCategories`, same reason as above. */
const categoriesQuery = (db: Firestore, userId: string) =>
  query(categoriesCollection(db, userId), orderBy('order', 'asc'));

export async function fetchCategories(db: Firestore, userId: string): Promise<Category[]> {
  const snap = await getDocs(categoriesQuery(db, userId));
  return snap.docs.map(toCategory);
}

export function watchCategories(
  db: Firestore,
  userId: string,
  onChange: (categories: Category[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    categoriesQuery(db, userId),
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

/**
 * Soft delete — keeps historical transactions readable.
 *
 * Not wired to any UI: the only delete path either app offers is the hard
 * `deleteCategory` below. Because nothing sets `archived`, the
 * `.filter(c => !c.archived)` guards in the views are currently no-ops kept
 * for the day this is offered.
 */
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
 * Calendar rollups — daily, monthly, yearly — are equality queries against the
 * denormalized `date`, `yearMonth` and `year` fields, which is what keeps
 * their composite indexes small.
 *
 * The one exception is the tracking cycle: a salary-to-salary window straddles
 * two calendar months, so it ranges over `date` instead (`rangeConstraints`
 * below). Ranging over the sort key alone needs no composite index, so this
 * costs nothing — but a rollup that *can* be an equality query still is one.
 */

/** Daily: `date == "YYYY-MM-DD"`. */
export async function fetchTransactionsByDate(
  db: Firestore,
  userId: string,
  date: string,
): Promise<Transaction[]> {
  return runTransactionQuery(db, userId, [where('date', '==', date), orderBy('createdAt', 'desc')]);
}

/*
 * One definition per rollup, shared by the `fetch*` and `watch*` pair below.
 * Written out twice, the ordering could drift between them and the live rows
 * would sort differently from anything that re-read the same month.
 */
const monthConstraints = (yearMonth: string): QueryConstraint[] => {
  assertYearMonth(yearMonth);
  return [where('yearMonth', '==', yearMonth), orderBy('date', 'desc')];
};

const yearConstraints = (year: string): QueryConstraint[] => [
  where('year', '==', year),
  orderBy('date', 'desc'),
];

/*
 * A tracking cycle straddles two calendar months, so it cannot be an equality
 * query on `yearMonth` — it is a window on `date`. Ranging over a single field
 * that is also the sort key needs only the automatic index Firestore keeps for
 * `date`, so this adds nothing to `firestore.indexes.json`; the equality
 * rollups above and their composite indexes are untouched.
 */
const rangeConstraints = (from: string, to: string): QueryConstraint[] => {
  assertISODate(from);
  assertISODate(to);
  return [where('date', '>=', from), where('date', '<=', to), orderBy('date', 'desc')];
};

/** Monthly: `yearMonth == "YYYY-MM"`. */
export async function fetchTransactionsByMonth(
  db: Firestore,
  userId: string,
  yearMonth: string,
): Promise<Transaction[]> {
  return runTransactionQuery(db, userId, monthConstraints(yearMonth));
}

/** Yearly: `year == "YYYY"`. */
export async function fetchTransactionsByYear(
  db: Firestore,
  userId: string,
  year: string,
): Promise<Transaction[]> {
  return runTransactionQuery(db, userId, yearConstraints(year));
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

/**
 * Everything paid one way — the reconciliation read ("all card spend in
 * August", to check against a statement).
 *
 * Deliberately orthogonal to the category rollups: it filters on
 * `paymentMethod` alone and never touches `categoryId`, so its total is not a
 * slice of any category total and the two can be compared independently.
 *
 * Omitting `yearMonth` reads every month. Documents with no `paymentMethod` —
 * every row written before the field existed — match no value, by design.
 *
 * Needs the composite indexes in `firebase/firestore.indexes.json`
 * (`paymentMethod, date` and `yearMonth, paymentMethod, date`); deploy them
 * before the first live call.
 */
export async function fetchTransactionsByPaymentMethod(
  db: Firestore,
  userId: string,
  paymentMethod: PaymentMethod,
  yearMonth?: string,
): Promise<Transaction[]> {
  const constraints: QueryConstraint[] = [where('paymentMethod', '==', paymentMethod)];
  if (yearMonth !== undefined) {
    assertYearMonth(yearMonth);
    constraints.push(where('yearMonth', '==', yearMonth));
  }
  constraints.push(orderBy('date', 'desc'));
  return runTransactionQuery(db, userId, constraints);
}

export async function fetchRecentTransactions(
  db: Firestore,
  userId: string,
  count = 25,
): Promise<Transaction[]> {
  return runTransactionQuery(db, userId, [orderBy('date', 'desc'), limit(count)]);
}

/** Every transaction in an inclusive date window — the cycle read. */
export async function fetchTransactionsInRange(
  db: Firestore,
  userId: string,
  from: string,
  to: string,
): Promise<Transaction[]> {
  return runTransactionQuery(db, userId, rangeConstraints(from, to));
}

export function watchTransactionsInRange(
  db: Firestore,
  userId: string,
  from: string,
  to: string,
  onChange: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return watchTransactionQuery(db, userId, rangeConstraints(from, to), onChange, onError);
}

export function watchTransactionsByMonth(
  db: Firestore,
  userId: string,
  yearMonth: string,
  onChange: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return watchTransactionQuery(db, userId, monthConstraints(yearMonth), onChange, onError);
}

/** Yearly, live. Mirrors `fetchTransactionsByYear`. */
export function watchTransactionsByYear(
  db: Firestore,
  userId: string,
  year: string,
  onChange: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return watchTransactionQuery(db, userId, yearConstraints(year), onChange, onError);
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
    // Independent of `categoryId` — passed straight through, never inferred
    // from it and never used to pick one. Omitted when unset, like `note`.
    ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    // Which pot it came out of. Independent of both fields above, omitted when
    // unset, and — like them — this line has a twin in `seedSource.build` that
    // must be changed with it, or the field vanishes in seed mode only.
    ...(input.accountId ? { accountId: input.accountId } : {}),
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

/**
 * Changing `date` re-derives `yearMonth` and `year` in the same write.
 *
 * `paymentMethod` is optional and stored by omission, so clearing it has to
 * remove the field rather than write `undefined` — which Firestore rejects.
 * A patch that carries the key with no value means "unset"; a patch that omits
 * the key entirely leaves whatever is stored alone.
 */
export async function updateTransaction(
  db: Firestore,
  userId: string,
  transactionId: string,
  patch: TransactionPatch,
): Promise<void> {
  const body: Record<string, unknown> = { ...patch };
  if ('paymentMethod' in patch && !patch.paymentMethod) {
    body['paymentMethod'] = deleteField();
  }
  // Same contract: a patch carrying the key with no value means "unset", one
  // omitting it means "leave alone". Writing `undefined` would throw.
  if ('accountId' in patch && !patch.accountId) {
    body['accountId'] = deleteField();
  }
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

/**
 * Replaces the month's income sources.
 *
 * Whole-list writes rather than per-source edits: `incomes` is an array, and
 * a merge replaces an array outright instead of merging it element-wise, so
 * add, edit and delete are all the same write. Reading the budget first keeps
 * a concurrent allocation change from being clobbered, as above.
 */
export async function setIncomes(
  db: Firestore,
  userId: string,
  yearMonth: string,
  incomes: Income[],
): Promise<void> {
  const current = await fetchBudget(db, userId, yearMonth);
  await saveBudget(db, userId, { ...current, incomes });
}

/* ----------------------------------------------------------------- profile */

export const DEFAULT_ALERTS: AlertSettings = {
  enabled: true,
  monthlyLimit: 8_000_000,
  warnPct: 80,
  categoryLimits: {},
};

/** Fresh copy — `categoryLimits` is mutable and must not be shared. */
export const defaultAlerts = (): AlertSettings => ({ ...DEFAULT_ALERTS, categoryLimits: {} });

export const DEFAULT_PROFILE: Profile = {
  displayName: '',
  currency: 'IDR',
  locale: 'id-ID',
  alerts: DEFAULT_ALERTS,
  // Calendar months. A document written before the field existed reads back as
  // this, so an older account's periods are exactly what they were.
  cycleStartDay: 1,
  dashboardCards: [...DEFAULT_DASHBOARD_CARDS],
};

const isWarnPct = (value: number): value is WarnPct =>
  value === 70 || value === 80 || value === 90;

function toCategoryLimits(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, number> = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    const amount = Number(raw);
    // A zero or malformed cap is the same as no cap; dropping it here keeps
    // the settings list from showing a row that can never fire.
    if (Number.isFinite(amount) && amount > 0) out[name] = amount;
  }
  return out;
}

function toAlerts(d: unknown): AlertSettings {
  if (typeof d !== 'object' || d === null) return defaultAlerts();
  const raw = d as Record<string, unknown>;
  const warnPct = Number(raw['warnPct'] ?? DEFAULT_ALERTS.warnPct);
  return {
    enabled: typeof raw['enabled'] === 'boolean' ? raw['enabled'] : DEFAULT_ALERTS.enabled,
    // `?? ` and not `||`: 0 is "unset", a value the user can choose, and
    // falling back to the default there would silently re-arm the cap.
    monthlyLimit: Number(raw['monthlyLimit'] ?? DEFAULT_ALERTS.monthlyLimit),
    warnPct: isWarnPct(warnPct) ? warnPct : DEFAULT_ALERTS.warnPct,
    categoryLimits: toCategoryLimits(raw['categoryLimits']),
  };
}

/**
 * The account's dashboard cards.
 *
 * Absent and empty are deliberately **not** the same. No field at all is an
 * account that predates cards, and gets the starter set so its dashboard is
 * populated on first sight — the same no-migration trick `resolveIncomes` and
 * `colorForName` play. A stored `[]` is someone who removed every card, and
 * re-seeding it would put back what they just cleared, on every snapshot.
 */
function resolveDashboardCards(stored: unknown): string[] {
  if (Array.isArray(stored)) return normalizeDashboardCards(stored);
  return [...DEFAULT_DASHBOARD_CARDS];
}

function toProfile(d: DocumentData | undefined): Profile {
  if (!d) {
    return { ...DEFAULT_PROFILE, alerts: defaultAlerts(), dashboardCards: resolveDashboardCards(undefined) };
  }
  return {
    displayName: String(d['displayName'] ?? DEFAULT_PROFILE.displayName),
    currency: String(d['currency'] ?? DEFAULT_PROFILE.currency),
    locale: String(d['locale'] ?? DEFAULT_PROFILE.locale),
    alerts: toAlerts(d['alerts']),
    // Same narrowing rule as `toIncomeDay`: anything outside the range reads
    // as the default rather than becoming a period nobody can navigate to.
    cycleStartDay: clampCycleStartDay(Number(d['cycleStartDay'] ?? DEFAULT_PROFILE.cycleStartDay)),
    dashboardCards: resolveDashboardCards(d['dashboardCards']),
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

/**
 * Replaces the account's alert settings.
 *
 * `categoryLimits` is a map, and `merge: true` merges maps key by key — so a
 * plain write adds and updates caps but can never remove one, and "Clear"
 * would appear to work until the next snapshot arrived. The cleared keys are
 * therefore named explicitly with `deleteField()`, which means reading the
 * stored settings first to know which keys went away.
 */
/**
 * Sets the day a tracking cycle opens on. A plain profile field write — the
 * period is resolved from it at read time, so nothing stored on a transaction
 * changes and the day can move again later without a migration.
 */
export async function saveCycleStartDay(
  db: Firestore,
  userId: string,
  cycleStartDay: number,
): Promise<void> {
  await setDoc(profileDoc(db, userId), { cycleStartDay: clampCycleStartDay(cycleStartDay) }, { merge: true });
}

/**
 * Replaces the account's dashboard card list.
 *
 * A whole-list write, for the reason `setIncomes` is one: `merge: true`
 * replaces an array outright rather than merging it element-wise, so add,
 * remove and reorder are all the same write. Ids are narrowed on the way in,
 * so nothing outside the registry is ever stored.
 */
export async function saveDashboardCards(
  db: Firestore,
  userId: string,
  cards: readonly string[],
): Promise<void> {
  await setDoc(
    profileDoc(db, userId),
    { dashboardCards: normalizeDashboardCards(cards) },
    { merge: true },
  );
}

export async function saveAlerts(
  db: Firestore,
  userId: string,
  alerts: AlertSettings,
): Promise<void> {
  const current = await fetchProfile(db, userId);
  const limits: Record<string, number | ReturnType<typeof deleteField>> = { ...alerts.categoryLimits };
  for (const name of Object.keys(current.alerts.categoryLimits)) {
    if (!(name in alerts.categoryLimits)) limits[name] = deleteField();
  }
  await setDoc(
    profileDoc(db, userId),
    { alerts: { ...alerts, categoryLimits: limits } },
    { merge: true },
  );
}
