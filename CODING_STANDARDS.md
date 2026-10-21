# Coding Standards

Enforced during code review across the codebase.

## 1. Domain Terminology
- Use canonical domain terms from `GLOSSARY.md` with exact casing: `Habit`, `Archived Habit`, `Check-in`, `Day`, `Device`, `Diary`, `Journal Entry`, `Reminder`.
- Never use forbidden aliases (`Task`, `log`, `note`, `Perangkat`, `alert`, `combo`).

## 2. Specification & Contract Preservation
- Redesigns and empty states must retain all specification-mandated navigation links and contract routes (`docs/SPEC.md` §10). For example, empty state cards must preserve navigation to *Manage Habits* in Settings.

## 3. Responsive State Management
- When applying responsive text suppression (e.g., `hidden min-[380px]:inline`), do not set it statically if the element reflects dynamic status. State update handlers must dynamically toggle visibility so critical alerts (`error`, `syncing`, `warning`) remain visible on narrow mobile viewports (<380px).

## 4. Mobile Ergonomics & Accessibility
- All interactive touch targets (buttons, inputs, chips) must have minimum dimensions of `44px x 44px` (`min-h-[44px] min-w-[44px]`).
- Form controls (`input`, `textarea`, `select`) must have `font-size: 16px` to prevent iOS Safari auto-zoom.
- Respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.

## 5. Test Harness
- UI tests under `frontend/src/ui/` must import shared DOM mocks (`MockElement`, `MockClassList`, `MockDocument`) from `src/ui/test-helpers.js`. Do not define duplicate mock DOM classes in individual test suites.
