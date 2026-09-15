# FlowPost — AI Social Media Manager

Monorepo with two independent apps:

| App         | Stack                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| `backend/`  | Node.js · Express 5 · TypeScript · MongoDB (Mongoose) · Redis (ioredis) · BullMQ · Pino |
| `frontend/` | React 19 · TypeScript · Vite · Tailwind CSS 4 · React Router · TanStack Query           |

## Prerequisites

- Node.js 22+ (`.nvmrc` pins 24)
- MongoDB 7+ and Redis 7+ running locally (no Docker required)

On macOS with Homebrew:

```bash
# MongoDB
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community     # listens on localhost:27017

# Redis
brew install redis
brew services start redis                  # listens on localhost:6379
```

BullMQ needs Redis to keep job data. In Redis's config file
(`$(brew --prefix)/etc/redis.conf`), set `maxmemory-policy noeviction` and `appendonly yes`,
then run `brew services restart redis`.

On Linux, install `mongodb-org` and `redis-server` from your package manager and enable both services.

The default connection strings in `backend/.env.example` (`mongodb://localhost:27017/flowpost`,
`redis://localhost:6379`) work with these installs as-is.

## Getting started

```bash
# Backend API  → http://localhost:5000/api/v1
cd backend
cp .env.example .env   # then set JWT_ACCESS_SECRET (command is in the file)
npm install
npm run dev
npm test               # auth test suite (in-memory MongoDB, no Redis needed)

# Background worker (separate terminal, optional until queues exist)
cd backend && npm run dev:worker

# Frontend → http://localhost:5173
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Scripts (both apps)

| Script              | Purpose                        |
| ------------------- | ------------------------------ |
| `npm run dev`       | Start in watch mode            |
| `npm run build`     | Production build               |
| `npm run typecheck` | TypeScript check without emit  |
| `npm run lint`      | ESLint                         |
| `npm run format`    | Prettier                       |

Backend only: `npm start`, `npm run start:worker` (run the compiled `dist/`).

## Backend structure

```
backend/src
├── index.ts            # API entry: connect Mongo + Redis, start HTTP server, graceful shutdown
├── worker.ts           # Worker entry: BullMQ processors run in their own process
├── app.ts              # Express app factory (middleware order lives here)
├── config/             # env (zod-validated), logger, database, redis
├── constants/          # API prefix, HTTP status and error codes
├── routes/             # index.ts mounts feature routers under /api/v1
├── controllers/        # HTTP layer: parse the request, call a service, send a response
├── services/           # Business logic (throws AppError)
├── models/             # Mongoose schemas
├── validators/         # zod request schemas
├── middlewares/        # cors, rate limiter, request logger, 404, error handler
├── queues/             # BullMQ queue registry (producers)
├── workers/            # BullMQ worker factory and registration
├── utils/              # AppError, responses, tokens, passwords, cookies, mailer
└── types/              # Ambient type declarations (req.user)

