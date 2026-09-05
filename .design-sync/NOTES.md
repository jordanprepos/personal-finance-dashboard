# design-sync notes — personal-finance-dashboard

## Repo shape

- This repo is an **application**, not a component library. `packages/shared` is
  deliberately React-free (see CLAUDE.md) and exports no components. The two apps
  are private Vite apps with no library build.
- `packages/design-system` (`@expense-tracker/design-system`) was created for this
  sync and **owns** every presentational component plus both surface stylesheets.
  The apps import from it. This retired the pre-existing duplication
  (`AlertBanners` existed twice with different markup; `GoogleMark`, `catStyle`
  and `DefaultCategoriesButton` once per app).
- The 10 modals/sheets were extracted from the apps into this package in a second
  pass: they now take plain data plus callbacks and the apps keep the store
  wiring at the call site. 12 components ship.
- Still **out of scope**: the 5 whole-screen views (`MonthlyView`, `DailyView`,
  `YearlyView`, `IncomeView`, `LoginView` ×2) and `IncomeTab`. They are screens
  bound to a specific data model, not reusable design-system parts.

## The extraction contract

Shared prop interfaces live in `packages/design-system/src/types.ts`
(`ExpenseFormProps`, `CategoryManagerProps`, `IncomeEditorProps`,
`AlertSettingsProps`); each surface pair takes the same one, so desktop and
mobile can't drift apart.

The rule that decides a prop's shape: **the design agent must be able to
construct it as a literal.** That is why the surfaces take `entryCounts`,
`allocations`, `rows` and `monthSpend` — already derived — rather than
`monthTransactions` / `yearTransactions` / `budget`. `Transaction.createdAt` is
a Firestore `Timestamp`, so any contract carrying a `Transaction` cannot be
written as a plain literal. `ExpenseFormProps` still carries one (`transaction`,
for the edit case) because the form genuinely edits an entry; `src/fixtures.ts`
stubs the timestamp structurally, reading the type off `Transaction` so the
package needs no Firestore dependency.

`entryCountsByCategory` was added to `shared/lib/derive.ts` rather than to a
view, per the repo rule that **all** derived values live there.

## Build gotchas (cost a loop each; already fixed in config)

- **`react-dom` must be resolvable from the DS package's `node_modules`.** The
  converter's bundle step requires it even though nothing imports it directly.
  Without it: `Could not resolve "react-dom"`.
- **`cssEntry` must point at a *built* stylesheet, not a source file with
  `@import`s.** The converter copies `cssEntry` verbatim and does **not** follow
  relative `@import`s — sibling or escaping imports produce `[CSS_IMPORT_MISSING]`
  and ship an empty closure. Hence `dist/styles.css`, produced by
  `esbuild src/styles/index.css --bundle` in the package's `build` script.
- **Tokens reach the closure via `tokensPkg` + `tokensGlob`**, not via an `@import`
  from `cssEntry` — `@expense-tracker/shared` resolves through the workspace
  symlink. Keeping them separate also avoids duplicating tokens into
  `_ds_bundle.css`.
- `esbuild`'s postinstall is blocked by npm's allow-scripts policy in `.ds-sync/`;
  run `npm install-scripts approve esbuild` or the bundler is missing its binary.
- Both `AlertBanners` are exported under **distinct** names
  (`DesktopAlertBanners` / `MobileAlertBanners`) because `window.ExpenseTrackerDS.*`
  can only hold one binding per name. Story titles already match the export names,
  so no `titleMap` is needed — keep it that way when adding stories.

## The CSS closure — the thing most likely to break silently

`dash__alert*` lives only in the desktop stylesheet and `phone__alert*` only in the
mobile one; `tokens.css` has neither. If the closure ever loses one, previews and
the reference **both** render unstyled and every grade passes anyway — a false
pass. A byte-count check on `_ds_bundle.css` is a brittle proxy — any legitimate
CSS edit moves it. After any CSS or config change run the real assertion:

```bash
node .design-sync/verify-styling.mjs   # breach banners must compute rgb(24, 35, 56)
```

It fails loudly when the closure is empty, which is exactly the case the compare
harness cannot catch on its own.

`src/styles/index.css` carries an **app-shell neutralizer** resetting the `body`
flex rule that `mobile.css` uses to centre the phone frame. It must stay last in
the file. The apps import `styles/desktop.css` / `styles/mobile.css` directly, so
their own rendering is unaffected by it.

