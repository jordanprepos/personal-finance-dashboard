import type { Budget, Category, Income } from '../types.js';

/**
 * Carrying a month's plan forward — the income sources and the category
 * allocations a new period would otherwise start without.
 *
 * Both live on `budgets/{yearMonth}`, and nothing copies them on its own: a
 * period is opened by navigating to it, and writing a budget document for
 * every month someone steps past would be the app seeding itself. So it is a
 * button, and this is the one definition of what that button writes. Both data
 * sources call it, so demo mode and the live path cannot disagree about it.
 *
 * It **fills gaps and never overwrites**:
 *
 * - Income is copied only when the target has no sources at all. A month
 *   holding only the legacy `income` number already has one (it resolves to a
 *   source), and a month whose sources are all paused still has them.
 * - An allocation is copied only where the target has no key for that
 *   category (`unsetAllocationIds`). A stored `0` is someone clearing it, and
 *   is left alone.
 *
 * Income and allocations are **found separately**. A month can hold one
 * without the other — setting an allocation on a month with no income writes
 * its budget document with an empty income list — and taking both from one
 * month would then copy no income even though an earlier month had some.
 *
 * Allocations are found **per category**: each gap takes that category's
 * value from the latest earlier month with a key for it. A month someone only
 * half-filled would otherwise be the source for everything, and its gaps would
 * stay gaps. A key holding 0 there is a decision, so it stops the search for
 * that category and nothing is copied.
 */

/** Which earlier months were copied from, and what came across. */
export interface CarryOverResult {
  /** "YYYY-MM" the income sources came from; null when none was found */
  incomesFrom: string | null;
  /** every "YYYY-MM" a copied allocation came from, newest first */
  allocationsFrom: string[];
  /** whether any earlier month held income or an allocation at all */
  foundEarlier: boolean;
  incomes: number;
  allocations: number;
}

/** Where each half of a plan would come from. */
export interface PlanSources {
  /** the latest earlier month holding income to carry */
  incomes: Budget | null;
  /** per category, its latest earlier allocation above 0 and the month it is from */
  allocations: Map<string, { amount: number; from: string }>;
}

/**
 * A one-off payment belongs to the month it landed in, so it is not carried.
 * A quarterly one is: its amount is per payment and it counts for a third of
 * that in every month (`derive.monthlyAmount`).
 */
const carriesIncome = (income: Income): boolean => income.cadence !== 'one_off';

/**
 * Where `target`'s gaps would be filled from, out of a set of stored budgets:
 * the latest earlier month with income to carry, and per category the latest
 * earlier month with a key for it. The read is the caller's, so the same
 * search serves both data sources.
 */
export function planSourcesBefore(
  target: string,
  budgets: readonly Budget[],
  categoryIds: readonly string[],
): PlanSources {
  const earlier = budgets.filter((b) => b.id < target).sort((a, b) => (a.id < b.id ? 1 : -1));
  const allocations = new Map<string, { amount: number; from: string }>();
  for (const id of categoryIds) {
    const latest = earlier.find((b) => id in b.categoryBudgets);
    const amount = latest?.categoryBudgets[id] ?? 0;
    if (latest && amount > 0) allocations.set(id, { amount, from: latest.id });
  }
  return {
    incomes: earlier.find((b) => b.incomes.some(carriesIncome)) ?? null,
    allocations,
  };
}

/**
 * The categories with **no** allocation key for the month — the gaps a carry
 * can fill. A key holding 0 is not a gap: it was cleared on purpose.
 *
 * The one test of "unset" every surface uses — the Categories manager's copy
 * prompt and the phone's Month-tab link — so a prompt is never offered for a
 * month the carry would then report as having nothing to copy.
 */
export function unsetAllocationIds(
  categories: readonly Pick<Category, 'id'>[],
  categoryBudgets: Readonly<Record<string, number>>,
): string[] {
  return categories.filter((c) => !(c.id in categoryBudgets)).map((c) => c.id);
}

/**
 * `target` with each source's half of the plan filled into its gaps.
 *
 * Copied sources keep their settings — paused stays paused — but none has
 * landed yet in the new month, so `received` is reset. Only categories in
 * `categoryIds` are carried; an allocation for a deleted category would be
 * inert, and counting it would overstate what was copied.
 *
 * The legacy `income` number is never copied: it is a fallback for documents
 * written before `incomes` existed, and the target gets a real list instead.
 */
export function fillPlanGaps(
  target: Budget,
  sources: PlanSources,
  categoryIds: readonly string[],
): { budget: Budget; incomes: number; allocations: number; allocationsFrom: string[] } {
  const copyIncomes = target.incomes.length === 0 && sources.incomes !== null;
  const incomes = copyIncomes
    ? sources.incomes!.incomes.filter(carriesIncome).map((i) => ({ ...i, received: false }))
    : target.incomes;

  const categoryBudgets = { ...target.categoryBudgets };
  const allocationsFrom = new Set<string>();
  for (const id of unsetAllocationIds(
    categoryIds.map((id) => ({ id })),
    target.categoryBudgets,
  )) {
    const found = sources.allocations.get(id);
    if (found) {
      categoryBudgets[id] = found.amount;
      allocationsFrom.add(found.from);
    }
  }

  return {
    budget: { ...target, incomes, categoryBudgets },
    incomes: copyIncomes ? incomes.length : 0,
    allocations: Object.keys(categoryBudgets).length - Object.keys(target.categoryBudgets).length,
    allocationsFrom: [...allocationsFrom].sort().reverse(),
  };
}

/**
 * The search and the fill together, for a data source holding every stored
 * budget: what both implementations of `carryOverBudget` do between their
 * read and their write.
 */
export function carryOverPlan(
  yearMonth: string,
  stored: readonly Budget[],
  target: Budget,
  categoryIds: readonly string[],
): { result: CarryOverResult; budget: Budget | null } {
  const sources = planSourcesBefore(yearMonth, stored, categoryIds);
  const filled = fillPlanGaps(target, sources, categoryIds);
  const changed = filled.incomes > 0 || filled.allocations > 0;
  return {
    result: {
      incomesFrom: sources.incomes?.id ?? null,
      allocationsFrom: filled.allocationsFrom,
      foundEarlier: sources.incomes !== null || sources.allocations.size > 0,
      incomes: filled.incomes,
      allocations: filled.allocations,
    },
    budget: changed ? filled.budget : null,
  };
}
