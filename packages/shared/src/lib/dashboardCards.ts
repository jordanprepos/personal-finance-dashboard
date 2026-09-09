import type { Budget, Category, Transaction } from '../types.js';
import { cycleRangeLabel, monthLabel, yearOfMonth } from './dates.js';
import { formatMoney, formatPercent, type MoneyFormat } from './format.js';
import {
  bucketByMonth,
  categoryOf,
  categoryTotals,
  donutSegments,
  envelopesByType,
  incomeBreakdown,
  indexCategories,
  monthSummary,
  pace,
  recurringThisMonth,
  sumAmounts,
  totalIncome,
  upcomingIncome,
  upcomingIncomeTotal,
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

export type DashboardCardGroup = 'cashflow' | 'spending' | 'reports';

/** Tab order in the picker. */
export const DASHBOARD_CARD_GROUPS: readonly DashboardCardGroup[] = [
  'cashflow',
  'spending',
  'reports',
];

export const DASHBOARD_CARD_GROUP_LABELS: Record<DashboardCardGroup, string> = {
  cashflow: 'Cash-flow',
  spending: 'Spending',
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
   * month in view; `year` is the twelve periods labelled by its year.
   */
  scope: 'period' | 'year';
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
 * ships one card renderer rather than ten. `DonutSegment` and `YearBar` are
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
  const range = cycleRangeLabel(ctx.yearMonth, ctx.cycleStartDay);
  return range ? `${monthLabel(ctx.yearMonth)} · ${range}` : monthLabel(ctx.yearMonth);
}

/* ------------------------------------------------------------------ bodies */

function budgetLeftBody(ctx: DashboardCardContext): DashboardCardBody {
  const s = monthSummary(ctx.yearMonth, ctx.monthTransactions, ctx.budget);
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
    empty: 'No income sources for this period yet.',
  };
}

function spendingPaceBody(ctx: DashboardCardContext): DashboardCardBody {
  const s = monthSummary(ctx.yearMonth, ctx.monthTransactions, ctx.budget);
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
    progress: s.spentShare,
  };
}

function incomeExpectedBody(ctx: DashboardCardContext): DashboardCardBody {
  const upcoming = upcomingIncome(ctx.budget, ctx.yearMonth, ctx.cycleStartDay);
  const still = upcomingIncomeTotal(ctx.budget);
  return {
    type: 'rows',
    rows: upcoming.slice(0, MAX_ROWS).map((u) => ({
      key: u.id,
      label: u.name,
      caption: u.dateLabel,
      // The whole payment is what lands, even for a quarterly source whose
      // per-month contribution is a third of it.
      value: formatMoney(u.amount, ctx.fmt),
    })),
    footer: { label: 'Still expected', value: formatMoney(still, ctx.fmt) },
    empty: 'Everything expected this period has landed.',
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
  const s = monthSummary(ctx.yearMonth, ctx.monthTransactions, ctx.budget);
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
