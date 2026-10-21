# AGENTS.md — Contributor & Agent Navigation

Habbit is a personal, offline-first Progressive Web App (PWA) Habit Tracker and Daily Journal for multi-device use (iOS Safari Home Screen & Android Chrome) with zero operating cost.

## Repository Layout
- `frontend/`: Vite vanilla JS PWA (Vercel root). UI tabs under `src/ui/`, data layer under `src/data/`, pure domain under `src/domain/`, PWA under `src/pwa/`.
- `gas-backend/`: Google Apps Script (`Code.gs`) synchronization hub bound to Google Spreadsheet.
- `docs/`: Specs and Architecture Decision Records (`SPEC.md`, `adr/`).

## Primary Navigation Pointers
- **Domain & Architecture Contracts**: Read [`docs/SPEC.md`](docs/SPEC.md). Note rules for Day (local date `YYYY-MM-DD`), Check-in (today and yesterday editable only), and Journal Entry (editable only on Day).
- **Domain Vocabulary**: Read [`GLOSSARY.md`](GLOSSARY.md). Use exact terms in code, UI, and comments (e.g. `Habit`, `Check-in`, `Journal Entry`, `Diary`, `Device`). Avoid forbidden terms.
- **Coding Standards**: Read [`CODING_STANDARDS.md`](CODING_STANDARDS.md) for mobile layout conventions, safe-area rules, CSS cascade rules, and dependency policies.
- **Deployment & Setup**: Read [`README.md`](README.md) for GAS deployment, Google Drive diary setup, and VAPID push keys.

## Commands
- Unit & contract tests: `cd frontend && npm test` (Vitest runs frontend + GAS VM tests).
- Dependency contract check: `cd frontend && npm run check:deps`.
- Production build: `cd frontend && npm run build`.
- E2E tests: `cd frontend && npm run test:e2e`.

## Worktrees & Branches
- Work in dedicated Git worktrees for isolated features or fixes (`Daily-Habbit-Tracker-worktree-<feature>`).
- Always compare PR diffs against the true pre-feature merge-base commit.
