import { isLiabilityAccount, type Budget, type Category, type Transaction } from '../types.js';
import { accountTotals, type AccountBalance } from './accounts.js';
import { cycleRangeLabel, monthLabel, shortDayLabel, yearOfMonth } from './dates.js';
import { formatMoney, formatPercent, type MoneyFormat } from './format.js';
import {
  bucketByMonth,
  categoryOf,
  categoryTotals,
  donutSegments,
  envelopesByType,
  expectedIncome,
  incomeBreakdown,
  incomeEmptyState,
  indexCategories,
  monthSummary,
  pace,
  recurringThisMonth,
  sumAmounts,
  totalIncome,
  yearBars,
  yearSummary,
  type DonutSegment,
  type YearBar,
} from './derive.js';

/**
 * The dashboard card catalog: what a card is, and what it shows.
 *
 * This sits *above* `derive.ts` and adds no arithmetic of its own — every
 * figure below comes out of a function already there. What it adds is
 * selection and shape: which cards exist, and a small presentation vocabulary
 * the two front ends can render without each one re-deciding how a category
 * row or an income bar should look.
 *
 * It stays free of JSX for the same reason the rest of `shared` does. The
 * registry is data; the components that draw it live in the design system.
 *
 * **Cards are scoped to the period in view, never to a rolling window.**
 * `watchMonth` is deliberately the only read on `ExpenseDataSource`, so a
 * "last 30 days" card would need either a new read on that interface or
 * client-side filtering of `yearTransactions` — which covers only the twelve
 * periods of the year in view, and so would silently truncate a window
 * straddling January. A period-scoped card reads exactly what the snapshot
 * already carries, and says which period it read in its own label.
 */

/* ------------------------------------------------------------------ groups */

export type DashboardCardGroup = 'cashflow' | 'spending' | 'reports' | 'credit';

/** Tab order in the picker. */
export const DASHBOARD_CARD_GROUPS: readonly DashboardCardGroup[] = [
  'cashflow',
  'spending',
  'credit',
  'reports',
];

export const DASHBOARD_CARD_GROUP_LABELS: Record<DashboardCardGroup, string> = {
  cashflow: 'Cash-flow',
  spending: 'Spending',
  credit: 'Credit',
  reports: 'Reports',
};

/* ------------------------------------------------------------------- specs */

export const DASHBOARD_CARD_IDS = [
  'budget-left',
  'income-composition',
  'spending-pace',
  'income-expected',
  'top-categories',
  'category-donut',
  'envelope-status',
  'recurring-spend',
  'year-bars',
  'year-summary',
  'account-balances',
  'credit-utilisation',
  'card-utilisation',
  'debt-to-income',
  'recurring-debts',
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];

export interface DashboardCardSpec {
  id: DashboardCardId;
  title: string;
  /** what the card answers — the picker shows it under the title */
  question: string;
  group: DashboardCardGroup;
  /**
   * Which window the card reads. `period` is the salary cycle or calendar
   * month in view; `year` is the twelve periods labelled by its year;
   * `account` is a balance, which is a **now** rather than a window — those
   * cards are labelled with the day they were read, not with a period they
   * never consulted. Every reader of this field must handle all three:
   * `periodLabelFor` branches on each explicitly rather than falling through.
   */
  scope: 'period' | 'year' | 'account';
  /** how wide the card sits in the desktop grid */
  size: 'half' | 'full';
}

/**
 * Keyed by id rather than held as a list, so the compiler enforces that every
 * member of `DASHBOARD_CARD_IDS` actually has a spec. As two hand-maintained
 * lists they could drift, and a lookup would then miss for an id the type
 * system swore was fine — the same reason `BODIES` below is a `Record`.
 */
