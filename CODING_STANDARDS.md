# Coding Standards

Engineering conventions and review guidelines for the Habbit codebase.

## 1. PWA & Mobile CSS Rules

- **Full-Screen Shell & Viewport Height Strategy**: Use CSS custom property `--app-height: 100dvh` in normal document flow (`html, body, #app, .shell-layout`).
  - *iOS Standalone Resolution*: On iOS Safari, `100dvh` in standalone mode incorrectly subtracts the status bar (e.g. 848pt vs 896pt on iPhone 11), creating a ~48pt dark strip below `#bottom-nav`. Do NOT use `position: fixed` on the root shell (which creates an 848pt clipping box on WebKit). Instead, maintain normal document flow and override `--app-height: 100vh` in standalone mode via the inline `navigator.standalone` bootstrap in `index.html` and `@media (display-mode: standalone)` in CSS. In standalone mode on iOS, `100vh` equals the exact physical screen height (896pt) without status bar subtraction.
  ```css
  :root {
    --app-height: 100dvh;
  }

  @media all and (display-mode: standalone) {
    :root {
      --app-height: 100vh;
    }
  }

  html, body {
    height: var(--app-height, 100dvh);
    min-height: var(--app-height, 100dvh);
    margin: 0;
    padding: 0;
    overflow: hidden;
    overscroll-behavior: none;
  }

  #app, .shell-layout {
    width: 100%;
    height: var(--app-height, 100dvh);
    min-height: var(--app-height, 100dvh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  ```
- **Status Bar Meta**: Keep `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />` in `index.html` to allow full-bleed rendering behind the status bar and Dynamic Island notch.

## 2. Touch Ergonomics & Safe Areas

- **Top Safe Area**: Header must pad for hardware cutouts: `calc(env(safe-area-inset-top, 0px) + 12px)`.
- **Bottom Safe Area**: Bottom navigation must protect the iOS home gesture indicator: `max(12px, env(safe-area-inset-bottom, 12px))`.
- **Lateral Insets**: Pad lateral edges for landscape orientation: `max(16px, env(safe-area-inset-left, 0px))` / `max(16px, env(safe-area-inset-right, 0px))`.
- **Touch Target Bounds**: All interactive buttons, tabs, links, and quick-add chips must meet minimum touch targets $\ge 44 \times 44\text{px}$.
- **Input Font Size**: All text inputs, textareas, and select elements must specify `font-size: 16px` to prevent iOS Safari auto-zooming on focus.

## 3. Responsive State Management

- When applying responsive text suppression (e.g., `hidden min-[380px]:inline`), do not set it statically if the element reflects dynamic status. State update handlers must dynamically toggle visibility so critical alerts (`error`, `syncing`, `warning`) remain visible on narrow mobile viewports (<380px).

## 4. Dependencies & Scripts

- **Exact Versions**: All dependencies and devDependencies in `frontend/package.json` must use exact pinned versions (`npm install -E`). Floating range prefixes (`^`, `~`, `>`, `<`) are forbidden and rejected by `npm run check:deps`.
- **Package Scripts**: Keep scripts minimal (`dev`, `build`, `preview`, `test`, `test:e2e`, `check:deps`, `check:structure`, `generate-pwa-assets`). Avoid proliferation of redundant aliases.
- **Repository Structure**: All dependencies, configuration, and scripts belong in `/frontend`. Never create nested `package.json` files in `/gas-backend` or other subfolders.

## 5. Apps Script Backend & Pure Logic Isolation

- **Pure Logic Isolation**: Functions designated as pure in `docs/SPEC.md` §6 (`formatDiaryHeading`, `parseDiaryHeading`, `findChronologicalInsertIndex`, `decideReminder`, `mergeRecordsLWW`) must remain isolated from Google Apps Script ambient globals (`SpreadsheetApp`, `DocumentApp`, `DriveApp`, `PropertiesService`, `LockService`, `UrlFetchApp`, `CacheService`, `Logger`).
- **Explicit Parameters**: Any environmental dependencies (e.g., current date `todayJakarta`, monotonic timestamp `nowMonotonic`) must be accepted as explicit function arguments.
- **Spec Contract Synchronization**: When editing any business rule in `docs/SPEC.md` or `docs/adr/` (e.g. lock conditions like `LOCKED`), search all references across contract documents to keep API contract (§5), backend implementation (§6), and client offline sync contract (§9) mutually synchronized.

## 6. Domain Language (GLOSSARY.md)

Use domain vocabulary strictly in symbol names, data keys, comments, and UI strings:
- `Habit` (not task or activity)
- `Archived Habit` (not deleted habit)
- `Check-in` (not completion or log)
- `Day` (local `YYYY-MM-DD`, not UTC or server date)
- `Journal Entry` (not note or diary entry)
- `Diary` (only the human-readable compiled Google Doc export)
- `Device` (local browser/phone installation)
- `Reminder` (scheduled daily notification)

## 7. Specification & Contract Preservation

- Redesigns and empty states must retain all specification-mandated navigation links and contract routes (`docs/SPEC.md` §10). For example, empty state cards must preserve navigation to *Manage Habits* in Settings.

## 8. Test Harness

- UI tests under `frontend/src/ui/` must import shared DOM mocks (`MockElement`, `MockClassList`, `MockDocument`) from `src/ui/test-helpers.js`. Do not define duplicate mock DOM classes in individual test suites.

## 9. Review Axis Separation & Code Smells

Code review follows the two-axis model:
- **Standards Axis**: Verifies adherence to this document, `GLOSSARY.md`, and Fowler smell baseline:
  - *Mysterious Name*: Functions that upsert, update, or prune document sections must not carry misleading insert-only names.
  - *Duplicated Code*: Shared paragraph writing, formatting, and separator logic in document generation must be extracted into reusable helpers.
  - *Divergent Change*: Avoid bundling unrelated periodic actions inside a single trigger function without distinct helper isolation.
- **Spec Axis**: Verifies behavioral compliance against the originating GitHub issue and `docs/SPEC.md` without conflating code style preferences with functional scope.
