# Repository Guide for Coding Agents

## Navigation Pointers
- **Domain vocabulary**: Read `GLOSSARY.md` for official terms (Habit, Check-in, Day, Journal Entry, Diary, Device).
- **Architecture & contracts**: Read `docs/SPEC.md` (§4 types, §5 API contract, §6 Apps Script, §8 PWA, §9 sync).
- **Key decisions**: Read `docs/adr/` (offline-first sync hub, Sheets single truth / Docs one-way diary, push notifications).
- **Coding standards & review rules**: Read `CODING_STANDARDS.md`.

## Worktree Layout
- Feature branches live in sibling worktrees: `../Daily-Habbit-Tracker-worktree-issue-<N>`.
- Root directory remains on `main` or active orchestration branch.

## Build & Test Commands
All dependencies and scripts are isolated in `frontend/`:
- Test: `npm --prefix frontend test`
- Build: `npm --prefix frontend run build`
- Structure check: `npm --prefix frontend run check:structure`
- Apps Script tests are automatically executed via Vitest in `frontend/vitest.config.js`.
