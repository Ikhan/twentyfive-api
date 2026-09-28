# twentyfive-api

Backend for **twentyfive.lk**, the social network for Sri Lanka's 25 districts.

NestJS 12 · PostgreSQL 17 · Prisma · S3 (photos) · Node 24 LTS

## Getting started

```bash
nvm use                 # Node 24 (see .nvmrc)
npm install
cp .env.example .env
docker compose up -d    # Postgres on :5433, MinIO (S3) on :9002, console :9003
npm run db:migrate      # apply migrations to the dev database
npm run db:seed         # load the 25 districts
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
  Integration and e2e tests use the separate `twentyfive_test` database, migrated and seeded automatically.
- **Database**: Prisma 7 with the `pg` driver adapter; the client is generated into `src/generated/prisma` (git-ignored).
  Each feature adds its own models in its own migration.

## Authentication

Sign-in is social only (Google, Facebook, X), using OAuth 2.0 authorization code + PKCE.

1. The web app navigates to `GET /api/v1/auth/<provider>/start`, which redirects to the provider.
2. The provider redirects to `/api/v1/auth/<provider>/callback`; the API finds or creates the user,
   sets the session cookies and redirects to `WEB_APP_URL/onboarding` (new users) or `WEB_APP_URL/`.
3. Sessions: a 15-minute access token (`access_token`, httpOnly) and a 30-day rotating refresh token
   (`refresh_token`, httpOnly, scoped to `/api/v1/auth`). Reusing an old refresh token revokes the whole session family.
4. **CSRF**: cookie-authenticated `POST/PUT/PATCH/DELETE` requests must send `X-CSRF-Token` equal to the
   readable `csrf_token` cookie. The web app should do this on every write, including `/auth/refresh` and `/auth/logout`.

Every route requires a session unless decorated with `@Public()`. Use `@CurrentUser()` to get `{ id }`.
Register each provider's redirect URI as `${API_PUBLIC_URL}/api/v1/auth/<google|facebook|x>/callback`.

## Git workflow

- `main`: releases only. Never commit or merge features directly.
- `dev`: integration branch.
- `feature/<name>`: branched from `dev`, merged back into `dev` when done and green.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org) (enforced by commitlint).
