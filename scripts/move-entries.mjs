#!/usr/bin/env node
/**
 * Re-dates transactions in bulk.
 *
 * Firestore has no update-query: you read the documents, then write them one
 * by one. This does that, but goes through `queries.updateTransaction` from
 * `@expense-tracker/shared` rather than writing `date` directly — because
 * `yearMonth` and `year` are denormalized from `date` on every write, and a
 * document whose `date` says September while its `yearMonth` still says August
 * is invisible to the monthly rollup and wrong in the yearly one. Editing
 * `date` by hand in the Firebase console produces exactly that.
 *
 * Nothing is written without `--apply`; the default is a dry run that prints
 * the before/after table and stops.
 *
 *   # what would move, and where to (writes nothing)
 *   node scripts/move-entries.mjs --cycle 2026-08 --set-date 2026-08-27
 *
 *   # do it
 *   node scripts/move-entries.mjs --cycle 2026-08 --set-date 2026-08-27 --apply
 *
 * Selecting what to move — exactly one of:
 *   --cycle YYYY-MM      every entry in that tracking period
 *   --from / --to        an inclusive date window, "YYYY-MM-DD"
 *   --ids a,b,c          specific transaction document ids
 *
 * Choosing the new date — exactly one of:
 *   --set-date YYYY-MM-DD   every matched entry lands on this exact date
 *   --shift-months N        each entry moves N calendar months, keeping its
 *                           day where the target month is long enough
 *   --shift-days N          each entry moves N days
 *
 * Other flags:
 *   --cycle-start N   the day a period opens on; defaults to the account's
 *                     own `profile.cycleStartDay`, so `--cycle` means the same
 *                     window the app is showing you
 *   --apply           actually write
 *
 * Credentials come from the environment and are never read from a file or an
 * argument, so they stay out of your shell history and out of this repo:
 *
 *   read -s FB_PASSWORD && export FB_PASSWORD
 *   export FB_EMAIL=you@example.com
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const {
  readFirebaseConfig,
  initFirebase,
  signInWithEmail,
  signOutUser,
  queries,
  cycleRange,
  clampCycleStartDay,
  toYearMonth,
  toYear,
  parseISODate,
  isoDate,
  daysInMonth,
} = await import(resolve(root, 'packages/shared/dist/index.js'));

/* ------------------------------------------------------------------ args */

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const die = (message) => {
  console.error(`\n  ${message}\n`);
  process.exit(1);
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

const opts = {
  cycle: flag('cycle'),
  from: flag('from'),
  to: flag('to'),
  ids: flag('ids'),
  setDate: flag('set-date'),
  shiftMonths: flag('shift-months'),
  shiftDays: flag('shift-days'),
  cycleStart: flag('cycle-start'),
  apply: has('apply'),
};

const selectors = ['cycle', 'from', 'ids'].filter((k) => opts[k] !== undefined);
if (selectors.length !== 1) {
  die('Pick exactly one of --cycle, --from/--to or --ids. See the header of this file.');
}
if (opts.from !== undefined && opts.to === undefined) die('--from needs a matching --to.');

const actions = ['setDate', 'shiftMonths', 'shiftDays'].filter((k) => opts[k] !== undefined);
if (actions.length !== 1) {
  die('Pick exactly one of --set-date, --shift-months or --shift-days.');
}

if (opts.cycle !== undefined && !ISO_MONTH.test(opts.cycle)) die('--cycle wants "YYYY-MM".');
for (const key of ['from', 'to', 'setDate']) {
  if (opts[key] !== undefined && !ISO_DATE.test(opts[key])) {
    die(`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} wants "YYYY-MM-DD".`);
  }
}

const email = process.env.FB_EMAIL;
const password = process.env.FB_PASSWORD;
if (!email || !password) {
  die('Set FB_EMAIL and FB_PASSWORD in the environment first — see the header of this file.');
}

/* ------------------------------------------------------------------- env */

/* The apps read `.env` through Vite; a plain Node script has to do it itself.
   Deliberately minimal — enough for the flat KEY=value file `.env.example`
   describes, and no new dependency. */
const readDotEnv = (path) => {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    die(`No .env at ${path}. Copy .env.example and fill in the VITE_FIREBASE_* values.`);
  }
  const env = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const value = trimmed.slice(eq + 1).trim();
    env[trimmed.slice(0, eq).trim()] = value.replace(/^["']|["']$/g, '');
  }
  return env;
};

const config = readFirebaseConfig(readDotEnv(resolve(root, '.env')));
if (!config) die('.env has no usable VITE_FIREBASE_* config.');

/* --------------------------------------------------------------- re-date */

/** N calendar months on, keeping the day where the target month is long enough. */
const shiftMonths = (date, months) => {
  const { year, month, day } = parseISODate(date);
  const zero = year * 12 + (month - 1) + months;
  const y = Math.floor(zero / 12);
  const m = (zero % 12) + 1;
  return isoDate(y, m, Math.min(day, daysInMonth(y, m)));
};

const shiftDays = (date, days) => {
  const { year, month, day } = parseISODate(date);
  const at = new Date(Date.UTC(year, month - 1, day + days));
  return isoDate(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
};

const nextDateFor = (transaction) => {
  if (opts.setDate !== undefined) return opts.setDate;
  if (opts.shiftMonths !== undefined) return shiftMonths(transaction.date, Number(opts.shiftMonths));
  return shiftDays(transaction.date, Number(opts.shiftDays));
};

/* ------------------------------------------------------------------- run */

const { auth, db } = initFirebase(config);
const user = await signInWithEmail(auth, email, password).catch((error) => {
  die(`Sign-in failed: ${error.message}`);
});
const userId = user.uid;
console.log(`\nSigned in as ${email}  (uid ${userId})`);

// The account's own start day, so `--cycle 2026-08` selects the window the app
// is actually showing rather than a calendar month that only looks like it.
const profile = await queries.fetchProfile(db, userId);
const cycleStart = clampCycleStartDay(
  opts.cycleStart !== undefined ? Number(opts.cycleStart) : profile.cycleStartDay,
);

let selected;
let scope;
if (opts.ids !== undefined) {
  const ids = opts.ids.split(',').map((s) => s.trim()).filter(Boolean);
  const all = await queries.fetchRecentTransactions(db, userId, 10_000);
  const found = new Map(all.map((t) => [t.id, t]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) die(`No transaction with id: ${missing.join(', ')}`);
  selected = ids.map((id) => found.get(id));
  scope = `${ids.length} id(s)`;
} else {
  const window =
    opts.cycle !== undefined
      ? cycleRange(opts.cycle, cycleStart)
      : { start: opts.from, end: opts.to };
  selected = await queries.fetchTransactionsInRange(db, userId, window.start, window.end);
  scope =
    opts.cycle !== undefined
      ? `cycle ${opts.cycle} (${window.start} … ${window.end}, start day ${cycleStart})`
      : `${window.start} … ${window.end}`;
}

console.log(`Selected: ${scope}`);

if (selected.length === 0) {
  console.log('\nNothing matched — nothing to do.\n');
  await signOutUser(auth);
  process.exit(0);
}

const moves = selected
  .map((t) => ({ t, date: nextDateFor(t) }))
  .filter(({ t, date }) => date !== t.date);

const pad = (s, n) => String(s).padEnd(n);
const rp = (n) => `Rp${n.toLocaleString('id-ID')}`;

console.log(`\n  ${pad('item', 22)}${pad('from', 13)}${pad('to', 13)}${pad('yearMonth', 22)}amount`);
console.log(`  ${'-'.repeat(80)}`);
for (const { t, date } of moves) {
  const ym = `${t.yearMonth} -> ${toYearMonth(date)}`;
  console.log(
    `  ${pad(t.item.slice(0, 20), 22)}${pad(t.date, 13)}${pad(date, 13)}${pad(ym, 22)}${rp(t.amount)}`,
  );
}
const unchanged = selected.length - moves.length;
console.log(
  `\n  ${moves.length} to move${unchanged > 0 ? `, ${unchanged} already on the target date` : ''}.`,
);

const seriesCount = moves.filter(({ t }) => t.seriesId !== null).length;
if (seriesCount > 0) {
  // Series identity is `seriesId` + `date`; re-dating one member moves only
  // that month's entry and never touches the rest of the run.
  console.log(`  ${seriesCount} belong to a recurring run — only these entries move, not the run.`);
}

if (moves.length === 0) {
  await signOutUser(auth);
  process.exit(0);
}

if (!opts.apply) {
  console.log('\n  Dry run — nothing written. Re-run with --apply to commit.\n');
  await signOutUser(auth);
  process.exit(0);
}

console.log('\n  Writing…');
let written = 0;
for (const { t, date } of moves) {
  // `updateTransaction` re-derives `yearMonth` and `year` from the new `date`
  // in the same write. That is the whole reason this is a script and not a
  // console edit.
  await queries.updateTransaction(db, userId, t.id, { date });
  written += 1;
  console.log(`    ${t.item} -> ${date}  (${toYearMonth(date)} / ${toYear(date)})`);
}

console.log(`\n  Done — ${written} entr${written === 1 ? 'y' : 'ies'} re-dated.\n`);
await signOutUser(auth);
process.exit(0);