const SPECS: Record<DashboardCardId, DashboardCardSpec> = {
  'budget-left': {
    id: 'budget-left',
    title: 'Budget left',
    question: 'How much of this period’s income is still unspent?',
    group: 'cashflow',
    scope: 'period',
    size: 'half',
  },
  'income-composition': {
    id: 'income-composition',
    title: 'Income composition',
    question: 'Which sources is this period’s income actually coming from?',
    group: 'cashflow',
    scope: 'period',
    size: 'half',
  },
  'spending-pace': {
    id: 'spending-pace',
    title: 'Spending pace',
    question: 'Am I ahead of or behind an even burn for this period?',
    group: 'cashflow',
    scope: 'period',
    size: 'half',
  },
  'income-expected': {
    id: 'income-expected',
    title: 'Expected income',
    question: 'What has not landed yet this period?',
    group: 'cashflow',
    scope: 'period',
    size: 'half',
  },
  'top-categories': {
    id: 'top-categories',
    title: 'Top categories',
    question: 'Where is most of this period’s money going?',
    group: 'spending',
    scope: 'period',
    size: 'half',
  },
  'category-donut': {
    id: 'category-donut',
    title: 'Spending mix',
    question: 'How is this period’s spend split across categories?',
    group: 'spending',
    scope: 'period',
    size: 'half',
  },
  'envelope-status': {
    id: 'envelope-status',
    title: 'Envelopes at risk',
    question: 'Which allocations am I closest to blowing through?',
    group: 'spending',
    scope: 'period',
    size: 'half',
  },
  'recurring-spend': {
    id: 'recurring-spend',
    title: 'Recurring spend',
    question: 'What repeats every period, and what share of income is it?',
    group: 'spending',
    scope: 'period',
    size: 'half',
  },
  'year-bars': {
    id: 'year-bars',
    title: 'Spending by period',
    question: 'How do the twelve periods of this year compare?',
    group: 'reports',
    scope: 'year',
    size: 'full',
  },
  'year-summary': {
    id: 'year-summary',
    title: 'Year at a glance',
    question: 'What have I spent this year, on average and at its peak?',
    group: 'reports',
    scope: 'year',
    size: 'half',
  },
  'account-balances': {
    id: 'account-balances',
    title: 'Where the money is',
    question: 'What is sitting in each account right now?',
    group: 'cashflow',
    scope: 'account',
    size: 'half',
  },
  'credit-utilisation': {
    id: 'credit-utilisation',
    title: 'Credit used',
    question: 'How much of my total credit limit am I drawing on?',
    group: 'credit',
    scope: 'account',
    size: 'half',
  },
  'card-utilisation': {
    id: 'card-utilisation',
    title: 'Utilisation by card',
    question: 'Which card is closest to its limit?',
    group: 'credit',
    scope: 'account',
    size: 'half',
  },
  'debt-to-income': {
    id: 'debt-to-income',
    title: 'Debt to income',
    question: 'How much of this period’s income is already spoken for by debt?',
    group: 'credit',
    // Deliberately period-scoped where its four neighbours are account-scoped:
    // the numerator is a standing monthly figure, but the denominator is the
    // income of the period in view, and that moves. Labelling it "as of today"
    // would hide which period's income the ratio was taken against.
    scope: 'period',
    size: 'half',
  },
  'recurring-debts': {
    id: 'recurring-debts',
    title: 'Debt payments',
    question: 'What leaves for cards and loans every period?',
    group: 'credit',
    scope: 'account',
    size: 'half',
  },
};

/** The catalog in registry order — what the picker iterates. */
export const DASHBOARD_CARDS: readonly DashboardCardSpec[] = DASHBOARD_CARD_IDS.map(
  (id) => SPECS[id],
);

/**
 * What a brand-new dashboard starts with.
 *
 * Only an account whose profile has *no* `dashboardCards` field falls back to
 * this — a stored empty array means "I removed them all" and is left alone.
 * See `toProfile` in `lib/queries.ts`.
 *
 * Deliberately none of the credit or account cards: a brand-new dashboard
 * belongs to someone who has not added an account yet, so seeding them would
 * open the app on four cards all saying nothing is set. They are in the picker
 * for the day there is something for them to read.
 */
export const DEFAULT_DASHBOARD_CARDS: readonly DashboardCardId[] = [
  'budget-left',
  'top-categories',
  'spending-pace',
  'recurring-spend',
];

/** Total over `DashboardCardId`, so this cannot miss and needs no cast. */
export const dashboardCardSpec = (id: DashboardCardId): DashboardCardSpec => SPECS[id];

export const cardsInGroup = (group: DashboardCardGroup): DashboardCardSpec[] =>
  DASHBOARD_CARDS.filter((c) => c.group === group);

/* --------------------------------------------------------------- narrowing */

/**
 * Same rule as `isPaymentMethod` and `toIncome`: a stored value outside the
 * known set reads as absent rather than becoming a card nothing can render.
 * A card removed from the registry in a later release therefore disappears
 * from an account that had it, instead of crashing its dashboard.
 */
