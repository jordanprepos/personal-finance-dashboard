## How to build with this system

A personal-finance design system with **two surfaces**: a desktop dashboard and a
mobile webview. Pick one per screen and stay in its vocabulary — the two are
designed to be used separately, not mixed in one layout.

**No provider, no theme setup, no wrapper.** Every export is a plain function
component with no React context behind it. Render it directly. All you must do is
ensure `styles.css` is loaded — that is where the whole look comes from.

### The styling idiom: CSS classes plus custom properties

There are no style props and no utility classes. You style your own layout glue by
writing markup with the system's class names and reading its tokens through
`var(--*)`. Four families, all real names from the stylesheet:

- **Design tokens** (`--cf-*`, on `:root`) — colour: `--cf-ink`, `--cf-surface`,
  `--cf-surface-2`, `--cf-surface-3`, `--cf-page`, `--cf-muted`, `--cf-slate`,
  `--cf-blue`, `--cf-blue-hover`, `--cf-blue-pale`, `--cf-border`,
  `--cf-border-strong`, `--cf-danger`, `--cf-danger-pale`, `--cf-on-dark-soft`.
  Radius: `--cf-r-card`, `--cf-r-panel`, `--cf-r-tile`, `--cf-r-chip`,
  `--cf-r-pill`, `--cf-r-phone`. Shadow: `--cf-shadow-card`, `--cf-shadow-item`,
  `--cf-shadow-phone`. **Always use these rather than literal colours** — hardcoding
  a hex is what makes a screen look off-system.
- **Shared component classes** (`.cf-*`) — work on both surfaces:
  `.cf-panel`, `.cf-tile` (`.cf-tile--soft`, `.cf-tile--cat`), `.cf-darkcard`,
  `.cf-row`, `.cf-group`, `.cf-line`, `.cf-badge`, `.cf-banner`,
  `.cf-cta` (`.cf-cta--primary`, `.cf-cta--outline`), `.cf-ghostbtn`,
  `.cf-catchip` (`.cf-catchip--on`), `.cf-fieldlabel`, `.cf-modal`,
  `.cf-modal-scrim`, `.cf-sheet`, `.cf-scrim`, `.cf-status`
  (`--received`, `--expected`, `--paused`), `.cf-toast`, `.cf-fab`, `.cf-phone`.
- **Desktop surface** (`.dash__*`) — `.dash__header`, `.dash__body`, `.dash__column`,
  `.dash__hero`, `.dash__chart`, `.dash__donutcard`, `.dash__envelopes`,
  `.dash__catrow`, `.dash__formrow`, `.dash__alerts`, `.dash__empty`.
- **Mobile surface** (`.phone__*`) — wrap the screen in `.cf-phone`, then
  `.phone__status`, `.phone__scroll`, `.phone__list`, `.phone__entry`,
  `.phone__nav` / `.phone__navbtn`, `.phone__amount`, `.phone__alerts`.

### Components come in surface pairs

Most components ship twice — once per surface — and you pick the one matching
the surface you are building. They take the **same props**, so switching
surfaces is a component swap, not a rewrite:

| Purpose | Desktop | Mobile |
|---|---|---|
| Spending alert stack | `DesktopAlertBanners` | `MobileAlertBanners` |
| Add/edit an expense | `ExpenseModal` | `ExpenseSheet` |
| Manage categories | `CategoryModal` | `CategorySheet` |
| Add/edit an income source | `IncomeModal` | `IncomeSheet` |
| Alert settings | `AlertSettingsModal` | `AlertSheet` |

`DefaultCategoriesButton` and `GoogleMark` are surface-neutral and used by both.

**Every component is presentational.** None reads a store, a session or
Firestore — they take plain data plus callbacks (`onSave`, `onDelete`,
`onClose`, …), so you can render any of them from literals. Where a surface
needs derived numbers it takes them ready-made (`entryCounts`, `allocations`,
`rows`, `monthSpend`) rather than raw transactions.

**Mobile sheets must be rendered inside `.cf-phone`.** Their scrim is
`position: absolute`, so without that positioned shell they collapse to
nothing. The desktop modals bring their own fixed scrim and need no wrapper.

### Conventions that matter

- **Money is Indonesian Rupiah in the smallest unit, with no decimals** — render
  `8_000_000` as `Rp 8.000.000`. Never show cents.
- **Two alert levels only**: a breach takes the dark ink surface
  (`--modifier` `--breach`), a warning the pale accent (`--warning`). Introduce no
  other alert colour.
- The mobile surface makes the **whole banner the tap target** (it clears 44px);
  the desktop surface uses a separate link inside the row.

### Where the truth lives

Read `styles.css` and its two `@import`s — `tokens/tokens.css` (every token) and
`_ds_bundle.css` (every `.cf-*`, `.dash__*` and `.phone__*` rule) — before styling
anything. They are the authority; this summary is not exhaustive. Each component
also ships a `.prompt.md` with its own props and examples.

### An idiomatic screen

```jsx
<div className="dash__body">
  <DesktopAlertBanners alerts={alerts} onOpenSettings={openSettings} />
  <section className="cf-panel" style={{ marginTop: 16 }}>
    <div className="cf-fieldlabel">Budget left</div>
    <div style={{ color: 'var(--cf-ink)', fontSize: 28, fontWeight: 700 }}>
      Rp 1.240.000
    </div>
    <button type="button" className="cf-cta cf-cta--primary">Add expense</button>
  </section>
</div>
```
