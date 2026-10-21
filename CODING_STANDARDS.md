# Coding Standards & Review Guidelines

Guidelines enforced during code review and development in this repository:

## 1. Spec Contract Synchronization
- When editing any business rule in `docs/SPEC.md` or `docs/adr/` (e.g. lock conditions like `LOCKED`), search all references across contract documents.
- The API contract (§5), backend implementation (§6), and client offline sync contract (§9) must remain strictly mutually consistent without contradictory criteria.

## 2. Apps Script Pure Logic Isolation
- Logic designated as pure in `docs/SPEC.md` §6 (`formatDiaryHeading`, `parseDiaryHeading`, `findChronologicalInsertIndex`, `decideReminder`, `mergeRecordsLWW`) must remain isolated from Google Apps Script ambient globals (`SpreadsheetApp`, `DocumentApp`, `DriveApp`, `PropertiesService`, `LockService`, `UrlFetchApp`, `CacheService`, `Logger`).
- Any environmental dependencies (e.g., current date `todayJakarta`, monotonic timestamp `nowMonotonic`) must be accepted as explicit function arguments.

## 3. Repository Structure & Tooling
- All dependencies, configuration, and scripts belong in `/frontend`.
- Never create nested `package.json` files in `/gas-backend` or other subfolders. Tests for Apps Script run through Vitest in `/frontend`.

## 4. Code Smells Baseline
- **Mysterious Name**: Functions that upsert, update, or prune document sections must not carry misleading insert-only names.
- **Duplicated Code**: Shared paragraph writing, formatting, and separator logic in document generation must be extracted into reusable helpers.
- **Divergent Change**: Avoid bundling unrelated periodic actions (e.g., diary document exports vs. push notification checks) inside a single trigger function without distinct helper isolation.
