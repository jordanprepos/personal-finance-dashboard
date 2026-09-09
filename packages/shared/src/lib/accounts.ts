import { isLiabilityAccount, type Account, type Transaction } from '../types.js';
import { daysBetween, monthsOfYear, yearOfMonth } from './dates.js';
import { colorForOrder } from '../data/defaultCategories.js';

/**
 * Account balances — confirmed, then projected.
 *
 * This sits above `derive.ts` the way `dashboardCards.ts` does, and adds no
 * spending arithmetic: it answers "what is left in each pot", which is a
 * different question from "what did this period cost".
 *
 * **A balance here is not derived, and cannot be.** The identity is
 * `opening + income − expenses ± transfers`, and three of those four terms do
 * not exist in this app: there are no opening balances, no transfers, and
 * income is a plan on `budgets/{yearMonth}.incomes` rather than a set of
 * transactions. So the account document stores a figure you confirmed against
 * the bank plus the day it was true, and everything below projects forward
 * from there using the expenses you tagged.
 *
 * Two consequences worth holding on to:
 *
 * - **Balances only ever move down between reconciliations.** Money arriving
 *   is invisible, so the honest rule is "reconcile when money comes in, watch
 *   it fall as you spend". Crediting income to its destination account was
 *   considered and rejected: without transfers the app would credit a payroll
 *   account the whole salary and never see the money moved straight out of it,
 *   so the figure would read high until the next reconcile — worse than a
 *   figure that is knowably a floor.
 * - **The projection is only as good as what was logged.** Bank fees,
 *   interest, auto-debits and any expense left unrecorded all push it off.
 *   `stale` below is the guard against the worst version of that, but nothing
 *   can guard against an expense that was never entered — which is why every
 *   surface shows `reconciledOn` beside the figure.
 */

/** Colour for an account's row and bar — by `order`, like a category off-template. */
export const accountColor = (account: Account): string => colorForOrder(account.order);

export interface AccountBalance {
  account: Account;
  /** the figure last confirmed against the bank */
  reconciled: number;
  /** ISO date `reconciled` was true */
  reconciledOn: string;
  /** tagged expenses dated on or after `reconciledOn`, within the loaded window */
  spentSince: number;
  /** how many entries that was */
  entryCount: number;
  /**
   * `reconciled - spentSince` — what the account should hold now.
   *
   * For a liability the sign convention is the same as everywhere else in this
   * app: `balance` is what is owed, and spending on the card *increases* it.
   * See `projectedFor` below.
   */
  projected: number;
  /** whole days since the reconciliation; 0 on the day itself */
  ageInDays: number;
  /**
   * The projection cannot be trusted, so the surfaces show `reconciled` with a
   * prompt instead. Two ways to get here, and both are about the window:
   *
   * - the reconciliation predates the window's start, so movements between the
   *   two are invisible; or
   * - the window ends before `today`, which is what viewing a **past year**
   *   means — every movement since then is outside it, so the projection
   *   collapses back to the confirmed figure and would otherwise be presented
   *   as a current balance.
   */
  stale: boolean;
  /**
   * Credit cards: how much of the limit is drawn, 0-1. `0` when no limit is set.
   *
   * Taken from the **shown** figure, not from `projected` — a stale row prints
   * `reconciled`, and a percentage derived from the other one would contradict
   * the amounts printed beside it. `accountTotals` sums the same figure.
   */
  utilisation: number;
  color: string;
}

/**
 * A liability's balance grows as you spend against it, where an asset's
 * shrinks. One line, isolated here so no caller has to remember the sign.
 */
const projectedFor = (account: Account, spentSince: number): number =>
  isLiabilityAccount(account.type)
    ? account.balance + spentSince
    : account.balance - spentSince;

const safeDiv = (a: number, b: number): number => (b > 0 ? a / b : 0);

/**
 * Balances for every account, in `order`.
 *
 * `transactions` should be the widest window the snapshot carries —
 * `state.yearTransactions`, the twelve periods of the year in view. That is
 * what makes a reconciliation from several periods back still project
 * correctly; anything the window cannot see is reported `stale` rather than
 * silently under-counted.
 *
 * `windowStart` and `windowEnd` are the first and last day the caller can see.
 * **Both** are needed, and passing only the start is the bug this signature
 * exists to prevent: with a window that ends before `today` — which is exactly
 * what viewing a past year means — every movement since the reconciliation
 * falls outside it, `spentSince` collapses to 0, and the confirmed figure gets
 * presented as a current balance. Pass the year in view;
 * `accountBalancesForYear` does that for you.
 */
