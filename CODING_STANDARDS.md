# Coding Standards

Engineering conventions and review guidelines for the Habbit codebase.

## 1. PWA & Mobile CSS Rules

- **Viewport Height**: Always use modern dynamic viewport height (`100dvh`) for full-screen shell layout (`html, body, #app, .shell-layout`).
- **Cascade Order**: Progressive fallbacks (`100%`, `100vh`, `-webkit-fill-available`) must always precede `100dvh` in CSS declarations so that modern browsers favor `100dvh`.
  ```css
  html, body, #app, .shell-layout {
    height: 100%;
    height: 100vh;
    height: 100dvh;
    min-height: 100%;
    min-height: -webkit-fill-available;
    min-height: 100vh;
    min-height: 100dvh;
  }
  ```
- **Duplication Policy**: Consolidate shared selector declarations rather than repeating identical declaration blocks across selectors or inside `@media (display-mode: standalone)`.
- **Status Bar Meta**: Keep `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />` in `index.html` to allow full-bleed rendering behind the status bar and Dynamic Island notch.

## 2. Touch Ergonomics & Safe Areas

- **Top Safe Area**: Header must pad for hardware cutouts: `calc(env(safe-area-inset-top, 0px) + 12px)`.
- **Bottom Safe Area**: Bottom navigation must protect the iOS home gesture indicator: `max(12px, env(safe-area-inset-bottom, 12px))`.
- **Lateral Insets**: Pad lateral edges for landscape orientation: `max(16px, env(safe-area-inset-left, 0px))` / `max(16px, env(safe-area-inset-right, 0px))`.
- **Touch Target Bounds**: All interactive buttons, tabs, links, and quick-add chips must meet minimum touch targets $\ge 44 \times 44\text{px}$.
- **Input Font Size**: All text inputs, textareas, and select elements must specify `font-size: 16px` to prevent iOS Safari auto-zooming on focus.

## 3. Dependencies & Scripts

- **Exact Versions**: All dependencies and devDependencies in `frontend/package.json` must use exact pinned versions (`npm install -E`). Floating range prefixes (`^`, `~`, `>`, `<`) are forbidden and rejected by `npm run check:deps`.
- **Package Scripts**: Keep scripts minimal (`dev`, `build`, `preview`, `test`, `test:e2e`, `check:deps`, `generate-pwa-assets`). Avoid proliferation of redundant aliases.

## 4. Domain Language (GLOSSARY.md)

Use domain vocabulary strictly in symbol names, data keys, comments, and UI strings:
- `Habit` (not task or activity)
- `Archived Habit` (not deleted habit)
- `Check-in` (not completion or log)
- `Day` (local `YYYY-MM-DD`, not UTC or server date)
- `Journal Entry` (not note or diary entry)
- `Diary` (only the human-readable compiled Google Doc export)
- `Device` (local browser/phone installation)
- `Reminder` (scheduled daily notification)

## 5. Review Axis Separation

Code review follows the two-axis model:
- **Standards Axis**: Verifies adherence to this document, `GLOSSARY.md`, and Fowler smell baseline (duplication, primitive obsession, shotgun surgery). Mechanical violations are backed by automated tests or linter checks.
- **Spec Axis**: Verifies behavioral compliance against the originating GitHub issue and `docs/SPEC.md` without conflating code style preferences with functional scope.