export const isDashboardCardId = (value: unknown): value is DashboardCardId =>
  typeof value === 'string' && (DASHBOARD_CARD_IDS as readonly string[]).includes(value);

/** Drops unknown ids and duplicates, preserving the order the rest are in. */
export function normalizeDashboardCards(value: unknown): DashboardCardId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<DashboardCardId>();
  const out: DashboardCardId[] = [];
  for (const raw of value) {
    if (!isDashboardCardId(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/* ------------------------------------------------------------ presentation */

/**
 * One line in a card body — a category, an income source, an envelope, a
 * recurring charge. `share` is what draws the bar; a row without one is a
 * plain label/value pair.
 */
export interface DashboardCardRow {
  key: string;
  label: string;
  /** small secondary line — a date, an item count, an allocation */
  caption?: string;
  value: string;
  /** 0-1; when present the row draws a bar */
  share?: number;
  color?: string;
  /** draws in the danger tone — an envelope past its allocation */
  alert?: boolean;
}

/**
 * The four shapes every card in the catalog reduces to, so the design system
 * ships one card renderer rather than one per card. `DonutSegment` and `YearBar` are
 * `derive.ts`'s own geometry types — reused here rather than mirrored, so the
 * cards and the Monthly/Yearly views cannot disagree about an arc.
 */
export type DashboardCardBody =
  | { type: 'stat'; value: string; caption: string; progress?: number }
  | { type: 'rows'; rows: DashboardCardRow[]; footer?: { label: string; value: string }; empty: string }
  | {
      type: 'donut';
      segments: DonutSegment[];
      centerValue: string;
      centerCaption: string;
      rows: DashboardCardRow[];
      empty: string;
    }
  | { type: 'bars'; bars: YearBar[]; ceilingY: number; caption: string };

export interface DashboardCardView {
  spec: DashboardCardSpec;
  /** the window the figures came from — "August 2026 · 27 Aug – 26 Sep", or "2026" */
  periodLabel: string;
  body: DashboardCardBody;
}

/** Geometry the card bodies are drawn at. Exported so the svg can be sized to match. */
export const CARD_DONUT_RADIUS = 42;
export const CARD_CHART_WIDTH = 560;
export const CARD_CHART_HEIGHT = 150;
export const CARD_BAR_WIDTH = 26;

/** How many rows a list-shaped card shows before it stops. */
const MAX_ROWS = 6;

/**
 * Everything a card needs, which is exactly what the snapshot already holds.
 * Same inputs `derive.ts` takes, so nothing here reaches for a read.
 */
export interface DashboardCardContext {
  yearMonth: string;
  /** "YYYY-MM-DD" */
  today: string;
  cycleStartDay: number;
  categories: readonly Category[];
  monthTransactions: readonly Transaction[];
  yearTransactions: readonly Transaction[];
  /**
   * Balances, already projected — **not** the raw accounts.
   *
   * The same rule the rest of this file follows: it consumes what a lower
   * layer computed rather than re-deriving it. Handing the cards `accounts`
   * would have each of the five call `accountBalancesForYear` itself, which is
   * five passes over the same year of transactions and five chances to pass a
   * different `windowStart` — so the Credit tab could disagree with the
   * accounts sheet about what a card owes. `store.dashboardCardContext` calls
   * `accountBalancesOf` once.
   */
  balances: readonly AccountBalance[];
  budget: Budget | null;
  fmt: MoneyFormat;
}

/**
 * The window label. Month *names* stay en-US, matching `monthLabel` in the
 * month nav and the alert copy, while the amounts inside the card are
 * formatted in the profile's locale — the same split spending alerts make.
 */
function periodLabelFor(spec: DashboardCardSpec, ctx: DashboardCardContext): string {
  if (spec.scope === 'year') return yearOfMonth(ctx.yearMonth);
  // A balance is a now, not a window. Labelling one with the period in view
  // would claim it was read at a date it never consulted — and stepping the
  // month nav would relabel a figure that had not moved. Each branch is
  // explicit so a fourth scope cannot fall through to the period label.
  if (spec.scope === 'account') return `as of ${shortDayLabel(ctx.today)}`;
  const range = cycleRangeLabel(ctx.yearMonth, ctx.cycleStartDay);
  return range ? `${monthLabel(ctx.yearMonth)} · ${range}` : monthLabel(ctx.yearMonth);
}

/* ------------------------------------------------------------------ bodies */

function budgetLeftBody(ctx: DashboardCardContext): DashboardCardBody {
  const s = monthSummary(ctx.yearMonth, ctx.monthTransactions, ctx.budget, ctx.today);
  // With no income there is no share to take — show what was spent rather
  // than a percentage of zero, exactly as the Monthly hero card does.
  if (!s.hasIncome) {
    return {
      type: 'stat',
      value: formatMoney(s.spent, ctx.fmt),
      caption: 'spent so far — no income set for this period',
    };
  }
  return {
    type: 'stat',
    value: formatMoney(s.left, ctx.fmt),
    caption: `of ${formatMoney(s.income, ctx.fmt)} · ${formatPercent(s.leftShare)} remaining`,
    progress: s.spentShare,
  };
}

function incomeCompositionBody(ctx: DashboardCardContext): DashboardCardBody {
  const b = incomeBreakdown(ctx.budget);
  return {
    type: 'rows',
    rows: b.composition.slice(0, MAX_ROWS).map((s) => ({
      key: s.id,
      label: s.name,
      caption: s.received ? 'received' : `expected day ${s.day}`,
      value: formatMoney(s.monthly, ctx.fmt),
      share: s.share,
      color: s.color,
    })),
    footer: {
      label: b.pausedCount > 0 ? `Total income · ${b.pausedCount} paused` : 'Total income',
      value: b.total > 0 ? formatMoney(b.total, ctx.fmt) : '—',
    },
    // Same reasons as the Income expected card: with every source paused this
    // said "no sources" above its own "· 2 paused" footer. The fallback is
    // never shown — rows are empty exactly when no source is active.
    empty: incomeEmptyState(ctx.budget)?.label ?? '',
  };
}

function spendingPaceBody(ctx: DashboardCardContext): DashboardCardBody {
  const s = monthSummary(ctx.yearMonth, ctx.monthTransactions, ctx.budget, ctx.today);
  if (!s.hasIncome) {
    return {
      type: 'stat',
      value: '—',
      caption: 'set an income for this period to see a pace target',
    };
  }
  const p = pace(s, ctx.today, ctx.cycleStartDay);
  const when = p.closed ? 'over the whole period' : `by day ${p.throughDay}`;
  return {
    type: 'stat',
    value: formatMoney(p.delta, ctx.fmt),
    caption: `${p.under ? 'under' : 'over'} an even burn ${when} · target ${formatMoney(p.target, ctx.fmt)}`,
    // The bar has to be measured like the figure above it: `spentShare` would
    // fill for bills this card's own number has not counted yet.
    progress: s.spentShareToDate,
  };
}

function incomeExpectedBody(ctx: DashboardCardContext): DashboardCardBody {
  const expected = expectedIncome(ctx.budget, ctx.yearMonth, ctx.cycleStartDay);
  return {
    type: 'rows',
    rows: expected.upcoming.slice(0, MAX_ROWS).map((u) => ({
      key: u.id,
      label: u.name,
      caption: u.dateLabel,
      // The whole payment is what lands, even for a quarterly source whose
      // per-month contribution is a third of it.
      value: formatMoney(u.amount, ctx.fmt),
    })),
    // No "Still expected Rp 0" under an empty list: with nothing due it is a
    // total of nothing, and under "no active sources" it read as reassurance.
    footer: expected.empty
      ? undefined
      : { label: 'Still expected', value: formatMoney(expected.stillToLand, ctx.fmt) },
    // Why nothing is listed — the same decision the Income page and tab use.
    // The fallback is never shown: `empty` is set exactly when rows are empty.
    empty: expected.empty?.label ?? '',
  };
}

function topCategoriesBody(ctx: DashboardCardContext): DashboardCardBody {
  const totals = categoryTotals(ctx.monthTransactions, ctx.categories).filter((t) => t.total > 0);
  return {
    type: 'rows',
    rows: totals.slice(0, MAX_ROWS).map((t) => ({
      key: t.categoryId,
      label: t.name,
      caption: `${t.count} ${t.count === 1 ? 'item' : 'items'}`,
      value: formatMoney(t.total, ctx.fmt),
      share: t.share,
      color: t.color,
    })),
    footer: { label: 'Total spend', value: formatMoney(sumAmounts(ctx.monthTransactions), ctx.fmt) },
    empty: 'Nothing logged in this period yet.',
  };
}

function categoryDonutBody(ctx: DashboardCardContext): DashboardCardBody {
  const totals = categoryTotals(ctx.monthTransactions, ctx.categories);
  const segments = donutSegments(totals, { radius: CARD_DONUT_RADIUS });
  const top = totals.find((t) => t.total > 0) ?? null;
  return {
    type: 'donut',
    segments,
    centerValue: top ? formatPercent(top.share) : '0%',
    centerCaption: top ? `is ${top.name.split(' ')[0] ?? top.name}` : 'nothing yet',
    rows: segments.map((s) => ({
      key: s.categoryId,
      label: s.name,
      value: formatMoney(s.amount, ctx.fmt),
      color: s.color,
    })),
    empty: 'Nothing logged in this period yet.',
  };
}

function envelopeStatusBody(ctx: DashboardCardContext): DashboardCardBody {
  const all = [
    ...envelopesByType('fixed', ctx.categories, ctx.monthTransactions, ctx.budget),
    ...envelopesByType('variable', ctx.categories, ctx.monthTransactions, ctx.budget),
    ...envelopesByType('savings', ctx.categories, ctx.monthTransactions, ctx.budget),
  ];
  // An envelope with no allocation has nothing to be at risk of — `fill` is 0
  // for it either way, so including it would bury the ones that do.
  const atRisk = all
    .filter((e) => e.allocation > 0)
    .sort((a, b) => b.fill - a.fill || b.total - a.total);

  return {
    type: 'rows',
    rows: atRisk.slice(0, MAX_ROWS).map((e) => ({
      key: e.categoryId,
      label: e.name,
      caption: e.over
        ? `over by ${formatMoney(e.overBy, ctx.fmt)}`
        : `of ${formatMoney(e.allocation, ctx.fmt)}`,
      value: formatMoney(e.total, ctx.fmt),
      share: e.fill,
      color: e.color,
      alert: e.over,
    })),
    empty: 'No allocations set for this period yet.',
  };
}

function recurringSpendBody(ctx: DashboardCardContext): DashboardCardBody {
  const repeat = recurringThisMonth(ctx.monthTransactions);
  const s = monthSummary(ctx.yearMonth, ctx.monthTransactions, ctx.budget, ctx.today);
  const index = indexCategories(ctx.categories);

  return {
    type: 'rows',
    rows: repeat.transactions.slice(0, MAX_ROWS).map((t) => ({
      key: t.id,
      label: t.item,
      caption: categoryOf(index, t.categoryId).name,
      value: formatMoney(t.amount, ctx.fmt),
      share: repeat.total > 0 ? t.amount / repeat.total : undefined,
      color: categoryOf(index, t.categoryId).color,
    })),
    footer: {
      label: `Recurring · share of income`,
      // No income means no share to take — a dash, not 0% of nothing.
      value: s.hasIncome
        ? `${formatMoney(repeat.total, ctx.fmt)} · ${formatPercent(repeat.total / s.income)}`
        : `${formatMoney(repeat.total, ctx.fmt)} · —`,
    },
    empty: 'No recurring charges in this period.',
  };
}

function yearBarsBody(ctx: DashboardCardContext): DashboardCardBody {
  const year = yearOfMonth(ctx.yearMonth);
  const buckets = bucketByMonth(year, ctx.yearTransactions, undefined, ctx.cycleStartDay);
  const income = totalIncome(ctx.budget);
  const { bars, ceilingY } = yearBars(buckets, {
    chartWidth: CARD_CHART_WIDTH,
    chartHeight: CARD_CHART_HEIGHT,
    barWidth: CARD_BAR_WIDTH,
    ceiling: income,
    currentYearMonth: ctx.yearMonth,
  });
  return {
    type: 'bars',
    bars,
    ceilingY,
    caption:
      income > 0
        ? `Income line · ${formatMoney(income, ctx.fmt)}`
        : 'No income line — none set for this period',
  };
}

function yearSummaryBody(ctx: DashboardCardContext): DashboardCardBody {
  const year = yearOfMonth(ctx.yearMonth);
  const buckets = bucketByMonth(year, ctx.yearTransactions, undefined, ctx.cycleStartDay);
  const ys = yearSummary(year, buckets);
  return {
    type: 'rows',
    rows: [
      { key: 'total', label: `Spent in ${year}`, value: formatMoney(ys.total, ctx.fmt) },
      {
        key: 'average',
        label: 'Period average',
        caption: `${ys.activeMonths} ${ys.activeMonths === 1 ? 'period' : 'periods'} with spend`,
        value: formatMoney(Math.round(ys.average), ctx.fmt),
      },
      {
        key: 'peak',
        label: 'Biggest period',
        caption: ys.activeMonths > 0 ? monthLabel(ys.peakMonth) : undefined,
        value: formatMoney(ys.peak, ctx.fmt),
      },
    ],
    empty: `Nothing logged in ${year} yet.`,
  };
}

/* --------------------------------------------------------------- accounts */

/**
 * A balance's own provenance, as a row caption.
 *
 * Every account surface in this app shows when a figure was confirmed rather
 * than a bare number, because the projection drifts by exactly what was not
 * logged. A card is no exception — and a stale row shows the **reconciled**
 * figure, so without this caption it would silently be reporting a number from
 * months ago as if it were today's.
 */
const balanceCaption = (b: AccountBalance): string =>
  b.stale
    ? `confirmed ${b.reconciledOn || 'never'} — too far back to project from`
    : b.entryCount > 0
      ? `${b.reconciledOn} · ${b.entryCount} ${b.entryCount === 1 ? 'entry' : 'entries'} since`
      : `${b.reconciledOn} · nothing logged since`;

/** What a row should show: the projection, unless it cannot be trusted. */
const shownFigure = (b: AccountBalance): number => (b.stale ? b.reconciled : b.projected);

function accountBalancesBody(ctx: DashboardCardContext): DashboardCardBody {
  const assets = ctx.balances.filter((b) => !isLiabilityAccount(b.account.type));
  const total = assets.reduce((sum, b) => sum + shownFigure(b), 0);
  // Biggest pot first — the same rank-ordering the income composition bar uses,
  // and the order you actually scan a list of balances in.
  const rows = assets
    .slice()
    .sort((a, b) => shownFigure(b) - shownFigure(a))
    .slice(0, MAX_ROWS)
    .map((b) => ({
      key: b.account.id,
      label: b.account.name,
      caption: balanceCaption(b),
      value: formatMoney(shownFigure(b), ctx.fmt),
      share: total > 0 ? Math.max(0, shownFigure(b)) / total : undefined,
      color: b.color,
      alert: b.stale,
    }));
  return {
    type: 'rows',
    rows,
    footer: rows.length > 0 ? { label: 'Across accounts', value: formatMoney(total, ctx.fmt) } : undefined,
    empty: 'No accounts holding money yet. Add one and reconcile it to see this.',
  };
}

function creditUtilisationBody(ctx: DashboardCardContext): DashboardCardBody {
  const t = accountTotals(ctx.balances);
  // A limit of 0 is unset, not a limit of nothing — the rule
  // `AlertSettings.monthlyLimit` already follows, where an unset cap is silent
  // rather than permanently breached. `safeDiv` would hand back 0 here, which
  // reads identically to "nothing drawn against a real limit".
  if (t.creditLimit <= 0) {
    return {
      type: 'stat',
      value: '—',
      caption: 'No credit limit set on any account yet.',
    };
  }
  return {
    type: 'stat',
    value: formatPercent(t.creditUtilisation),
    caption: `${formatMoney(t.creditUsed, ctx.fmt)} drawn of ${formatMoney(t.creditLimit, ctx.fmt)}${
      t.anyStale ? ' · includes a balance too old to project from' : ''
    }`,
    progress: t.creditUtilisation,
  };
}

function cardUtilisationBody(ctx: DashboardCardContext): DashboardCardBody {
  const carded = ctx.balances.filter((b) => b.account.limit > 0);
  return {
    type: 'rows',
    // Closest to its limit first — the whole question the card asks.
    rows: carded
      .slice()
      .sort((a, b) => b.utilisation - a.utilisation)
      .slice(0, MAX_ROWS)
      .map((b) => ({
        key: b.account.id,
        label: b.account.name,
        caption: `${formatMoney(shownFigure(b), ctx.fmt)} of ${formatMoney(b.account.limit, ctx.fmt)}${
          b.stale ? ' · too old to project from' : ''
        }`,
        value: formatPercent(b.utilisation),
        share: Math.max(0, Math.min(1, b.utilisation)),
        color: b.color,
        // The same threshold the accounts sheet draws its bar in danger at, so
        // a card and the sheet cannot disagree about which card is a problem.
        alert: b.utilisation > 0.8,
      })),
    empty: 'No account has a credit limit yet. Add one to a card to see this.',
  };
}

function debtToIncomeBody(ctx: DashboardCardContext): DashboardCardBody {
  const t = accountTotals(ctx.balances);
  const income = totalIncome(ctx.budget);
  // Two different absences, and neither is a ratio of zero. No monthly payment
  // recorded anywhere is the unset-cap rule again; no income is the rule every
  // percentage in this app already follows — `—` rather than NaN or 0%.
  if (t.monthlyDebtPayments <= 0) {
    return {
      type: 'stat',
      value: '—',
      caption: 'No monthly payment set on any card or loan yet.',
    };
  }
  if (income <= 0) {
    return {
      type: 'stat',
      value: '—',
      caption: `${formatMoney(t.monthlyDebtPayments, ctx.fmt)} a period — no income set to measure it against`,
    };
  }
  const ratio = t.monthlyDebtPayments / income;
  return {
    type: 'stat',
    value: formatPercent(ratio),
    caption: `${formatMoney(t.monthlyDebtPayments, ctx.fmt)} of ${formatMoney(income, ctx.fmt)} income`,
    progress: Math.min(1, ratio),
  };
}

function recurringDebtsBody(ctx: DashboardCardContext): DashboardCardBody {
  // `monthlyPayment` of 0 is unset, so an account with a balance but no payment
  // recorded is left out rather than listed as costing nothing a period.
  const paying = ctx.balances.filter(
    (b) => isLiabilityAccount(b.account.type) && b.account.monthlyPayment > 0,
  );
  const total = paying.reduce((sum, b) => sum + b.account.monthlyPayment, 0);
  return {
    type: 'rows',
    rows: paying
      .slice()
      .sort((a, b) => b.account.monthlyPayment - a.account.monthlyPayment)
      .slice(0, MAX_ROWS)
      .map((b) => ({
        key: b.account.id,
        label: b.account.name,
        caption: `${formatMoney(shownFigure(b), ctx.fmt)} owed`,
        value: formatMoney(b.account.monthlyPayment, ctx.fmt),
        share: total > 0 ? b.account.monthlyPayment / total : undefined,
        color: b.color,
      })),
    footer: total > 0 ? { label: 'Every period', value: formatMoney(total, ctx.fmt) } : undefined,
    empty: 'No card or loan has a monthly payment set yet.',
  };
}

const BODIES: Record<DashboardCardId, (ctx: DashboardCardContext) => DashboardCardBody> = {
  'budget-left': budgetLeftBody,
  'income-composition': incomeCompositionBody,
  'spending-pace': spendingPaceBody,
  'income-expected': incomeExpectedBody,
  'top-categories': topCategoriesBody,
  'category-donut': categoryDonutBody,
  'envelope-status': envelopeStatusBody,
  'recurring-spend': recurringSpendBody,
  'year-bars': yearBarsBody,
  'year-summary': yearSummaryBody,
  'account-balances': accountBalancesBody,
  'credit-utilisation': creditUtilisationBody,
  'card-utilisation': cardUtilisationBody,
  'debt-to-income': debtToIncomeBody,
  'recurring-debts': recurringDebtsBody,
};

/** One card, ready to render. */
export function buildDashboardCard(
  id: DashboardCardId,
  ctx: DashboardCardContext,
): DashboardCardView {
  const spec = dashboardCardSpec(id);
  return { spec, periodLabel: periodLabelFor(spec, ctx), body: BODIES[id](ctx) };
}

/**
 * The chosen cards, in the order they were chosen. Unknown ids are dropped on
 * the way through, so a stale selection renders the cards it still can rather
 * than failing whole.
 */
export function buildDashboardCards(
  ids: readonly string[],
  ctx: DashboardCardContext,
): DashboardCardView[] {
  return normalizeDashboardCards(ids).map((id) => buildDashboardCard(id, ctx));
}