export function accountBalances(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  today: string,
  windowStart: string,
  windowEnd: string,
): AccountBalance[] {
  // One pass over the transactions rather than one per account: a year's rows
  // times a dozen accounts is a lot of scanning to repeat.
  const spent = new Map<string, { total: number; count: number }>();
  const live = new Set(accounts.map((a) => a.id));
  const asOf = new Map(accounts.map((a) => [a.id, a.balanceAsOf]));

  for (const t of transactions) {
    const id = t.accountId;
    // An id naming a deleted account moves nothing — the same rule that lets a
    // retired `paymentMethod` read as unset rather than throwing.
    if (id === undefined || !live.has(id)) continue;
    // Only what happened after the figure was confirmed; anything on or before
    // it is already baked into the number the user typed.
    const from = asOf.get(id);
    if (from !== undefined && from !== '' && t.date < from) continue;
    const bucket = spent.get(id) ?? { total: 0, count: 0 };
    bucket.total += t.amount;
    bucket.count += 1;
    spent.set(id, bucket);
  }

  return accounts
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((account) => {
      const { total, count } = spent.get(account.id) ?? { total: 0, count: 0 };
      const projected = projectedFor(account, total);
      const reconciledOn = account.balanceAsOf;
      const stale =
        // No date at all: we cannot tell what the figure already includes, so
        // projecting from it would be a guess.
        reconciledOn === '' ||
        // Movements before the window opened are invisible.
        reconciledOn < windowStart ||
        // Movements after it closed are too — this is the past-year case, and
        // it is the one that would otherwise read as a confident wrong number
        // rather than as an obviously missing one.
        windowEnd < today;
      return {
        account,
        reconciled: account.balance,
        reconciledOn,
        spentSince: total,
        entryCount: count,
        projected,
        ageInDays: reconciledOn ? Math.max(0, daysBetween(reconciledOn, today)) : 0,
        stale,
        // The figure the surfaces actually print, so the bar and the amount
        // beside it cannot disagree.
        utilisation: safeDiv(stale ? account.balance : projected, account.limit),
        color: accountColor(account),
      };
    });
}

/** The first day the year in view covers — the projection's horizon. */
export const yearWindowStart = (yearMonth: string): string =>
  `${monthsOfYear(yearOfMonth(yearMonth))[0] as string}-01`;

/** The last day of it. Together with the start, what the snapshot can see. */
export const yearWindowEnd = (yearMonth: string): string => `${yearOfMonth(yearMonth)}-12-31`;

/** `accountBalances` against the year the period in view sits in. */
export const accountBalancesForYear = (
  accounts: readonly Account[],
  yearTransactions: readonly Transaction[],
  today: string,
  yearMonth: string,
): AccountBalance[] =>
  accountBalances(
    accounts,
    yearTransactions,
    today,
    yearWindowStart(yearMonth),
    yearWindowEnd(yearMonth),
  );

export interface AccountTotals {
  /** what the asset accounts hold */
  assets: number;
  /** what the liability accounts owe — a positive number */
  liabilities: number;
  /** assets - liabilities */
  net: number;
  /** summed limits across cards that have one */
  creditLimit: number;
  /** what is drawn against those limits */
  creditUsed: number;
  /** `creditUsed / creditLimit`, 0-1; 0 when no limit is set anywhere */
  creditUtilisation: number;
  /** what leaves each period across cards and loans */
  monthlyDebtPayments: number;
  /** true when any balance in the set is too old to project from */
  anyStale: boolean;
}

/**
 * The asset/liability split, plus the credit figures the Credit cards want.
 *
 * A stale account still contributes its **reconciled** figure rather than its
 * projection, so one neglected account skews the total by however much it has
 * drifted rather than by a number built on a window that could not see it.
 */
export function accountTotals(balances: readonly AccountBalance[]): AccountTotals {
  let assets = 0;
  let liabilities = 0;
  let creditLimit = 0;
  let creditUsed = 0;
  let monthlyDebtPayments = 0;
  let anyStale = false;

  for (const b of balances) {
    // Every account counts. There is deliberately no `archived` flag: nothing
    // would set it, and a totals function that skipped rows the list still
    // rendered would drop an account out of "net" while it sat there in plain
    // sight. Removing an account is a hard delete instead.
    const figure = b.stale ? b.reconciled : b.projected;
    if (b.stale) anyStale = true;

    if (isLiabilityAccount(b.account.type)) {
      liabilities += figure;
      monthlyDebtPayments += b.account.monthlyPayment;
      if (b.account.limit > 0) {
        creditLimit += b.account.limit;
        creditUsed += figure;
      }
    } else {
      assets += figure;
    }
  }

  return {
    assets,
    liabilities,
    net: assets - liabilities,
    creditLimit,
    creditUsed,
    creditUtilisation: safeDiv(creditUsed, creditLimit),
    monthlyDebtPayments,
    anyStale,
  };
}

/** Index for looking an account up by id, mirroring `indexCategories`. */
export const indexAccounts = (accounts: readonly Account[]): Map<string, Account> =>
  new Map(accounts.map((a) => [a.id, a]));

/**
 * One past the highest `order` in use.
 *
 * Never `accounts.length`: with A(0) B(1) C(2), deleting B leaves length 2, so
 * the next account also takes 2 — two accounts sharing a colour slot and a tie
 * under the sort. Deleting deliberately does not renumber the survivors, for
 * the same reason categories do not: colour derives from `order`, so every
 * remaining account would change colour whenever one was removed.
 */
export const nextAccountOrder = (accounts: readonly Account[]): number =>
  accounts.reduce((highest, a) => Math.max(highest, a.order), -1) + 1;
