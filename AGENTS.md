# AGENTS.md — Contributor & Agent Navigation

Habbit is a personal, offline-first Progressive Web App (PWA) Habit Tracker and Daily Journal for multi-device use (iOS Safari Home Screen & Android Chrome) with zero operating cost.

## Repository Layout
- `frontend/`: Vite vanilla JS PWA (Vercel root). UI tabs under `src/ui/`, data layer under `src/data/`, pure domain under `src/domain/`, PWA under `src/pwa/`.
- `gas-backend/`: Google Apps Script (`Code.gs`) synchronization hub bound to Google Spreadsheet.
- `docs/`: Specs and Architecture Decision Records (`SPEC.md`, `adr/`).

## Primary Navigation Pointers
- **Domain & Architecture Contracts**: Read [`docs/SPEC.md`](docs/SPEC.md). Note rules for Day (local date `YYYY-MM-DD`), Check-in (today and yesterday editable only), and Journal Entry (editable only on Day).
- **Domain Vocabulary**: Read [`GLOSSARY.md`](GLOSSARY.md). Use exact terms in code, UI, and comments (e.g. `Habit`, `Check-in`, `Journal Entry`, `Diary`, `Device`). Avoid forbidden terms.
- **Key Decisions**: Read [`docs/adr/`](docs/adr/) for offline-first architecture, Sheets source of truth, and reminder decisions.
- **Coding Standards**: Read [`CODING_STANDARDS.md`](CODING_STANDARDS.md) for mobile layout conventions, safe-area rules, Apps Script pure function isolation, and dependency policies.
- **Deployment & Setup**: Read [`README.md`](README.md) for GAS deployment, Google Drive diary setup, and VAPID push keys.

## Commands
All dependencies and scripts are isolated in `frontend/`:
- Unit & contract tests: `cd frontend && npm test` (Vitest runs frontend + GAS VM tests).
- Structure check: `cd frontend && npm run check:structure`.
- Dependency & structure check: `cd frontend && npm run check:deps`.
- Production build: `cd frontend && npm run build`.
- E2E tests: `cd frontend && npm run test:e2e`.

## Worktrees & Branches
- Work in dedicated Git worktrees for isolated features or fixes (`../Daily-Habbit-Tracker-worktree-<feature>`).
- Always compare PR diffs against the true pre-feature merge-base commit.

## Agent skills

### Issue tracker
GitHub Issues on `Brawnet/Daily-Habbit-Tracker`. See `docs/agents/issue-tracker.md`.

### Triage labels
Standard 5 triage labels mapped. See `docs/agents/triage-labels.md`.

### Domain docs
Single-context repository. See `docs/agents/domain.md`.
