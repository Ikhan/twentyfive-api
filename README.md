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
npm run storage:init    # create the local MinIO bucket for photos
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

## Logs

- **One line per request** (method, path without its query, status, response time, request id, signed-in
  `userId`), as JSON outside development and readable lines in development. 5xx log as `error`, 4xx as
  `warn`; `/health` isn't logged. `LOG_LEVEL` sets how much (`info` by default, `silent` in tests).
- **Request ids**: each request gets an `x-request-id` (or keeps a sensible one from the load balancer), sent
  back as a header and as `error.requestId` in error responses. Every log line during the request carries it,
  so a user quoting it leads straight to what happened.
- **Never logged**: login tokens, cookies, the CSRF header, `Set-Cookie`, and query strings (OAuth codes).
- Unexpected errors are logged with their stack; users only see a generic message and the request id.

## Authentication

Sign-in is social only (Google and Facebook), using OAuth 2.0 authorization code + PKCE.

1. The web app navigates to `GET /api/v1/auth/<provider>/start`, which redirects to the provider.
2. The provider redirects to `/api/v1/auth/<provider>/callback`; the API finds or creates the user,
   sets the session cookies and redirects to `WEB_APP_URL/onboarding` (new users) or `WEB_APP_URL/`.
3. Sessions: a 15-minute access token (`access_token`, httpOnly) and a 30-day rotating refresh token
   (`refresh_token`, httpOnly, scoped to `/api/v1/auth`). Reusing an old refresh token revokes the whole session family.
4. **CSRF**: cookie-authenticated `POST/PUT/PATCH/DELETE` requests must send `X-CSRF-Token` equal to the
   readable `csrf_token` cookie. The web app should do this on every write, including `/auth/refresh` and `/auth/logout`.

Every route requires a session unless decorated with `@Public()`. Use `@CurrentUser()` to get `{ id }`.
Register each provider's redirect URI as `${API_PUBLIC_URL}/api/v1/auth/<google|facebook|x>/callback`.

## Photo uploads

Photos go straight from the browser to S3; the API only hands out and verifies uploads.

1. `POST /api/v1/media/uploads` `{ purpose: 'POST_PHOTO' | 'AVATAR', contentType, sizeBytes }` returns a presigned POST
   (`upload.url` + `upload.fields`) valid for 5 minutes. S3 enforces the size limit (10 MB posts, 5 MB avatars) and type.
2. The browser POSTs `multipart/form-data`: every field from `upload.fields`, then the file as `file`.
3. `POST /api/v1/media/:id/complete` checks the object exists, its size, and its real type (magic bytes, JPEG/PNG/WebP only).
4. Use the id: `PUT /api/v1/users/me/avatar { mediaId }`, or attach it to a post.

Without S3 settings, upload endpoints return `503 STORAGE_UNAVAILABLE` and the rest of the API works normally.
In production, serve the bucket through a CDN and set `S3_PUBLIC_URL`.

## Social features

- **Visibility** is one rule, applied everywhere posts are read (`visibleTo` in the posts repository):
  your own posts; `EVERYONE` posts from public accounts; everything else only for approved followers;
  never across a block. Comments, likes, reposts and reports all go through it.
- **Reactions**: likes and reposts are idempotent `PUT`/`DELETE`s. Only public posts can be reposted.
  Posts carry `counts` and the viewer's own `viewer.liked` / `viewer.reposted`.
- **Notifications** are written by listeners on domain events (`src/common/events/domain-events.ts`):
  follow, follow request, request accepted, comment, repost. Never for your own actions or across a block;
  unread duplicates aren't repeated. They're best-effort: failures are logged and don't fail the action.
- **Moderation**: blocking removes follows both ways and hides each other's posts, comments and
  notifications. Reports (`POST /reports`) are stored for review.

## Invite-only launch

While `INVITE_ONLY=true` (the default), new accounts need an invite; existing accounts sign in as usual.

- Everyone can have **10** invite links out at a time (`GET`/`POST /api/v1/invites`). A link is single-use and
  lasts 14 days; an unused one that expires gives its slot back. Admins have no limit.
- The invite page (`WEB_APP_URL/invite/<code>`) shows who sent it (`GET /api/v1/invites/<code>`) and starts sign-in
  with `/auth/<provider>/start?invite=<code>`. The code is used up when the account is created, and the new
  account remembers who invited it (`users.invited_by_id`). Without a valid one, sign-in comes back to
  `/signin?error=invite_required` or `invite_invalid`, where the web app offers the waitlist (`POST /api/v1/waitlist`).
- **Admins** (`npm run users:make-admin -- <username>`, once per environment) see the waitlist and approve people
  (`POST /api/v1/admin/waitlist/<id>/approve`): that makes their invite link and emails them a welcome with it
  (approving again re-sends the link, or a new one once it expired). They can also ban accounts (`PUT`/`DELETE /api/v1/admin/users/<username>/ban`).
  A ban ends their sessions and voids their unused invites. It hides their profile, posts and comments, and flags
  the people they invited for review (`GET /api/v1/admin/flagged`, cleared with `DELETE …/users/<username>/flag`).
  Banned accounts can't sign in again; an access token already issued lasts at most 15 minutes.

**Email** goes through `MAILER` (`src/modules/mail`). For now it's a placeholder that sends nothing: in development
it logs the whole email (try its link), elsewhere just that it wasn't sent. Approvals then answer `emailed: false`, and the
admin sends the link themselves. Amazon SES replaces `PlaceholderMailer` in `MailModule` later.

**Opening to everyone**: set `INVITE_ONLY=false` and restart. Sign-up opens, invites in sign-in links are ignored,
and the invite and waitlist endpoints return 404 (`GET /api/v1/invites/status` tells the web app, which hides
its invite pages). Bans and flags keep working. Invite history stays in the database.

## API clients (Yaak, Postman, …)

1. `npm run openapi:export` writes `openapi.json` (git-ignored): import it into your client.
2. `npm run dev:token -- kasun` prints a 12-hour access token (creating `@kasun` if needed). Local only.
3. Use it as Bearer auth. Bearer requests skip CSRF; the web app uses cookies instead.

Interactive docs: `http://localhost:3000/api/docs` (not in production).

## Git workflow

- `main`: releases only. Never commit or merge features directly.
- `dev`: integration branch.
- `feature/<name>`: branched from `dev`, merged back into `dev` when done and green.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org) (enforced by commitlint).
