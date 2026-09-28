# twentyfive-api

Backend for **twentyfive.lk**, the social network for Sri Lanka's 25 districts.

NestJS 12 · PostgreSQL 17 · Prisma · S3 (photos) · Node 24 LTS

## Getting started

```bash
nvm use                 # Node 24 (see .nvmrc)
npm install
cp .env.example .env
docker compose up -d    # Postgres on :5433, MinIO (S3) on :9002, console :9003
npm run start:dev       # http://localhost:3000/api/v1
```

API docs (non-production): http://localhost:3000/api/docs

## Scripts

| Script                          | What it does                                          |
| ------------------------------- | ----------------------------------------------------- |
| `npm run start:dev`             | Run with watch mode                                   |
| `npm test` / `npm run test:cov` | Unit tests (coverage must stay ≥ 80%)                 |
| `npm run test:e2e`              | End-to-end tests against the full app                 |
| `npm run check`                 | Everything CI runs: types, lint, format, tests, build |

## Conventions

- **Responses** always use one envelope: `{ success, data, error, meta? }`.
  Errors carry a stable `code` (e.g. `NOT_FOUND`, `VALIDATION_FAILED`) and a safe `message`.
- **Routes** live under `/api/v1`.
- **Modules** are organised by feature under `src/modules/<feature>`:
  controller (HTTP only) → service (business rules) → repository interface → Prisma implementation.
  Services throw `AppError` subclasses, never HTTP exceptions.
- **Config** is read only through `AppConfigService`; every variable is validated at startup.
- **Tests**: `*.spec.ts` (unit), `*.int-spec.ts` (repository vs. real Postgres), `test/e2e/*.e2e-spec.ts` (HTTP).

## Git workflow

- `main`: releases only. Never commit or merge features directly.
- `dev`: integration branch.
- `feature/<name>`: branched from `dev`, merged back into `dev` when done and green.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org) (enforced by commitlint).
