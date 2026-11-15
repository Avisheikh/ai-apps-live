# AI Apps Live — Initial Repository Inspection Report

**Date:** 2026-11-15T13:44:00Z  
**Inspector:** Senior Full-Stack Engineer (Antigravity)  
**Target Repository:** `/home/avisheikh/ai-apps-live`

---

## 1. System Environment & Tooling

- **Operating System:** Linux (Kernel 6.x, x86_64)
- **Node.js Version:** `v24.5.0` (active Node version via `~/.nvm/versions/node/v24.5.0`)
- **Package Manager:** `npm 11.5.1` (verified working; `pnpm`, `yarn`, and `bun` are not installed in PATH)
- **Version Control:** `git version 2.54.0`
- **Initial Workspace State:**
  - Active workspace opened in IDE was the user's home directory (`/home/avisheikh`).
  - No existing `package.json`, lockfile, or repository configuration for `AI Apps Live` was present in the home directory.
  - Per alignment with the user, a dedicated project directory `/home/avisheikh/ai-apps-live` was initialized with a fresh git repository on branch `main` to avoid polluting the home folder with project dependencies, builds, and artifacts.

---

## 2. Directory & File Tree

At initialization:
```
/home/avisheikh/ai-apps-live
└── .git/
```

Target structure being established in Phase 1:
```
/home/avisheikh/ai-apps-live
├── db/
│   └── migrations/
├── deploy/
│   └── systemd/
├── docs/
│   ├── adr/
│   ├── INSPECTION.md
│   ├── ARCHITECTURE.md
│   ├── ACCURACY_POLICY.md
│   ├── DATA_SOURCES.md
│   ├── OPERATIONS.md
│   └── PHASE_REPORTS.md
├── src/
│   ├── app/
│   │   ├── (broadcast)/broadcast/
│   │   ├── admin/
│   │   └── api/
│   ├── collectors/
│   ├── importers/
│   ├── lib/
│   │   ├── db/
│   │   ├── status/
│   │   └── snapshot/
│   └── worker/
├── tests/
│   ├── fixtures/
│   ├── integration/
│   └── unit/
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. Tooling & Dependencies Strategy

Per specification rule 6 (Zero budget, current LTS, check stable versions at install time):
- **Framework:** Next.js (App Router, current stable `15.x` or `16.x`), React 19 / React 18 LTS compatible.
- **Styling:** Tailwind CSS.
- **Typography:** `@fontsource/inter`, `@fontsource/jetbrains-mono` (deterministic self-hosted rendering for OBS Browser Source).
- **Database:** `better-sqlite3` with WAL mode and strict pragmas.
- **Schema Validation:** `zod`.
- **Testing:** `vitest` for fast unit/integration testing; `@playwright/test` for broadcast layout and canvas tests.
- **CSV Parsing:** `csv-parse` for strict RFC 4180 parsing of Trends exports.
- **TypeScript:** Strict configuration (`"strict": true`, no implicit any, exact optional property types).

---

## 4. Git Status

- **Branch:** `main`
- **Clean status:** Newly initialized repository. All changes will be committed incrementally phase-by-phase.

---

## 5. Next Steps

Proceeding with ADR-001 (Stack and Process Model) and scaffold initialization for Phase 1.