## Overlays need owned previews

Every desktop modal (`ExpenseModal`, `CategoryModal`, `IncomeModal`,
`AlertSettingsModal`) has a hand-owned preview in `.design-sync/previews/`.
Reason: `.cf-modal-scrim` is `position: fixed`, and the preview card sets
`transform: translateZ(0)` on its container. A transformed ancestor becomes the
containing block for fixed descendants, so the scrim sizes to the card and the
modal is clipped — while the storybook reference, which has no such ancestor,
renders fine. **Only the preview is wrong, so the render check still passes**:
this is the failure mode the compare loop exists to catch. Each owned preview
wraps the generated composition in a `position: relative` box of fixed height;
`max-height: 88vh` still resolves against the viewport, so the result matches
storybook. A new desktop modal needs the same treatment.

Mobile sheets need the opposite: their scrim is `position: absolute`, so the
**story** must wrap them in `.cf-phone` or they collapse to nothing
(`[RENDER_BLANK]`). Every sheet story carries a `PhoneShell` decorator.

## Disabled states

`.cf-cta`, `.cf-ghostbtn` and `.cf-add` each carry the pair that makes a
disabled control read as disabled:

```css
.cf-ghostbtn:disabled          { opacity: .45; cursor: not-allowed }
.cf-ghostbtn:hover:not(:disabled) { background: var(--cf-blue-pale) }
```

**Both halves matter.** The `:disabled` rule alone still leaves the button
lighting up under the cursor, which reads as clickable more strongly than the
dimming reads as disabled. Any new interactive class needs the pair.

**And never dim at the call site.** An inline `opacity` beats the class, so it
silently defeats `:disabled` in any state the inline expression does not
anticipate. Both ways this bit us: `CategoryModal` dimmed its own `.cf-add`, so
the same class looked disabled there and enabled in two other surfaces; and
three `.cf-cta` sites used `opacity: result.valid ? 1 : 0.45` while disabling on
`!result.valid || busy`, so a valid-but-busy CTA stayed fully lit for the whole
save. No call site dims a disabled control by hand any more — let the class own
the state, and give the component a story for every disabled reason it has
(hence the `Saving` stories, the only ones where the form is valid *and* the
button disabled).

Changing a story that a component with an **owned** preview renders means
editing `.design-sync/previews/<Name>.tsx` too — it enumerates the story
exports by hand, so a new story is `[STORY_CHANGED] … preview is OWNED` and an
`unpaired` compare failure until you add the export. Generated previews
re-derive on the next build.

A caveat learned while fixing this: a stylesheet-only change leaves every
component's *source* untouched, so the re-sync diff reports every component
`unchanged` and carries its grade forward — including a grade whose note
described the pre-fix rendering. `styling: true` in the driver's upload
partition is the signal to force a recapture of whatever the CSS actually
affects (`compare.mjs --force --components <Name>`), because nothing else will.

## Re-sync risks

- **The neutralizer is coupled to `mobile.css`.** If the `body` rule there changes
  (or others are added), the reset can silently stop covering it and the desktop
  cards will render centred. Re-check the `body{...}` cascade order in the built
  CSS.
- **Story fixtures are hand-written** (`src/fixtures.ts`, plus the alert copy
  reproduced from `derive.ts`'s `applyRule`). Reference and preview share the
  same fixture, so drift grades as a match: if `breachTitle`/`warnTitle`, the
  income cadences or the category types change, the stories keep showing the old
  shape and nothing fails. Re-read the source when any of those change.
- **Fonts are fetched remotely.** `tokens.css` `@import`s Outfit from Google Fonts;
  validate reports `[FONT_REMOTE]` and assumes runtime availability. Nothing is
  vendored, so an offline or egress-blocked capture renders a fallback face on both
  panels — do not grade typography while that is true.
- **`GoogleMark` has no props** and is pinned to `cardMode: "single"` with
  `primaryStory: "InSignInButton"`; its solo story is a bare 17px SVG that would
  otherwise grade as an empty-looking card.
- A disabled-state audit found no remaining live gap: `.cf-stepbtn`, `.cf-back`
  and `.cf-opt` also lack `:disabled` rules but are never rendered disabled.
- Toolchain at last sync: node 26.4.0, pnpm 11.24.0, Storybook 9 (react-vite),
  React 19.2.8.