backend/tests           # Vitest + Supertest + mongodb-memory-server
```

Request flow: `route → controller → service → model`. Throw `AppError` anywhere, or let
zod/Mongoose errors bubble up. Express 5 forwards async errors to the central handler.

### Response envelope

```jsonc
// success
{ "success": true, "message": "…", "data": {}, "meta": { "pagination": {} } }
// error
{ "success": false, "message": "…", "error": { "code": "VALIDATION_ERROR", "details": [], "requestId": "…" } }
```

Helpers: `sendSuccess`, `sendCreated`, `sendNoContent`, `sendPaginated`, and `AppError.notFound()` etc.

### Health endpoints (not rate limited)

- `GET /api/v1/health/live`: the process is up
- `GET /api/v1/health/ready`: MongoDB and Redis are connected (503 otherwise)

## Authentication

| Method | Endpoint                             | Auth             | Purpose                                     |
| ------ | ------------------------------------ | ---------------- | ------------------------------------------- |
| POST   | `/api/v1/auth/register`              | —                | Create account, start session, send verify email |
| POST   | `/api/v1/auth/login`                 | —                | Start session                               |
| POST   | `/api/v1/auth/refresh`               | refresh cookie   | Rotate refresh token, get new access token  |
| POST   | `/api/v1/auth/logout`                | refresh cookie   | Revoke this session                         |
| POST   | `/api/v1/auth/logout-all`            | access token     | Revoke every session                        |
| GET    | `/api/v1/auth/me`                    | access token     | Current user                                |
| POST   | `/api/v1/auth/verify-email`          | —                | Confirm email with emailed token            |
| POST   | `/api/v1/auth/resend-verification`   | access token     | Send a new verification link                |
| POST   | `/api/v1/auth/forgot-password`       | —                | Email a reset link (same response for unknown emails) |
| POST   | `/api/v1/auth/reset-password`        | —                | Set new password with emailed token         |
| POST   | `/api/v1/auth/change-password`       | access token     | Change password, sign out other sessions    |

**How sessions work**

- **Access token:** a JWT (HS256, 15 minutes) returned in the response body. The frontend keeps
  it in memory only and sends it as `Authorization: Bearer …`.
- **Refresh token:** a random 384-bit value in an `httpOnly` cookie scoped to `/api/v1/auth`.
  Only its SHA-256 hash is stored (`RefreshToken` model). MongoDB deletes it automatically after
  30 days (TTL index).
- **Rotation:** every refresh replaces the token. Presenting an already-used token is treated as
  theft, and every token from that login is revoked.
- **Reuse grace period:** for `REFRESH_TOKEN_REUSE_GRACE_SECONDS` (default 10) after rotation, the
  previous token still gets a fresh token instead of revoking the session. This covers a reload
  while a refresh response is in flight, and parallel tabs. It never applies to a session that was
  logged out, signed out everywhere, reset or flagged for reuse.
- **Logout** revokes every token from that login, including any issued during the grace period.
- **Instant revocation:** `User.tokenVersion` is embedded in access tokens. Logout-all, password
  change and password reset increment it, so outstanding access tokens stop working immediately.
- **Passwords:** argon2id (19 MiB, t=2). Old hashes are upgraded on login. Unknown emails still
  run a dummy hash so timing doesn't reveal which accounts exist.
- **Email verification and reset tokens:** single-use, stored hashed, with expiry (24 hours and
  1 hour).
- **CSRF:** refresh and logout require `X-Requested-With: XMLHttpRequest`. Browsers can't send
  that header cross-origin without a CORS preflight, which the origin allowlist rejects.
- **Rate limits:** per IP on every auth route. Login and forgot-password are also limited per
  email, and resend-verification and change-password per user.
- **Email delivery:** set by `EMAIL_PROVIDER`: `console` logs emails (dev), `memory` captures
  them (tests), `smtp` sends them (required in production).

Middleware: `authenticate` (requires an access token and loads `req.user`),
`requireVerifiedEmail`, `requireCsrfHeader`, `validate({ body, params, query })`.

## Workspaces (multi-tenancy)

A user can own or belong to many workspaces. Roles: `OWNER` > `ADMIN` > `EDITOR` > `VIEWER`.

| Method | Endpoint                                                  | Minimum role            |
| ------ | --------------------------------------------------------- | ----------------------- |
| GET    | `/api/v1/workspaces`                                      | — (own memberships)     |
| POST   | `/api/v1/workspaces`                                      | — (creator is OWNER)    |
| GET    | `/api/v1/workspaces/:workspaceId`                         | VIEWER                  |
| PATCH  | `/api/v1/workspaces/:workspaceId`                         | ADMIN                   |
| DELETE | `/api/v1/workspaces/:workspaceId` (archive)               | OWNER                   |
| POST   | `/api/v1/workspaces/:workspaceId/restore`                 | OWNER                   |
| DELETE | `/api/v1/workspaces/:workspaceId/permanent` (archived only, body `{ confirmName }`) | OWNER |
| POST   | `/api/v1/workspaces/:workspaceId/switch`                  | VIEWER                  |
| GET    | `/api/v1/workspaces/:workspaceId/members`                 | VIEWER                  |
| PATCH  | `/api/v1/workspaces/:workspaceId/members/:memberId`       | ADMIN                   |
| DELETE | `/api/v1/workspaces/:workspaceId/members/:memberId`       | ADMIN (or self to leave) |
| GET    | `/api/v1/workspaces/:workspaceId/invitations`             | ADMIN                   |
| POST   | `/api/v1/workspaces/:workspaceId/invitations`             | ADMIN                   |
| DELETE | `/api/v1/workspaces/:workspaceId/invitations/:invitationId` | ADMIN                 |
| GET    | `/api/v1/workspaces/invitations/preview?token=`           | — (invitation token)    |
| POST   | `/api/v1/workspaces/invitations/accept`                   | — (invitation token)    |

**Role rules**

- Members can only manage members ranked strictly below them, and only grant roles below their
  own. Owners can manage everyone, including promoting other owners.
- A workspace always keeps at least one owner.
- Anyone can leave a workspace; the last owner must promote someone first.

**Cross-workspace protection**

- `requireWorkspace()` authorizes the `:workspaceId` in the URL against the caller's
  `WorkspaceMember` record on every request. It attaches `req.workspace` and
  `req.workspaceMember`. Malformed ids, unknown workspaces and other tenants' workspaces all
  return the same 404.
- `requireWorkspaceRole(role)` enforces the minimum role after that.
- Nested ids (members, invitations, future posts) are always looked up with both `_id` and the
  authorized `workspace`, so ids from another workspace return 404.
- `workspaceScopedPlugin` makes any find, update, count or delete on a workspace-owned model throw
  if the filter has no `workspace`. Deliberate exceptions must call
  `.setOptions({ skipWorkspaceScope: true })` with a comment. Aggregations aren't covered, so
  always `$match` on `workspace` first.
- Invitations are single-use hashed tokens that expire after 7 days. They can only be accepted by
  a signed-in user whose verified email matches the invitation.

**Adding a workspace-owned resource** (e.g. posts):

1. Add a `workspace` field and `schema.plugin(workspaceScopedPlugin)` to the model.
2. Mount its router on the scoped router in `routes/workspace.route.ts`, so `requireWorkspace()`
   runs first, and add `requireWorkspaceRole(...)` per route.
3. Build every query with `scopeToWorkspace(req, { ... })` from `utils/workspaceContext.util.ts`.
4. Add an isolation test to `tests/workspace.test.ts`.

## File storage (images and documents)

Uploads go to **Oracle Cloud (OCI) Object Storage**, the same bucket as jobs-viewer. Multer writes each
upload to a temporary file, the OCI SDK streams it to the bucket, and the bucket serves it from a
public URL. Temporary files are always deleted afterwards.

| Method | Endpoint                                             | Minimum role                     |
| ------ | ---------------------------------------------------- | -------------------------------- |
| GET    | `/api/v1/workspaces/:workspaceId/files?kind=`        | VIEWER                           |
| POST   | `/api/v1/workspaces/:workspaceId/files` (field `file`) | EDITOR                         |
| POST   | `/api/v1/workspaces/:workspaceId/files/batch` (field `files`) | EDITOR                  |
| DELETE | `/api/v1/workspaces/:workspaceId/files/:fileId`      | EDITOR (own files) / ADMIN (any) |

**Setup**

1. Create a bucket with public read access for objects (as in jobs-viewer), or put a CDN in front
   of it and set `STORAGE_PUBLIC_BASE_URL`.
2. Create an API signing key for an OCI user that can write to the bucket.
3. In `backend/.env`, set `STORAGE_PROVIDER=oci` and the `OCI_*` values. Provide the private key
   through `OCI_PRIVATE_KEY_PATH` (for example `./secrets/oci_api_key.pem`; `secrets/` and `*.pem` are
   gitignored) or inline through `OCI_PRIVATE_KEY`. The API refuses to start if the configuration is
   incomplete.

With `STORAGE_PROVIDER=none` (the default) the upload endpoints return 503. Tests use
`STORAGE_PROVIDER=memory`.

**Differences from jobs-viewer**

- Credentials come only from environment variables; nothing is hardcoded or kept in `src/`.
- Uploads require sign-in and are scoped to a workspace (`requireWorkspace()` and a role check run
  before Multer reads the body).
- The file type comes from the file's bytes, not its name or declared MIME type. The allowlist is
  images (JPG, PNG, GIF, WebP), videos (MP4, M4V, MOV, WebM) and documents (PDF, DOC(X), XLS(X),
  PPT(X), TXT, CSV). SVG and audio-only files are excluded. Limits: `UPLOAD_MAX_FILE_SIZE_MB`
  (10 MB) for images and documents, `UPLOAD_MAX_VIDEO_SIZE_MB` (100 MB) for videos, and up to
  `UPLOAD_MAX_FILES` per batch.
- Object keys are `workspaces/<id>/<yyyy>/<mm>/<uuid>.<ext>`; the client's file name is only stored
  (sanitized) for display. Images and videos are served inline; documents with
  `Content-Disposition: attachment`.
- Batches are all-or-nothing: if any file fails, already-stored objects are deleted.
- Every object has a `File` record (workspace-scoped plugin), so deleting a workspace permanently
  removes its files too.

Frontend: `components/ui/FileUpload` (single file with preview, used for the workspace logo),
`components/ui/Dropzone`, the Files page (`/workspace/files`, with All files, Images, Videos and
Documents tabs), and the `useUploadFile` and
`useUploadFiles` hooks (with upload progress, like jobs-viewer's `useUploadSingle`).

## Frontend structure

```
frontend/src
├── main.tsx / App.tsx  # Providers: ErrorBoundary → QueryClient → Router
├── config/             # env.ts, navigation.ts (sidebar items), workspace.ts, landing.ts
├── lib/                # axios client (auto refresh on 401), ApiError, in-memory token, forms, role helpers
├── routing/            # router.tsx, paths.ts, guards (Protected, Guest, RequireWorkspace), routeHandle.ts
├── schemas/            # zod form schemas (mirror backend validators)
├── services/<feature>/ # API calls + TanStack Query hooks (services/auth, services/workspace)
├── pages/              # auth/, dashboard/, workspaces/, settings/, invitations/, ComingSoon.tsx
├── components/
│   ├── layouts/        # MarketingLayout, RootLayout, AppLayout + app/ (Sidebar, Navbar, UserMenu)
│   ├── ui/             # Button, TextField, TextAreaField, Dropdown, Alert, Spinner
│   ├── workspace/      # WorkspaceSwitcher, WorkspaceCard, WorkspaceForm, ArchivedWorkspaceRow, badges
│   ├── dashboard/      # StatCard, GettingStarted
│   └── shared/ landing/ account/
├── hooks/              # useDismiss, usePageTitle, useUrlToken
└── index.css           # Tailwind v4 + @theme design tokens
```

### Layouts

| Layout            | Used for                                                                          |
| ----------------- | --------------------------------------------------------------------------------- |
| `MarketingLayout` | Landing page (`/`)                                                                |
| `RootLayout`      | Login, signup, password reset, email verification and invitation acceptance      |
| `AppLayout`       | Every signed-in page: sidebar (logo, workspace switcher, navigation), top navbar (page title, user menu) and content. The sidebar becomes a drawer below 1024px. |

### App pages

| Path                  | Page                                                           |
| --------------------- | -------------------------------------------------------------- |
| `/dashboard`          | Current workspace, stats and the getting-started checklist     |
| `/workspaces`         | Workspace management: all workspaces, plus an Archived tab     |
| `/workspaces/new`     | Create a workspace                                             |
| `/workspace/members`  | Team members and invitations for the current workspace         |
| `/workspace/settings` | Settings and archiving for the current workspace               |
| `/settings/account`   | Profile, password and sessions                                 |
| `/calendar`, `/posts`, `/analytics` | Placeholders ("Coming soon")                     |

**Adding a page**

1. Add its path to `routing/paths.ts`.
2. Add a route under `AppLayout` in `routing/router.tsx` with `handle: { title }`. The title shows
   in the navbar and browser tab. Put pages that act on the current workspace under
   `RequireWorkspace`.
3. Add a sidebar entry in `config/navigation.ts`. `requiresWorkspace` hides it until the user has a
   workspace, and `comingSoon` shows a "Soon" badge.

In development the frontend calls `/api/v1`, which Vite proxies to the backend, so no CORS setup
is needed locally.
