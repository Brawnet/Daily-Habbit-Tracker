# Daily Habbit Tracker

## Structure & Commands
- `frontend/`: Vanilla JS Vite PWA. Run tests via `npm test` or `npm --prefix frontend test`. Build via `npm run build`.
- `gas-backend/`: Google Apps Script backend (`Code.gs`). Tests in `gas-backend/tests/` run through Vitest in `frontend/`.

## Canonical Documents
- `docs/SPEC.md`: Architecture, data contracts, API specification, and tab behaviors.
- `GLOSSARY.md`: Canonical domain terms (Habit, Archived Habit, Check-in, Day, Device, Diary, Journal Entry, Reminder).
- `CODING_STANDARDS.md`: Repo-wide coding standards and review rules.

## Git Worktrees
Active worktree directories are placed alongside the repo:
- `../Daily-Habbit-Tracker-worktree-<feature>`
Always check `git worktree list` before creating or checking out branches.
