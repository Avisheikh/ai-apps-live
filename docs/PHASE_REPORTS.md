# AI Apps Live — Phase Reports

## Phase 1 Report: Repository Inspection and Architecture Scaffold

**Date:** 2026-11-15T13:54:00Z  
**Phase Status:** COMPLETED

### 1. What Changed
- Inspected the host system and user workspace (`/home/avisheikh`). Noted Node.js `v24.5.0`, npm `11.5.1`, and Git `2.54.0`.
- Initialized a clean project repository at `/home/avisheikh/ai-apps-live` on git branch `main`.
- Authored `docs/INSPECTION.md` recording system environment, tooling, and directory structure.
- Authored `docs/adr/0001-stack-and-process-model.md` specifying the dual-process architecture (`web` and `worker`), SQLite WAL mode, status derivation rules, and security policies.
- Configured project scaffolding:
  - `package.json` with scripts: `dev`, `build`, `start`, `worker`, `typecheck`, `lint`, `test`, `test:e2e`, `db:migrate`, `db:seed`, `admin:hash`.
  - Dependencies: `next@16.4.6`, `react@19.0.0`, `react-dom@19.0.0`, `better-sqlite3@13.2.0`, `zod@4.6.7`, `csv-parse@7.0.3`, `@fontsource/inter@5.3.0`, `@fontsource/jetbrains-mono@5.3.0`.
  - Dev dependencies: `typescript@6.0.3`, `vitest@5.1.0`, `@playwright/test@1.65.1`, `tailwindcss@3.4.19`, `eslint@9.39.5`, `tsx@4.23.15`, `@rolldown/binding-linux-x64-gnu`.
  - Environment config: `.env.example`, `.env` with scrypt admin password hash.
  - Next.js config with security headers (strict CSP, frame-options, referrer policy) and mzstatic image remote patterns.
  - Tailwind and PostCSS configurations with exact dark broadcast design tokens.
  - Scrypt password hashing and verification utility in `src/lib/auth/hash.ts`.
  - Scaffold entries for worker, migrations, seeds, and unit tests.

### 2. Commands Actually Run & Final Output Lines

#### Command: `npm run typecheck`
```
> ai-apps-live@1.0.0 typecheck
> tsc --noEmit
```
(Exited with code 0)

#### Command: `npm run lint`
```
> ai-apps-live@1.0.0 lint
> eslint .
```
(Exited with code 0, 0 errors, 0 warnings)

#### Command: `npm run test`
```
> ai-apps-live@1.0.0 test
> vitest run

 ✓ tests/unit/scaffold.test.ts (1 test) 163ms
   ✓ Scaffold Verification (1)
     ✓ authenticates password hashing and verification accurately with scrypt 161ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  13:53:17
   Duration  532ms (tests 68%, transform 16%, import 9%, worker 8%)
```
(Exited with code 0)

#### Command: `npm run build`
```
✓ Generating static pages using 4 workers (3/3) in 603ms
  Finalizing page optimization in 7ms    ✓ Finalizing page optimization in 7ms 

Route (app)
┌ ○ /
└ ○ /_not-found

○  (Static)  prerendered as static content
```
(Exited with code 0)

### 3. Test Counts
- Unit tests: 1 passed, 0 failed.
- Type check: 0 errors.
- Lint: 0 problems.

### 4. Known Gaps
- Database migrations, tables, triggers, and seed data will be implemented in Phase 2.
- Real Apple RSS collector implementation scheduled for Phase 3.


## Phase 2 Report: Database Schema, Migrations, Registry, and Integrity

**Date:** 2026-11-15T13:57:30Z  
**Phase Status:** COMPLETED

### 1. What Changed
- Created `db/migrations/0001_init.sql` matching the exact SQLite v1 schema with WAL mode, foreign keys, constraints, and database triggers:
  - `trg_block_concurrent_enable_upd` and `trg_block_concurrent_enable_ins` locking `CONCURRENT_USERS` metric permanently off.
  - `trg_rank_no_update`, `trg_rank_no_delete`, and `trg_snapshot_no_delete` enforcing append-only protection on App Store rankings and snapshots.
  - `trg_si_no_update` enforcing append-only protection on search interest data.
  - `trg_disc_no_value_edit_after_verify` enforcing that verified disclosures cannot be edited in place.
- Created `db/migrations/0002_seed.sql` seeding:
  - 10 tracked apps (ChatGPT, Claude, Google Gemini, DeepSeek, Perplexity, Grok, Microsoft Copilot, Character.AI, Poe, Meta AI). Apple IDs set only for ChatGPT, Claude, and Gemini with status `UNCONFIRMED`; all others NULL.
  - 5 data sources (`apple_rss`, `google_trends_csv`, `company_disclosure`, `statuspage`, `cloudflare_radar`).
  - Source health records initialized in `UNKNOWN` or `DISABLED`.
  - Metric controls enabled for core metrics and disabled for concurrent users and optional modules.
  - Zero metric values seeded.
- Implemented `src/lib/db/index.ts` connection manager supporting `DATABASE_PATH`, `DEMO_MODE`, and in-memory databases.
- Implemented `src/lib/db/migrate.ts` migration runner recording applied migrations in `schema_migrations`.
- Implemented `src/lib/db/seed.ts` runner.
- Implemented `src/lib/db/integrity.ts` scanning for `example.test` fixture leaks and throwing on production integrity violations.
- Implemented `src/lib/db/repo.ts` typed repository layer for apps, data sources, metric controls, source health, stream events, audit logs, and settings.
- Authored test suite `tests/unit/database.test.ts` covering migrations, schema triggers, seed purity, and integrity verification.

### 2. Commands Actually Run & Final Output Lines

#### Command: `npm run db:migrate && npm run db:seed`
```
> ai-apps-live@1.0.0 db:migrate
> tsx src/lib/db/migrate.ts

[DB Migration] Applied: 0001_init.sql
[DB Migration] Applied: 0002_seed.sql
[DB Migration] Complete. Applied: 2, Skipped: 0

> ai-apps-live@1.0.0 db:seed
> tsx src/lib/db/seed.ts

[DB Seed] Verified 10 apps and 5 data sources registered.
[DB Seed] Completed successfully.
```
(Exited with code 0)

#### Command: `npm test`
```
> ai-apps-live@1.0.0 test
> vitest run

 ✓ tests/unit/database.test.ts (10 tests) 48ms
 ✓ tests/unit/scaffold.test.ts (1 test) 188ms

 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  13:56:55
   Duration  525ms (tests 56%, transform 29%, import 10%, worker 5%)
```
(Exited with code 0)

#### Command: `npm run typecheck && npm run lint`
```
> ai-apps-live@1.0.0 typecheck
> tsc --noEmit

> ai-apps-live@1.0.0 lint
> eslint .
```
(Exited with code 0)

### 3. Test Counts
- Unit tests: 11 passed, 0 failed.
- Schema trigger tests: 5 passed.
- Integrity check tests: 2 passed.

### 4. Known Gaps
- Apple RSS collector to be implemented in Phase 3.
