# design-sync notes — personal-finance-dashboard

## Repo shape

- This repo is an **application**, not a component library. `packages/shared` is
  deliberately React-free (see CLAUDE.md) and exports no components. The two apps
  are private Vite apps with no library build.
- `packages/design-system` (`@expense-tracker/design-system`) was created for this
  sync and now **owns** the three prop-driven components and both surface
  stylesheets. The apps import from it. This retired the pre-existing duplication
  (`AlertBanners` existed twice with different markup; `GoogleMark` twice,
  identical).
- 17 of the original 21 components are store-bound (`ExpenseStore` / `ExpenseState`
  / `ViewProps` / `AuthController`) and are deliberately **out of scope** — they are
  app wiring, not design-system parts. Syncing them would need presentational
  shells extracted first.

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
pass. After any CSS change, confirm `ds-bundle/_ds_bundle.css` is ~26 KB and that
a breach banner computes `background: rgb(24, 35, 56)`.

`src/styles/index.css` carries an **app-shell neutralizer** resetting the `body`
flex rule that `mobile.css` uses to centre the phone frame. It must stay last in
the file. The apps import `styles/desktop.css` / `styles/mobile.css` directly, so
their own rendering is unaffected by it.

## Re-sync risks

- **The neutralizer is coupled to `mobile.css`.** If the `body` rule there changes
  (or others are added), the reset can silently stop covering it and the desktop
  cards will render centred. Re-check the `body{...}` cascade order in the built
  CSS.
- **Story fixtures are hand-written copies of `evaluateAlerts` output**
  (`derive.ts` `applyRule`). If the alert copy format or `breachTitle`/`warnTitle`
  changes, the stories will keep showing the old wording and still grade as a match
  — the reference and preview share the fixture. Re-read `derive.ts` when alert
  copy changes.
- **Fonts are fetched remotely.** `tokens.css` `@import`s Outfit from Google Fonts;
  validate reports `[FONT_REMOTE]` and assumes runtime availability. Nothing is
  vendored, so an offline or egress-blocked capture renders a fallback face on both
  panels — do not grade typography while that is true.
- **`GoogleMark` has no props** and is pinned to `cardMode: "single"` with
  `primaryStory: "InSignInButton"`; its solo story is a bare 17px SVG that would
  otherwise grade as an empty-looking card.
- Toolchain at last sync: node 26.4.0, pnpm 11.24.0, Storybook 9 (react-vite),
  React 19.2.8.
