import type { CategoryType } from '../types.js';

/**
 * The category set from the source spreadsheet ("Alokasi Keuangan", Monthly
 * Logs tab) — the sheet's FIXED / VARIABLE / SAVINGS groups in sheet order,
 * with the per-category monthly allocations from its budget column.
 *
 * One template, three consumers: `seedData.ts` builds the demo dataset from
 * it, `ExpenseStore.addDefaultCategories` writes it into a live account, and
 * `colorForName` reads the `color` field as the canonical palette, matched by
 * name (see the note on that function). The `id` slugs are the seed dataset's
 * document ids only — on the live path Firestore assigns the ids, so nothing
 * here is a stable key in a real account.
 *
 * Nothing applies this automatically. A fresh project still starts empty (see
 * "Income and allocations" in CLAUDE.md); the apps offer it as a one-tap
 * action from the empty state, so deleting every category doesn't cause them
 * to reappear on the next load.
 */

export interface DefaultCategory {
  /** seed-dataset document id; ignored when writing to Firestore */
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  /** hex — this category's identity colour everywhere it is shown */
  color: string;
  /** monthly allocation, in the smallest currency unit */
  allocation: number;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  {
    id: 'groceries',
    name: 'Groceries',
    type: 'fixed',
    icon: '🛒',
    color: '#3f9d6b',
    allocation: 800_000,
  },
  { id: 'bills', name: 'Bills', type: 'fixed', icon: '🧾', color: '#6b3fa0', allocation: 5_100_000 },
  {
    id: 'transportation',
    name: 'Transportation',
    type: 'fixed',
    icon: '🛵',
    color: '#17958c',
    allocation: 600_000,
  },
  {
    id: 'health-insurance',
    name: 'Health & Insurance',
    type: 'fixed',
    icon: '💊',
    color: '#1157d9',
    allocation: 300_000,
  },
  {
    id: 'utilities',
    name: 'Utilities',
    type: 'fixed',
    icon: '💡',
    color: '#d4534a',
    allocation: 250_000,
  },
  {
    id: 'subscription',
    name: 'Subscription',
    type: 'fixed',
    icon: '📺',
    color: '#e0813a',
    allocation: 200_000,
  },
  {
    id: 'food-and-beverages',
    name: 'Food and Beverages',
    type: 'variable',
    icon: '🍜',
    color: '#c39516',
    allocation: 900_000,
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    type: 'variable',
    icon: '🎬',
    color: '#7b64d3',
    allocation: 300_000,
  },
  {
    id: 'apparell',
    name: 'Apparell',
    type: 'variable',
    icon: '👕',
    color: '#4a8fd8',
    allocation: 300_000,
  },
  {
    id: 'others',
    name: 'Others',
    type: 'variable',
    icon: '📦',
    color: '#78849a',
    allocation: 400_000,
  },
  {
    id: 'savings',
    name: 'Savings',
    type: 'savings',
    icon: '🏦',
    color: '#2b7a4b',
    allocation: 1_000_000,
  },
];

/* --------------------------------------------------------------- palette */

/**
 * Colours for categories that aren't in the template above — the ones the
 * user invents. Hues deliberately kept clear of the eleven canonical ones so
 * a new category doesn't read as an existing one, and dark enough that a
 * solid fill still separates from the page.
 */
export const CATEGORY_RAMP = [
  '#c2417f',
  '#0f8aa0',
  '#8d6e3a',
  '#5a6acf',
  '#a85440',
  '#4f7d3a',
] as const;

export const colorForOrder = (order: number): string =>
  CATEGORY_RAMP[order % CATEGORY_RAMP.length] as string;

/**
 * The one way a category name is compared, anywhere.
 *
 * Three call sites previously disagreed — some trimmed, some didn't — so a
 * category stored as " Groceries" took the canonical colour (this function
 * trims) while the "use my defaults" dedupe (which didn't) missed it and
 * created a second Groceries.
 */
export const normalizeCategoryName = (name: string): string => name.trim().toLowerCase();

/**
 * The `order` to give the next category: one past the highest in use.
 *
 * Not `categories.length`, which collides after any delete — with A(0) B(1)
 * C(2), removing B leaves length 2, so the next category also takes 2. Two
 * categories then share a ramp slot (identical colour) and tie under
 * `orderBy('order')`.
 *
 * Deleting deliberately does **not** renumber the survivors. It would keep
 * `order` dense, but colour is derived from it, so every remaining category
 * would change colour whenever one was deleted. Sparse gaps are harmless —
 * this is a sort key, not an index.
 */
export const nextCategoryOrder = (categories: readonly { order: number }[]): number =>
  categories.reduce((highest, c) => Math.max(highest, c.order), -1) + 1;

/**
 * Names of categories sharing an `order` with an earlier one, in the order
 * they were given.
 *
 * `nextCategoryOrder` makes new collisions impossible, so a non-empty result
 * means documents written before that fix — nothing in the app can produce
 * one now. Reported rather than repaired: two categories sharing a slot only
 * matters if their colour comes from `order` (a name outside the template),
 * and silently rewriting `order` would recolour them without being asked.
 */
export const collidingCategoryOrders = (
  categories: readonly { name: string; order: number }[],
): string[] => {
  const seen = new Set<number>();
  const collisions: string[] = [];
  for (const c of categories) {
    if (seen.has(c.order)) collisions.push(c.name);
    else seen.add(c.order);
  }
  return collisions;
};

const CANONICAL = new Map(DEFAULT_CATEGORIES.map((c) => [normalizeCategoryName(c.name), c.color]));

/**
 * The colour to show a category in.
 *
 * Matched by name rather than by id, because ids are Firestore-assigned on
 * the live path — only the name is stable between the template and an
 * account. Applied where a category is read (`toCategory`, `seedCategories`),
 * so an account created before this palette existed picks it up with no
 * migration to run.
 *
 * The stored `color` is deliberately not consulted. Nothing has ever let the
 * user pick one: every value in Firestore was auto-assigned by this same
 * function's predecessor, so honouring it would only pin older categories to
 * the ramp it has replaced. The field is still written on create — it stays
 * the escape hatch for the day a colour picker lands, at which point this has
 * to invert and read the stored value first.
 */
export const colorForName = (name: string, order = 0): string =>
  CANONICAL.get(normalizeCategoryName(name)) ?? colorForOrder(order);

/**
 * `hex` mixed toward white by `amount` (0-1).
 *
 * Category colours span a wide luminance range, so a saturated fill can't
 * carry text at a contrast that holds for every hue. Anything with a label on
 * it gets a wash from here instead and keeps `--cf-ink` text; solid colour
 * stays on dots, bars and borders.
 */
export function tintColor(hex: string, amount: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return hex;
  const n = parseInt(match[1], 16);
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * amount);
  const out = [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The custom properties the `.cf-cat*` classes read — solid colour and its
 * wash — for one category. Returned untyped because `shared` has no React
 * dependency; each app casts it to `CSSProperties` once.
 */
export const categoryVars = (color: string): Record<string, string> => ({
  '--cat': color,
  '--cat-wash': tintColor(color, 0.86),
});
