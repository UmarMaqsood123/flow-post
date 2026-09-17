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
| POST   | `/api/v1/workspaces/:workspaceId/files` (field `file`, optional `name`, `description`) | EDITOR |
| POST   | `/api/v1/workspaces/:workspaceId/files/batch` (field `files`, optional `metadata`) | EDITOR |
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
- **Name and description.** Each file can carry a name (up to 120 characters) and an optional
  description (up to 500). A single upload sends them as `name` and `description` fields; a batch
  sends one JSON `metadata` field, an array with an entry per file in the same order as the files.
  Both are optional on the API, so the workspace logo upload is unchanged: without a name, the file
  name stands in. Responses return `name` (the given name, or the file name), `fileName` and
  `description`. The text fields arrive in the multipart body, so they're validated after Multer
  parses it, and a rejected name still removes the temp files Multer wrote.

Files attached to posts are covered in [Post media and the Content screen](#post-media-and-the-content-screen).

Frontend: `components/ui/FileUpload` (single file with preview, used for the workspace logo),
`components/ui/Dropzone`, the reusable `components/modals` (`Modal`, plus `ConfirmModal` and `DeleteModal`, which replace every browser `confirm()` in the app: they keep the page usable, show a failed attempt's error inline instead of closing, and can't be dismissed while the action runs), the Media page (`/media`, with All
files, Images, Videos and Documents tabs, and an **Add media** button that opens
`components/media/UploadMediaModal` where each picked file gets a name, prefilled from its file
name, and an optional description), and the `useUploadFile` and
`useUploadFiles` hooks (with upload progress, like jobs-viewer's `useUploadSingle`).

## Brand profile and onboarding

Each workspace has one `BrandProfile` (workspace-scoped plugin, unique per workspace). It stores:
business name, website, industry, description, products/services, target audience, target
locations, primary goal, brand voice (tones and notes), keywords, topics, competitors (name and
website), preferred platforms and posting frequency. Onboarding status is stored on the same
document in `onboarding` (`status`, `currentStep`, `completedSteps`, `skippedSteps`, `startedAt`,
`completedAt`, `completedBy`).

| Method | Endpoint                                                            | Minimum role |
| ------ | ------------------------------------------------------------------- | ------------ |
| GET    | `/api/v1/workspaces/:workspaceId/brand-profile`                     | VIEWER       |
| PATCH  | `/api/v1/workspaces/:workspaceId/brand-profile` (draft save)        | ADMIN        |
| POST   | `/api/v1/workspaces/:workspaceId/brand-profile/onboarding/steps/:step` | ADMIN     |
| POST   | `/api/v1/workspaces/:workspaceId/brand-profile/onboarding/complete` | ADMIN        |

- **Enums:**
  - Goals: `GENERATE_LEADS`, `BRAND_AWARENESS`, `ENGAGEMENT`, `WEBSITE_TRAFFIC`, `SALES`,
    `FOLLOWER_GROWTH`, `PERSONAL_BRAND`.
  - Platforms, posting frequencies and tones: see `constants/brandProfile.constant.ts`.
- **Steps:** `business` → `audience` → `goals` → `voice` → `competitors`, then a review screen.
  - Required fields are business name, industry, description, products/services, target audience,
    primary goal, platforms, posting frequency and at least one tone.
  - Everything else is optional.
  - Only steps without required fields (competitors) can be skipped (`{ "skipped": true }`).
- **GET** returns an unsaved profile prefilled from the workspace (`id: null`, status
  `NOT_STARTED`) until the first save.
- **PATCH** saves any subset of fields without checking required fields, and can set `currentStep`
  so the wizard resumes there. Once onboarding is complete, required fields can't be cleared.
- **Step save** applies only that step's fields and returns 422 with
  `details: [{ path, message, step }]` if a required field is empty. On success it marks the step
  done and moves `currentStep` to the first unfinished step (or `review`).
- **Complete** checks every required field and sets `status: COMPLETED`. Calling it again has no
  effect.
- **Security:** the `onboarding` object and `workspace` can't be set through the API (unknown keys
  are stripped). Deleting a workspace permanently also deletes its brand profile.
- **AI generation:** not implemented yet. The profile is the input for it.

Frontend:

- **Page:** `/settings/brand-profile` (`pages/workspaces/BrandProfile.tsx`). Owners and admins get
  the wizard (`components/onboarding/OnboardingWizard.tsx`); editors and viewers get a read-only
  summary.
- **Form handling:** the wizard is a single react-hook-form form over `schemas/brandProfile.schema.ts`.
  Each step validates only its own fields with `trigger()`.
- **Navigation:** the step is in the URL (`?step=`), so browser Back and Forward work.
  - The progress indicator lets users revisit finished steps, but not jump ahead.
  - Previous, the step links and "Save and exit" save a draft when the step has changes.
- **Resuming:** users go back to the saved step. New workspaces go straight to onboarding, and the
  dashboard shows a prompt and a checklist item until it's complete.
- **New UI components:** `TagInput` (list entry) and `ChoiceGroup` (radio or checkbox cards and
  chips).

## Social integrations

A provider layer for LinkedIn, Facebook, Instagram, TikTok and YouTube.
- **LinkedIn** (see [LinkedIn](#linkedin)), **Facebook Pages** and **Instagram** (see
  [Meta](#meta-facebook-pages-and-instagram)) are implemented.
- **TikTok and YouTube** are implemented (see [TikTok and YouTube](#tiktok-and-youtube)).

```
backend/src/integrations/social
├── capabilities.ts   # capability list, capability → method map, helpers
├── provider.ts       # SocialProvider interface + BaseSocialProvider
├── types.ts          # platform-neutral inputs/outputs (tokens, profile, posts, analytics)
├── errors.ts         # SocialProviderError kinds
├── registry.ts       # SocialProviderRegistry (one provider per platform)
├── meta/             # shared Meta Graph plumbing: request/error mapping, Page discovery, uploads
└── providers/        # one factory per platform
```

**Capabilities:** `TEXT_POST`, `IMAGE_POST`, `VIDEO_POST`, `SHORT_VIDEO`, `CAROUSEL`, `ANALYTICS`,
`READ_POST`, `DELETE_POST`, `TOKEN_REFRESH`.

- **Declaring:** a provider declares only what the platform supports. For example, Instagram has no
  `TEXT_POST` or `DELETE_POST`, and YouTube has no `IMAGE_POST`.
- **Checked before calling the platform:** `socialAccount.service.ts` checks the capability
  first (422 `SOCIAL_CAPABILITY_UNSUPPORTED`).
  - One image needs `IMAGE_POST`; several need `CAROUSEL`.
  - A `format: "short"` video needs `SHORT_VIDEO`.
- **Base class defaults:** operations a provider doesn't override reject with
  `UNSUPPORTED_CAPABILITY`.
- **Registry check:** the registry refuses a provider that declares a capability without
  implementing its method.

**Adding a platform:**

1. Write a class extending `BaseSocialProvider` in `providers/<platform>.provider.ts`.
2. Implement OAuth (`getAuthorizationUrl`, `handleOAuthCallback`), `getProfile`, and a method for
   each declared capability.
3. Return the class from the platform's factory.
4. Providers throw only `SocialProviderError`. The service turns each error kind into an account
   status and an HTTP error:
   - `TOKEN_EXPIRED` → `EXPIRED`, `REAUTH_REQUIRED` → `REAUTH_REQUIRED`,
     `ACCOUNT_RESTRICTED` → `ERROR`.
   - `RATE_LIMITED` → 429, `PROVIDER_ERROR` → 502.

**SocialAccount** fields:
- `workspace`, `platform`, `providerAccountId`, `accountName`, `username`, `profileImage`.
- `encryptedAccessToken`, `encryptedRefreshToken`, `tokenExpiresAt`, `scopes`.
- `status` (`CONNECTED` | `EXPIRED` | `REAUTH_REQUIRED` | `DISCONNECTED` | `ERROR`), `metadata`.
- Plus `lastError`, `lastConnectedAt`, `lastRefreshedAt` and `connectedBy`.

It is unique per workspace + platform + provider account, so reconnecting updates the same record.

**Token security:**
- **Encryption:** tokens are encrypted at rest with AES-256-GCM (`utils/encryption.util.ts`,
  `TOKEN_ENCRYPTION_KEY`). Each ciphertext is authenticated against its workspace, platform,
  account and field, so a value copied to another record doesn't decrypt.
- **Key rotation:** set a new key and move the old one to `TOKEN_ENCRYPTION_PREVIOUS_KEYS`. Tokens
  are re-encrypted with the new key when they're next used.
- **Never returned:** token fields are `select: false`, stripped from `toJSON`, and never included in
  `toPublicSocialAccount` (which also omits `metadata`). Providers receive decrypted credentials
  only for the duration of a call.
- **Refresh:** tokens expiring within 5 minutes are refreshed before use when the platform supports
  it. A failed refresh marks the account `REAUTH_REQUIRED`, and no further platform calls are made
  until the user reconnects.

**OAuth flow:**

1. **Start:** the frontend calls `GET /api/v1/social-accounts/:platform/connect?workspaceId=` with
   its access token.
   - The API stores a single-use state, hashed and bound to the user, workspace and platform. It is
     valid for `SOCIAL_OAUTH_STATE_TTL_MINUTES`. Any PKCE verifier is stored encrypted.
   - It sets an httpOnly cookie (`SameSite=Lax`, scoped to `/api/v1/social-accounts`) binding the
     attempt to this browser, and stores only the cookie value's hash.
   - It returns the consent URL, which the browser then opens.
   - This is a GET that returns JSON rather than a redirect: the SPA keeps its access token in
     memory, so a plain browser navigation would not be authenticated.
2. **Callback:** the platform redirects the browser to `GET /api/v1/social-accounts/:platform/callback`.
   - The API requires the state and the matching cookie, re-checks that the user is still an admin
     of an active workspace, exchanges the code and stores encrypted tokens.
   - It then redirects to `FRONTEND_URL/social-accounts?platform=…&connected=1&workspaceId=…` or
     `…&error=<reason>`. The reason is one of `cancelled`, `expired`, `permission`, `forbidden`,
     `unavailable`, `rate_limited` or `failed`; the platform's raw messages are never passed on.
   - The cookie binding stops someone who sends another person their consent link from connecting
     that person's account to their own workspace.

| Method | Endpoint                                                          | Minimum role              |
| ------ | ----------------------------------------------------------------- | ------------------------- |
| GET    | `/api/v1/workspaces/:workspaceId/social-accounts/platforms`       | VIEWER                    |
| GET    | `/api/v1/workspaces/:workspaceId/social-accounts`                 | VIEWER                    |
| GET    | `/api/v1/social-accounts/:platform/connect?workspaceId=`          | ADMIN                     |
| GET    | `/api/v1/social-accounts/:platform/callback`                      | — (state + browser cookie) |
| DELETE | `/api/v1/social-accounts/:id` (deletes stored tokens)             | ADMIN                     |
| POST   | `/api/v1/social-accounts/:id/test` (profile check, posts nothing) | EDITOR                    |
| POST   | `/api/v1/social-accounts/:id/posts` `{ text, fileId? }`           | EDITOR                    |

Routes that take an account id authorize the workspace that owns the account, so another tenant's
account id returns the same 404 as an unknown one. `fileId` must be an image in the same
workspace's media library.

Publishing, reading, deleting posts and analytics are exposed as service functions
(`publishText`, `publishImage`, `publishVideo`, `getPost`, `deletePost`, `getAnalytics`) for the
upcoming posts and analytics features.

**Tests:** `tests/helpers/mockSocialProvider.ts` is a full in-memory provider: fake OAuth with PKCE,
token issuing, rotation and revocation, posts and injectable failures. The tests use it in:
- `socialProvider.test.ts`: registry, capabilities, defaults.
- `socialAccount.test.ts`: OAuth, encryption, refresh, failures, permissions, isolation.
- `encryption.test.ts`.

## LinkedIn

`integrations/social/providers/linkedin.provider.ts` uses only LinkedIn's self-serve products and
the versioned REST APIs. It was checked against LinkedIn's documentation on Microsoft Learn.

**Permissions** (requested scopes: `openid profile w_member_social`):
- **Sign In with LinkedIn using OpenID Connect** (`openid`, `profile`): member id, name and photo from
  `GET https://api.linkedin.com/v2/userinfo`. `email` isn't requested because FlowPost doesn't need it.
- **Share on LinkedIn** (`w_member_social`): create posts on behalf of the member. If LinkedIn's
  token response doesn't include this scope, the connection is refused.

**Supported:**
- The member's **personal profile**.
- Text posts.
- Posts with **one JPG or PNG image**.
- Loading the connected profile.
- Testing the connection.
- Disconnecting.

**Not supported, because it needs LinkedIn approval or another product:**

| Feature                         | Requirement                                                            |
| ------------------------------- | ---------------------------------------------------------------------- |
| Company Page posting            | Community Management API (`w_organization_social`); LinkedIn vets apps |
| Reading posts                   | `r_member_social`, restricted to approved apps                         |
| Post and member analytics       | Approved analytics permissions                                         |
| Programmatic refresh tokens     | Approved Marketing Developer Platform partners only                    |

Video, document, poll and multi-image posts exist in the Posts API, but they aren't built, so the
provider doesn't declare those capabilities.

**How publishing works:**

- **Posts:** `POST https://api.linkedin.com/rest/posts` with `LinkedIn-Version: LINKEDIN_API_VERSION`
  (default `202608`) and `X-Restli-Protocol-Version: 2.0.0`. The author is `urn:li:person:{sub}` and
  the post id comes back in the `x-restli-id` header.
- **Post text** uses LinkedIn's "little" format.
  - Reserved characters (`| { } @ [ ] ( ) < > # \ * _ ~`) are escaped so text publishes literally.
  - `#hashtags` still work. Mentions aren't supported.
  - The limit is 3,000 characters, checked before calling LinkedIn.
- **Images:**
  1. Register a synchronous upload (`POST /rest/assets?action=registerUpload`,
     `SYNCHRONOUS_UPLOAD`), so the image is processed before the post uses it. The newer Images API
     has no synchronous mode, and a `w_member_social` token can't read image status.
  2. `PUT` the bytes to the returned upload URL. The token is only ever sent to `*.linkedin.com`.
  3. Post with `content.media.id = urn:li:image:{id}`.

**Token lifecycle:**
- **Lifetime:** access tokens last **60 days**. Without partner approval there is no refresh token,
  so the account becomes `EXPIRED` and shows **Reconnect**. If the member is still signed in to
  LinkedIn, reconnecting skips the consent screen.
- **Refresh tokens:** if LinkedIn does issue one (partners), it is stored encrypted and used until
  its own expiry.
- **Errors:** 401 → `TOKEN_EXPIRED`, 403 → `PERMISSION_DENIED` (reconnect), 429 → `RATE_LIMITED`.
- **Rate limits:** LinkedIn documents 150 requests per member per day and 100,000 per app per day.
- **No revocation:** LinkedIn documents no token revocation endpoint. **Disconnect** deletes
  FlowPost's stored tokens; the member can remove the app under LinkedIn Settings → Data privacy →
  Permitted services.
- **API versions:** each is supported for at least a year. Update `LINKEDIN_API_VERSION` yearly.

**Setup:**

1. Create an app at <https://www.linkedin.com/developers/apps> and associate it with a LinkedIn
   Page as the portal asks. Complete the Page verification step if it's shown.
2. Under **Products**, add *Sign In with LinkedIn using OpenID Connect* and *Share on LinkedIn*.
3. Under **Auth**, add the redirect URL. It must match `LINKEDIN_REDIRECT_URI` exactly.
   - Development (served through the Vite proxy): `http://localhost:5173/api/v1/social-accounts/linkedin/callback`.
     LinkedIn's docs ask for HTTPS, so if the portal rejects localhost, use an HTTPS tunnel.
   - Production: `https://<your-domain>/api/v1/social-accounts/linkedin/callback`. The API refuses
     to start with a non-HTTPS value in production.
4. In `backend/.env`, set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` and
   `TOKEN_ENCRYPTION_KEY`. Setting some LinkedIn values but not all is a startup error.

**Frontend:**
- **Page:** `/social-accounts` (`pages/social/SocialAccounts.tsx`).
- **Platform cards** show what's supported, what isn't, and whether LinkedIn is configured.
- **Account cards** show status, token expiry, last check and publishable content, with **Test
  connection**, **Reconnect** and **Disconnect**.
- **Connect results** from the OAuth redirect are shown as an alert.
- **Roles:** admins and owners connect and disconnect; editors can test; viewers see status only.
- **Dashboard:** the setup checklist and the "Connected accounts" count use real accounts.

**Tests:** `tests/linkedinProvider.test.ts` exercises the provider against a fake `fetch` that
mimics LinkedIn's endpoints. It checks request formats, headers, text escaping, the image upload
flow, host checks and error mapping. `tests/socialAccount.test.ts` covers the HTTP flow with a mock
provider.

## Meta (Facebook Pages and Instagram)

`integrations/social/providers/facebook.provider.ts` and `instagram.provider.ts`, sharing
`integrations/social/meta/`. Both use official Graph API endpoints only, checked against Meta's
documentation. Graph version **v26.0** (`META_GRAPH_VERSION`).

### Permissions

| Platform | Scopes | Also needed |
| --- | --- | --- |
| Facebook Pages | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` | The `CREATE_CONTENT` task on the Page |
| Instagram | `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` | A professional account linked to a Page |

Not requested: `business_management` (pulls in ads review) and `publish_video` (live video only).

### Account types

Facebook: any Page the authenticating user can publish to. Pages without `CREATE_CONTENT` are left
out of the picker rather than connected and failing later. Instagram: **professional accounts only**
(Business or Creator) — personal accounts cannot publish through the API at all.

### App review

Every scope above needs **Advanced Access**, granted per permission through App Review. Before that,
Standard Access works only for people holding a role on the app, which is the whole development and
testing surface. Two further gates: **Business Verification**, and **Access Verification** as a Tech
Provider, which is separate from App Review and applies to any multi-tenant tool like this one. The
Tech Provider gate fails with error code 100 *only for users without a role on the app*, so it passes
internal testing and then breaks for the first real customer. Start it early.

### Publishing

| | Facebook Page | Instagram |
| --- | --- | --- |
| Text only | Yes, `POST /{page-id}/feed` | **No** — every post needs media |
| Single image | `POST /{page-id}/photos` | Container → poll → `media_publish` |
| Several images | Unpublished photos, then one `/feed` post with `attached_media` | Carousel: a container per item plus a parent, up to 10 |
| Video | Resumable upload, then `POST /{page-id}/videos` | Published as a reel |
| Short video | Reels API (`/video_reels`, start → upload → finish) | Reels, `share_to_feed=false` |
| Delete | Yes | **No** — the API can't delete published media |

**Constraints that shaped the code:**
- **Instagram fetches media itself** from a public HTTPS URL ("we cURL your image"); there is no
  binary upload for images or carousels. Facebook accepts a URL or an upload.
- **Instagram has no server-side scheduling.** Facebook has `scheduled_publish_time`, but we don't
  use it either: our scheduler owns timing, and two schedulers would fight. Instagram containers
  expire after 24 hours, so one is only ever created at publish time.
- **Media limits differ.** Instagram: JPEG only, 8 MB, 2,200-character caption, 30 hashtags, videos
  300 MB. Facebook: JPEG/PNG/GIF/BMP/TIFF, 10 MB, up to 10 photos. Both are checked before any
  request is made.
- **The publishing quota is read, not assumed.** Meta's own docs disagree (50 in the reference, 100
  in the guide), so `getPublishingLimit()` reads `content_publishing_limit` from the account.
- **`graph-video.facebook.com` is deprecated**; uploads go to `graph.facebook.com`, even though some
  of Meta's samples still show the old host.
- **Link preview customization** is not implemented: `picture`/`name`/`description`/`caption` on
  `/feed` have been deprecated since v2.10 and previews come from the target page's Open Graph tags.

### Tokens

Facebook Login returns a short-lived user token, which is exchanged for a long-lived one (~60 days)
and then for **Page access tokens** via `/me/accounts`. A Page token derived from a long-lived user
token carries no expiry, so there is no refresh: when Meta invalidates it (password change, revoked
permissions, app restriction) the account moves to `REAUTH_REQUIRED` and the user reconnects. The
Page token is what's stored and used for publishing — for Instagram too, since the professional
account hangs off the Page.

### Choosing which account to connect

One Facebook login usually grants several Pages, so the callback can't know which one is meant.
Providers may implement `listConnectionTargets()` and `connectTarget()`; when a login covers more
than one, the OAuth callback stores a short-lived `SocialConnectionDraft` (the user token encrypted
at rest, plus the candidates) and redirects with `?choose=<draftId>` instead of connecting anything.
The user picks on `/social-accounts`, and `POST /social-accounts/connections/:draftId` connects that
one and deletes the draft. A login granting exactly one account skips the picker.

### Scheduled publishing

Facebook Page **text** posts work with the scheduler today. Instagram cannot be scheduled yet: the
worker publishes text only (`publishForWorker` → `publishText`), and Instagram has no text-only
post. Instagram publishing is reachable through the account publish endpoints. Wiring it into the
scheduler needs media on posts, which the `Post` model doesn't carry yet.

### Setup

1. Create a **Business**-type app at <https://developers.facebook.com/apps> and add **Facebook Login
   for Business**.
2. Register both callback URLs as valid OAuth redirect URIs:
   - `http://localhost:5173/api/v1/social-accounts/facebook/callback`
   - `http://localhost:5173/api/v1/social-accounts/instagram/callback`
   Production must use HTTPS; the API refuses to start otherwise.
3. Set `META_APP_ID`, `META_APP_SECRET`, `META_FACEBOOK_REDIRECT_URI`,
   `META_INSTAGRAM_REDIRECT_URI` and `TOKEN_ENCRYPTION_KEY` in `backend/.env`. Setting some values
   of a group but not all is a startup error.
4. Add the app to a Business, complete Business Verification, then request Advanced Access for the
   scopes above and start Access Verification.

**Tests:** `tests/facebookProvider.test.ts` and `tests/instagramProvider.test.ts` run both providers
against a fake Graph API (`tests/helpers/fakeGraph.ts`), covering OAuth and token exchange, Page
discovery and filtering, every publishing path, the container polling states, local media
validation and status-to-error-kind mapping. The picker flow is covered end to end in
`tests/socialAccount.test.ts`.


## TikTok and YouTube

Both are video-only platforms, so neither declares `TEXT_POST`, and both hold their approval gate
in front of anything useful.

### TikTok

`integrations/social/providers/tiktok.provider.ts`, Content Posting API **v2**.

**OAuth:** Login Kit at `https://www.tiktok.com/v2/auth/authorize/`, tokens from
`open.tiktokapis.com/v2/oauth/token/`. Scopes `user.info.basic` and `video.publish`. Access tokens
last 24 hours and refresh tokens a year, and **refresh tokens rotate** — TikTok may return a new one
on every refresh, and the stored one is replaced each time. PKCE is not used: it is required only
for mobile and desktop clients, and TikTok's documented challenge is hex-encoded SHA-256 rather than
RFC 7636's base64url, so the confidential server-side flow avoids a non-standard path.

**Publishing** is four steps: query creator info, initialise the post, upload the file in chunks,
poll until TikTok reports `PUBLISH_COMPLETE`.

- **creator_info is queried every time, and the privacy level is never hardcoded.** TikTok requires
  it, and the answer changes: a private account, or an unaudited app, offers fewer options. The
  account's stored preference is used when it is still on offer, otherwise the most public option
  available. The creator's comment, duet and stitch settings are carried into the post.
- **Chunking rounds the count down.** `total_chunk_count = floor(size / chunk_size)`, because the
  last chunk carries the remainder; rounding up produces an empty trailing chunk that TikTok
  rejects. Chunks are 5–64 MB, at most 1000, uploaded sequentially with an inclusive
  `Content-Range` against the whole file.
- **A polling timeout is an unknown outcome.** The file is already with TikTok by then, so the error
  carries `outcomeUnknown` and the scheduler stops instead of risking a double post.
- **Photo posts are not implemented.** They can only be sent as `PULL_FROM_URL`, which needs the
  media host's URL prefix verified in TikTok's portal.
- The published id arrives as `publicaly_available_post_id` (TikTok's own spelling) and only once
  the post is public, so a private post falls back to the publish id and has no link.

### YouTube

`integrations/social/providers/youtube.provider.ts`, YouTube Data API **v3**.

**OAuth:** Google's endpoints with `access_type=offline` and `prompt=consent` — without the prompt
Google only issues a refresh token on the very first grant, so a reconnect would leave the account
unable to refresh. A grant with no refresh token is refused outright rather than stored. Scopes
`youtube.upload` and `youtube.readonly`.

**Channel connection:** `channels.list?mine=true`. A token is bound to the **one** channel picked at
the consent screen, so accounts are keyed on the channel id and connecting a second channel means
running the flow again.

**Upload:** the resumable protocol — a session is opened with the snippet and status, Google returns
a session URL, then the bytes go there. Title max 100 characters, description 5,000 **bytes**, tags
500 characters combined (tags containing spaces count as if quoted; extras are dropped rather than
failing the upload). An explicit title that is too long is an error; a title we derive from the
post's first line is trimmed to fit.

**Shorts:** there is no Shorts API and nothing in the response says whether a video became one.
Classification is from the file: square or vertical, three minutes or less. Those constraints are
therefore checked before uploading, so a "Short" can't quietly land as a normal video.

**`publishAt` is not used.** YouTube can schedule its own publishing, but our scheduler already owns
timing and running both would mean two schedulers disagreeing.

**A failure mid-upload is an unknown outcome**, since the video may already exist.

### What needs approval

| Platform | Gate | Until then |
| --- | --- | --- |
| TikTok | App review for `video.publish` | Direct posting doesn't work at all |
| TikTok | Content Posting API audit | **Every post is forced private** (`SELF_ONLY`) |
| TikTok | Domain verification of the media URL prefix | Photo posts can't be sent |
| YouTube | Google OAuth verification (sensitive scopes) | Unverified-app screen, hard cap of 100 users |
| YouTube | YouTube API compliance audit | **Every upload is locked private**, and quota stays at 100 uploads/day |

The two YouTube processes are separate and run by different teams; passing one does nothing for the
other. TikTok's audit is likewise separate from having `video.publish` approved. Note also Google's
limit of 100 refresh tokens per account per client id — repeatedly re-authing the same user
silently invalidates their oldest tokens.

TikTok's content-sharing guidelines also require UI that this backend can't provide on its own: the
creator's nickname shown before posting, a privacy dropdown with no default, interaction toggles
matching the creator's settings, and a commercial-content disclosure. Those are enforced at audit,
so they need building into the publishing UI before submitting.

### Scheduled publishing

Neither platform can be scheduled yet, for the same reason as Instagram: the worker publishes text
only, and neither has a text post. Both are reachable through the account publish endpoints. Wiring
them into the scheduler needs media on posts.

**Tests:** `tests/tiktokProvider.test.ts` and `tests/youtubeProvider.test.ts` run both providers
against a fake API, covering OAuth and token rotation, profile and channel reads, the full publish
flows, chunk planning arithmetic, Shorts validation, local limit checks, unknown-outcome handling
and error mapping. `vitest.config.mts` blanks every platform credential so a configured developer
machine can't change what these tests see.


## Post media and the Content screen

Every platform publishes something different, so a post carries media from the workspace's Media
library and each platform decides what it accepts.

| Platform | Post type | Media |
| --- | --- | --- |
| LinkedIn | Text | Optional: one JPG or PNG image |
| Facebook | Text | Optional: up to 10 images, **or** one video (a normal video or a Reel) |
| Instagram | Media post | **Required**: one JPEG image, a carousel of up to 10, or one video as a Reel |
| TikTok | Video | **Required**: one video (MP4, MOV or WebM) |
| YouTube | Video | **Required**: one video, as a normal video or a Short |

The rules live once, in `backend/src/constants/media.constant.ts` (`PLATFORM_MEDIA_RULES`), and are
mirrored in `frontend/src/config/media.ts` for instant feedback. They follow what the providers
actually implement: LinkedIn takes one image because that's what its provider uploads, and no
platform mixes images and video in one post.

**Where media is stored.** Attachments are file ids on each `PostVersion` (`media`, in posting
order, plus `videoFormat`), not on the post. Changing media saves a new version, so it shows in the
history and can be undone, and restoring an old version brings its media back. AI actions and text
edits that don't mention media carry the current attachments forward. `PATCH /posts/:id` accepts
`media` and `videoFormat` alongside `content`; leaving `media` out keeps what's attached, and an
empty array removes it.

**Saving vs publishing.** A draft can be saved without its required media, so writing a TikTok post
before the video is ready is fine. Wrong media is refused on save (a PNG on Instagram, an image on
TikTok, a document, images mixed with a video, too many files, a file from another workspace).
Missing required media is only enforced when scheduling. Each version returns `mediaIssue`, the
reason it can't be published yet or `null`, which the editor and Content screen show and which
disables Schedule.

**Publishing.** The scheduler works out what to call from the attachments: no media publishes text,
images call `publishImage` (a carousel when there's more than one), and a video calls
`publishVideo` with the version's format. The required capability follows the same logic, so a
platform is only asked for what it declared. Providers receive each file as a `MediaAsset` with its
public URL and a `read()` that streams the bytes from our storage, which covers both platforms that
fetch a URL (Instagram) and those that take an upload (TikTok, YouTube, Facebook video). The plan is
checked again when the job runs: a file deleted from the library after scheduling fails the job
with `MEDIA_MISSING` instead of publishing a post without its media. Instagram fetches media itself,
so the storage bucket has to serve files over public HTTPS.

**The editor.** AI Create gets a Media section with the platform's requirement, the attachments in
order, a video format choice where the platform offers one (Facebook video or Reel, YouTube video or
Short), and **Attach media**. That opens `components/media/MediaPickerModal` over the Media library.
Files the platform can't take stay visible but disabled, with the reason, and **Upload new** opens
the upload modal without leaving. Media changes are blocked while text edits are unsaved, the same
rule the AI actions follow, because they save a version from the stored content. The preview shows
the real image, carousel count or video.

**Content screen (`/content`).** Every post in the workspace in one list: thumbnail, topic, status,
a "Needs media" flag, platform, pillar, and when it's scheduled or went out. Search matches the topic
or the post's text; filters cover platforms, statuses, content pillars and whether a post has media.
Rows open the post in AI Create, and editors can duplicate or delete (deleting follows the existing
author-or-admin rule). `GET /posts` gained comma-list `platform`, `status` and `pillar`, plus `q` and
`hasMedia`; a single value still works for existing callers. AI Create now opens a requested post
directly, so a post found on the Content screen opens even when it's older than the recent-drafts
list.

**Tests:** `tests/postMedia.test.ts` covers attaching and validating media per platform, carrying it
across edits and restores, deleted library files, refusing to schedule a video platform's post
without its video, publishing a TikTok video with its real bytes and an Instagram carousel in order,
text posts still publishing, a job failing when media disappears after scheduling, and the Content
screen's filters and search.


## Analytics

Cross-platform analytics built on `AnalyticsSnapshot`, reachable at `/analytics` and behind the
dashboard's numbers.

### What each platform actually reports

The guiding rule is that a metric is either a real number a provider returned or it is absent.
Nothing is estimated, and one metric is never substituted for another.

| | views | reach | likes | comments | shares | clicks | saves | followers | impressions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| YouTube | ✅ | | ✅ | ✅ | | | | ✅ | |
| Facebook | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | | ✅ | |
| Instagram | ✅ | ✅ | ✅ | ✅ | ✅ | | ✅ | ✅ | |
| TikTok | ✅ | | ✅ | ✅ | ✅ | | | ✅ | |
| LinkedIn | | | | | | | | | |

**Impressions is empty everywhere, deliberately.** Meta replaced `post_impressions` with a views
metric in November 2025 and dropped Instagram's media-level `impressions` for anything created after
July 2024; YouTube's impressions figure is Studio-only with no public endpoint; TikTok reports none.
LinkedIn is the only platform that still exposes true impressions, and its member post analytics
need the partner-approved Community Management API. So the field exists in the model and stays
unpopulated rather than quietly showing views under an impressions label. The UI prints "Not
reported" for it.

**LinkedIn has no analytics at all** with self-serve products, and says so on the page rather than
rendering an empty panel.

**Engagement** is the sum of likes, comments, shares and saves, counting only the ones a platform
reported. It is a sum of real numbers, not a modelled figure.

### Collection

`AnalyticsSnapshot` is one reading of a post's or an account's metrics at a point in time:
normalized `metrics` plus the provider's untouched `raw` payload, so a number can be traced back to
what the platform said and a metric we don't model yet isn't lost.

Platforms report **lifetime counters**, not per-day figures, so the series is built by keeping a
snapshot per day and comparing them. That is also the only way to get follower growth: nobody
exposes "followers gained", only the total right now. A unique index on
`(workspace, account, scope, providerPostId, capturedOn)` keeps one reading per entity per day, so
re-running a collection updates that day instead of double-counting it.

Collection runs on the worker's existing sweep loop (`ANALYTICS_COLLECTION_INTERVAL_MS`, default
hourly; a workspace is collected at most every `COLLECTION_INTERVAL_HOURS`). It is not a second
scheduler: there is no per-workspace time to honour, only "this hasn't been read for a while", so a
queue of delayed jobs would buy nothing. Posts are polled for 90 days after publishing, after which
their counters have settled. One failing account or deleted post is logged and skipped rather than
stopping the run, and a failure is recorded against the account exactly as on the API path, so an
expired token surfaces on the account rather than only in the logs.

### Reporting

`GET /workspaces/:id/analytics?range=7d|30d|90d|custom` (custom takes `from`/`to` instants, capped
at 365 days) returns totals, a daily series, follower growth, top posts, best platform, best content
pillar and best posting times, plus `availableMetrics`/`unavailableMetrics` so the UI can distinguish
"zero" from "not reported". `POST /workspaces/:id/analytics/refresh` collects immediately.

Two things worth knowing about the aggregation: totals use the **latest** snapshot per post, not the
sum of every snapshot, because adding lifetime counters across days would count the same views
repeatedly. And follower counts are account totals, so they are never added into post totals. The
tenancy plugin doesn't cover aggregation pipelines, so every pipeline `$match`es on workspace first.

### Dashboard

The dashboard used to generate its numbers client-side with `isSample: true` hardcoded. That is gone:
`mockDashboard.ts` and the sample-data banner are deleted, and `GET /workspaces/:id/dashboard`
returns real counts from our own records plus real engagement from collected snapshots. Recommendations
still come from the brand profile (`lib/recommendations.ts`), but the posting-time suggestion now only
appears when analytics have actually found a best slot, instead of inventing a day and time.

### Scopes this needed

Only YouTube worked with the scopes already requested. Three were added, and each needs approval
before it returns anything:

| Platform | Scope added | Gate |
| --- | --- | --- |
| Facebook | `read_insights` | App Review; without it `/insights` returns nothing |
| Instagram | `instagram_manage_insights` | App Review |
| TikTok | `video.list`, `user.info.stats` | Portal enablement plus app review |

Accounts connected before these were added have to reconnect to grant them.

**Tests:** `tests/analytics.test.ts` covers collection (per-account and per-post snapshots, one per
day, partial failure, skipping platforms that report nothing), the report (totals from the latest
reading, follower growth from the ends of the range, ranking, best times, range and platform
filtering, custom-range validation, workspace isolation) and on-demand refresh.

## Performance insights (weekly AI recommendations)

Analytics feed a weekly report that works out what performs best and turns it into recommendations.
It's shown under the charts on `/analytics`. The design goal is that **the AI never produces a
number**: every figure comes from code, and the AI's text sits beside those figures, clearly labelled.

### Two layers, kept apart

1. **Calculated facts** (`integrations/insights/calculate.ts`). This is plain arithmetic. It looks at
   published posts from the last 90 days that have collected metrics. A post with no reading is left
   out, not counted as zero. Posts are grouped by content pillar, topic, platform, weekday, time of
   day (in the workspace time zone), format (text, image, carousel, video, short video), hook pattern
   (question, how-to, number, contrarian, statement) and call-to-action type (comment, link, follow,
   other, none). Formats, hooks and CTAs come from simple rules, not AI. For each group it stores post
   count, total and average engagement, average views, engagement rate, lift against the workspace
   average, and a confidence level based on post count (HIGH is 5 or more posts, MEDIUM is 3 or 4,
   LOW is fewer).
2. **AI interpretation** (`PERFORMANCE_INSIGHTS` prompt). The model gets the facts, each with an id,
   and returns insights with a title, an interpretation and a recommendation. Each insight must cite
   between one and four fact ids. `insightProblem` in `ai.service.ts` throws away any insight that:
   - contains a digit,
   - cites a fact that doesn't exist or that belongs to another category, or
   - rests only on LOW-confidence facts.

   The report counts how many were thrown away and the UI shows that count.

Fewer than 5 posts with metrics gives an `INSUFFICIENT_DATA` report: the numbers are saved and the AI
isn't called. If the AI step fails, the calculated numbers are still saved and `aiError` explains what
happened.

### Approval and generation

Insights start as `PENDING`. Only admins can approve or dismiss them, because an approved insight
changes AI writing for the whole workspace. Up to 8 approved insights, newest first, go into
`CREATE_POSTS`, `REFINE_POST` and `CONTENT_STRATEGY` as a `<performance_insights>` block. Only the
recommendation and interpretation text is included, and neither contains numbers. The prompt treats
these insights as guidance that ranks below the user's request and the brand profile. Setting an
insight back to pending, or dismissing it, stops it being used right away.

### Scheduling and API

The worker writes one automatic report per workspace per week, keyed by the Monday of the workspace's
week. This runs right after the analytics collection sweep, so there's no second scheduler. Later
sweeps in the same week skip it.

| Method | Path | Role |
| --- | --- | --- |
| GET | `/workspaces/:id/insights` | any member: latest report, recent reports, approved insights |
| GET | `/workspaces/:id/insights/:reportId` | any member |
| POST | `/workspaces/:id/insights/generate` | editor, AI rate limits |
| PATCH | `/workspaces/:id/insights/:reportId/insights/:insightId` | admin: `{ status }` |

**Tests:** `tests/insights.test.ts` covers:
- classifiers and calculation, including time-zone bucketing
- skipping the AI when there isn't enough data
- leaving out posts with no metrics
- rejecting insights that include numbers, cite unknown facts, cite the wrong category or rely only on LOW facts
- keeping the numbers when the AI fails
- role checks
- approved insights reaching (and dismissed ones leaving) the post-generation prompt
- one weekly report per week


## AI service layer

AI features go through a provider abstraction, so controllers and features never depend on a
vendor API. Two providers ship: OpenAI (paid) and any OpenAI-compatible service, which covers the
free tiers (Groq, Gemini, OpenRouter) and local models (Ollama, LM Studio).

```
integrations/ai/
  types.ts            AIProvider interface, structured-generation request/result, token usage
  errors.ts           AIProviderError with kinds (TIMEOUT, RATE_LIMITED, REFUSED, INVALID_OUTPUT, …)
  httpProvider.ts     Shared base: retry loop, backoff, timeouts, status→error mapping
  openai.provider.ts  OpenAIProvider: Responses API, strict JSON schema
  openaiCompatible.provider.ts  Any Chat Completions service, set by base URL and model
  pricing.ts          Per-model prices for cost estimates
  schema.ts           Converts zod schemas into strict structured-output JSON schemas
  registry.ts         getAIProvider() / setAIProvider() (tests)
  prompts/
    index.ts          Every prompt: one versioned template per operation
    schemas.ts        Structured output schemas
    brandContext.ts   Brand profile → prompt text
    platforms.ts      Per-platform limits and writing conventions
    format.ts         Prompt delimiters and injection-safe formatting
services/ai.service.ts   AIService: brand context, provider call, post-processing, usage tracking
models/aiUsage.model.ts  AIUsage
```

**Operations** (`POST /api/v1/workspaces/:workspaceId/ai/...`, editors and above):

| Service function            | Route                  | Returns                                                     |
| --------------------------- | ---------------------- | ----------------------------------------------------------- |
| `generateContentStrategy()` | `/content-strategy`    | Summary, pillars, per-platform plan, cadence, KPIs, avoid   |
| `generateContentIdeas()`    | `/content-ideas`       | Ideas with angle, format, platform, hook, rationale         |
| `generatePost()`            | `/posts/generate`      | Ready-to-publish text, hook, CTA, hashtags, image idea      |
| `rewritePost()`             | `/posts/rewrite`       | Rewritten text and a list of changes                        |
| `generateHashtags()`        | `/hashtags`            | Normalized, de-duplicated hashtags with categories          |
| `generateHook()`            | `/hooks`               | Opening lines with styles                                   |
| `generateCTA()`             | `/ctas`                | Calls to action with intent                                 |
| `adaptForPlatform()`        | `/posts/adapt`         | One version per target platform, with character counts     |
| Usage summary (admins)      | `GET /usage?days=30`   | Totals and per-operation requests, failures, tokens, cost   |

Every response includes `operation`, `promptVersion`, `model`, `usage` (tokens and estimated cost),
`brandProfileComplete` and `warnings` (e.g. a result over a platform's character limit).

**Brand context:** every request loads the workspace's brand profile (business, audience, goal,
voice, keywords, topics, competitors, platforms, frequency) and sends it inside a
`<brand_profile>` block. Missing fields are skipped. If onboarding isn't finished, generation still
works and a warning says results may be generic.

**Structured output:** each operation has a zod schema. It is converted to a strict JSON schema for
OpenAI (`text.format.type = "json_schema"`, `strict: true`), and the response is validated again
with zod, which also enforces constraints strict mode can't express.

**Prompts:** all prompts live in `integrations/ai/prompts/index.ts`, never in controllers. Each has
a semantic `version`; bump it whenever instructions, input layout or schema change. The version is
stored on every usage record. Shared rules tell the model to treat brand and user text as data,
never invent facts, avoid naming competitors and respect platform limits; user text can't forge the
prompt's delimiter tags.

**Writing style:** the shared instructions ask for human, professional but conversational copy:
clear and direct, no em dashes, no buzzwords or press-release phrasing. Models don't follow that
reliably, so the mechanical half is enforced after generation. `applyStyleRules()` in
`integrations/ai/postprocess.ts` walks every string of every AI response and rewrites dash asides
into commas, full stops or line breaks, leaving number ranges (`3–5 posts`) alone. Buzzwords aren't
swapped automatically, since that changes meaning; generated posts carry a warning naming the ones
found, so the user can rewrite or regenerate.

**Reliability:**
- **Timeouts:** `AI_REQUEST_TIMEOUT_MS` per attempt (default 60 s).
- **Retries:** up to `AI_MAX_RETRIES` (default 2) for timeouts, network errors, 408/409/429/5xx,
  and output that isn't valid JSON or doesn't match the schema. Backoff is exponential with jitter
  and honors `Retry-After` (capped at 30 s).
- **Not retried:** invalid credentials, unknown model, exhausted quota, refusals, content-filter
  blocks and truncated output.
- **Errors to clients** are generic (`AI_TIMEOUT`, `AI_REFUSED`, `AI_INVALID_OUTPUT`, …); provider
  details are logged server-side only. `store: false` asks OpenAI not to retain responses.
- **Rate limits:** 60 generations per user per hour and 200 per workspace per hour.

**Usage tracking (`AIUsage`):** one record per request, successful or failed: workspace, user,
operation, provider, model, prompt version, input/output/cached tokens, estimated cost (USD),
status, error code, duration, attempts and provider request id. Failed requests record tokens
billed by earlier attempts. Prompts and generated content aren't stored. Records are deleted with
the workspace.

**Cost estimates** use `integrations/ai/pricing.ts` (OpenAI standard-tier prices, checked
2026-09-15). Unknown models record `estimatedCostUsd: null`; add new models to the table. Invoices
remain authoritative.

**Setup (OpenAI, paid):** set `OPENAI_API_KEY` in `backend/.env`. Optional: `OPENAI_MODEL`
(default `gpt-5.6-terra`), `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_OUTPUT_TOKENS`, and
`AI_PROVIDER=none` to disable AI. Without a key, AI routes return 503 `AI_NOT_CONFIGURED`.

**Setup (free tiers and local models):** set `AI_PROVIDER=openai-compatible` plus `AI_BASE_URL`,
`AI_MODEL` and usually `AI_API_KEY`. Recipes are in `.env.example`:

| Service      | `AI_BASE_URL`                                              | `AI_MODEL` example       | Notes                                   |
| ------------ | ---------------------------------------------------------- | ------------------------ | --------------------------------------- |
| Groq         | `https://api.groq.com/openai/v1`                           | `openai/gpt-oss-120b`    | Free tier; enforces JSON schemas        |
| Google Gemini| `https://generativelanguage.googleapis.com/v1beta/openai`   | `gemini-3.8-flash`       | Free tier                                |
| OpenRouter   | `https://openrouter.ai/api/v1`                             | `openrouter/free`        | Free models, ~20 req/min, 200/day       |
| Ollama       | `http://localhost:11434/v1`                                | `llama3.1`               | No key; set `AI_STRUCTURED_MODE=json_object` |

`AI_STRUCTURED_MODE=json_schema` (default) lets the service enforce the shape; `json_object` is the
fallback for models that can't, and sends the schema in the prompt instead. Either way the reply is
validated here before anything is stored. Compatible providers record `estimatedCostUsd: null`,
since prices differ per service and free tiers cost nothing.

**Free-tier token ceilings.** Free plans limit tokens per minute, and a request that asks for more
than the whole limit can never succeed — so `AI_MAX_OUTPUT_TOKENS` has to fit inside it. Groq's free
plan allows 30 requests/minute, 1,000/day and 8,000 tokens/minute, so this repo sets
`AI_MAX_OUTPUT_TOKENS=5000`: measured against `openai/gpt-oss-120b`, a full content strategy came
back in about 9 seconds using ~2,000 input and ~4,000 output tokens, and a two-platform post set in
under 4 seconds. Going over the per-minute limit returns 429, which the provider retries
automatically after the delay the service asks for.

**Adding a provider:** implement `AIProvider` (structured generation, availability, cost estimate)
and add a case in `integrations/ai/registry.ts`. Prompts, schemas, the service and routes don't change.

**Tests:** `tests/openaiProvider.test.ts` covers the OpenAI request format, strict schemas, retries,
timeouts, error mapping, refusals, truncation, pricing and prompt building against a fake `fetch`.
`tests/ai.test.ts` covers every route with a fake provider: brand context, post-processing,
usage records for successes and failures, permissions, validation, the usage summary and deletion.

## Content strategy

A workspace's content strategy is generated from its brand profile, edited by the team, and
activated once it's ready. Code: `models/contentStrategy.model.ts`,
`validators/contentStrategy.validator.ts`, `services/contentStrategy.service.ts`,
`routes/contentStrategy.route.ts`; frontend `pages/strategy/ContentStrategy.tsx` and
`components/strategy/`.

**Sections:** audience analysis (summary and segments), content pillars, recommended topics,
platform strategy, brand tone, CTA strategy, posting frequency, content formats (shares add up to
100%) and hashtag approach.

**Structured JSON, validated by the backend.** The content shape is defined once in
`contentStrategy.validator.ts`, in two modes:
- **AI mode** is the strict JSON schema sent to OpenAI. Over-long text and lists are trimmed rather
  than rejected, blank items are dropped and duplicates removed.
- **Input mode** validates edits with clear messages and hard limits.
- AI output is also normalized (format shares scaled to 100%, weekly total matched to the platform
  plan, hashtag range ordered) and then validated in input mode before it's stored. If it still
  fails, the request returns 502 `AI_INVALID_OUTPUT` and nothing is saved.

**Versions and statuses:**

| Status     | Meaning                                  | Editable by               |
| ---------- | ---------------------------------------- | ------------------------- |
| `DRAFT`    | Generated, not in use                    | Editors, admins, owners   |
| `ACTIVE`   | The workspace's strategy (at most one)   | Admins, owners            |
| `ARCHIVED` | Previously active ("Previous" in the UI) | Nobody; can be reactivated |

- **Generate** and **Regenerate** always create a new draft version (1, 2, 3… per workspace).
  Regenerating reuses the source version's timeframe, platforms and focus unless changed, and can
  include "what should change" instructions. The source version is untouched.
- **Edit/Save** replaces whole sections (and the name). Each save sends the `revision` it loaded; if
  someone saved in between, the API returns 409 and the page offers to reload.
- **Activate** archives the current active strategy and activates the chosen one. A partial unique
  index (`one_active_strategy_per_workspace`) guarantees a single active strategy even under
  concurrent requests.

**API** (`/api/v1/workspaces/:workspaceId/content-strategies`):

| Method  | Path                        | Role    | Notes                                         |
| ------- | --------------------------- | ------- | --------------------------------------------- |
| `GET`   | `/`                         | Member  | Version list (without content)                |
| `GET`   | `/active`                   | Member  | The active strategy, or `null`                |
| `GET`   | `/:strategyId`              | Member  | One version with content                      |
| `POST`  | `/generate`                 | Editor  | `{ name?, timeframe, platforms?, focus? }`    |
| `POST`  | `/:strategyId/regenerate`   | Editor  | `{ timeframe?, platforms?, focus?, instructions? }` |
| `PATCH` | `/:strategyId`              | Editor* | `{ revision, name?, sections? }` (*active: admin) |
| `POST`  | `/:strategyId/activate`     | Admin   | Archives the previous active strategy         |
| `DELETE`| `/:strategyId`              | Editor (drafts) / Admin (active, previous) | Deleting the active one leaves the workspace without a strategy |

Generation uses AI rate limits and records `AIUsage`. The strategy prompt (`2.0.0`) allows 150 s per
attempt with one retry; the frontend waits up to 5 minutes. Strategies are deleted with the workspace.

**Frontend (`/strategy`):** the first strategy is generated from the empty state. Each section has
**Edit**, and backend validation errors appear next to the fields. The overview shows the version
picker (`?version=`), status, Regenerate, Activate, rename, and a warning when the brand profile
changed after generation.

**Tests:** `tests/contentStrategy.test.ts` covers generation with brand context, output cleanup,
versions, regeneration, section validation, revision conflicts, activation (including concurrent
activation and the database index), permissions, workspace isolation and deletion.

## AI Create (posts)

One brief writes one post per platform, and every change is kept as a version. Code:
`models/post.model.ts`, `models/postVersion.model.ts`, `validators/post.validator.ts`,
`services/post.service.ts`, `routes/post.route.ts`; frontend `pages/create/AICreate.tsx` and
`components/create/`.

**A brief** is a topic, optional goal, the platforms, an optional tone and optional instructions.
One AI request writes every platform in the same call, so the model can deliberately make each
version different; near-identical drafts come back as a warning. Generation also uses the brand
profile and the active content strategy (pillars, tone, CTAs, hashtag rules).

**What each platform gets:**

| Platform       | Fields                                                    |
| -------------- | --------------------------------------------------------- |
| LinkedIn       | Hook, body, call to action, post text, hashtags            |
| Instagram      | Caption, hashtags, carousel or reel idea                   |
| Facebook       | Conversational post, few or no hashtags                    |
| TikTok         | Hook, caption, hashtags, shoot idea (the video itself is attached as media) |
| YouTube Shorts | Title, hook, description, hashtags (the video is attached as media) |

Fields a platform doesn't use are cleared on the way in and out, so an Instagram caption never
carries a YouTube title. `text` is always the publishable version.

**Post and PostVersion:** a `Post` holds the platform, the brief, the status
(see the calendar section), its slot on the calendar and a pointer to its current version. Every change appends a
`PostVersion` — nothing is edited in place, and each version records how it was made, what was
asked for, and the model and token cost when AI wrote it. The last 50 versions per post are kept.

**Actions** (all append a version):

| Action              | Route                                   | Notes                                     |
| ------------------- | --------------------------------------- | ----------------------------------------- |
| Generate            | `POST /posts/generate`                  | One post per platform                     |
| Regenerate          | `POST /posts/:id/regenerate`            | A new take on the same brief              |
| Edit                | `PATCH /posts/:id`                      | `{ baseVersion, content }`; 409 if changed |
| Shorten / Expand    | `POST /posts/:id/refine`                | `{ action }`                              |
| Change tone         | `POST /posts/:id/refine`                | `{ action: "CHANGE_TONE", tone }`         |
| Improve hook / CTA  | `POST /posts/:id/refine`                | Rewrites only that part                   |
| Add / remove emojis | `POST /posts/:id/refine`                | Removal is local — no AI request          |
| Generate hashtags   | `POST /posts/:id/refine`                | Fresh set for the platform                |
| Restore             | `POST /posts/:id/versions/:vid/restore` | Brings an old version back as a new one   |
| Status              | `PATCH /posts/:id/status`               | Archived posts are read-only              |

`GET /posts` lists posts (paged, filterable by platform and status) and `GET /posts/:id` returns a
post with its full history. Members read; editors and above write; authors or admins delete. AI
output is validated with the same schema as manual edits before it's stored.

**The page (`/create`)** is a split screen: drafts on the left, then the editor and a platform
preview side by side, with the refine toolbar above and version history under the preview. Unsaved
edits block AI actions (which would replace them), the character counter follows the platform's
limit, and validation errors from the backend appear next to the fields.

**Tests:** `tests/post.test.ts` covers generation per platform, field clearing, duplicate warnings,
strategy context, versioning through regenerate/edit/refine/restore, conflicts, local emoji
removal, listing, status rules, permissions, isolation and deletion.

## Content calendar

Posts carry a status and, when planned, a slot on the calendar. Code:
`models/post.model.ts` (`status`, `pillar`, `scheduledAt`, `publishedAt`),
`services/post.service.ts`, `routes/post.route.ts`; frontend `pages/calendar/Calendar.tsx`,
`components/calendar/` and the time-zone helpers in `lib/timezone.ts`.

**Statuses:**

| Status       | Meaning                                    | Set by                          |
| ------------ | ------------------------------------------ | ------------------------------- |
| `IDEA`       | A slot with a topic, nothing written yet    | People                          |
| `DRAFT`      | Being written                               | People                          |
| `READY`      | Written, waiting for review                 | People                          |
| `APPROVED`   | Cleared to publish                          | People                          |
| `SCHEDULED`  | Queued for its time                         | Scheduling an approved post     |
| `PUBLISHING` | Being sent to the platform                  | The publisher (not built yet)   |
| `PUBLISHED`  | Live                                        | The publisher (not built yet)   |
| `FAILED`     | Publishing failed; fix it and schedule again | The publisher (not built yet)  |

Only the first four can be set directly; the API rejects the rest. `PUBLISHING` and `PUBLISHED`
posts are read-only — the way to change one is to duplicate it. Publishing itself (the BullMQ
worker) isn't built yet, so nothing moves into those statuses on its own.

**Time zones.** The API only ever accepts and returns absolute instants: ISO 8601 with an offset
(`2027-06-15T09:00:00+05:30`), stored in MongoDB as UTC. The workspace time zone is a display
concern: the frontend converts an instant into the day and time a person sees, and converts back
when they pick a date and time, so the same slot looks identical for a teammate in another country.
`lib/timezone.ts` does the conversions with `Intl` (no date library), resolving offsets twice so
daylight-saving changes land on the right side of the shift.

**API** (on top of the AI Create routes):

| Method  | Path                          | Notes                                                        |
| ------- | ----------------------------- | ------------------------------------------------------------ |
| `GET`   | `/posts/calendar`             | `from`/`to` instants, plus `platform`, `status` and `pillar` comma lists; returns the range and the unscheduled backlog |
| `POST`  | `/posts`                      | Create a post directly: topic, platform, pillar, status, optional slot and content. The calendar no longer offers this; posts are written in AI Create |
| `POST`  | `/posts/:id/duplicate`        | Copy as an unscheduled draft with its own history             |
| `PATCH` | `/posts/:id/schedule`         | `{ scheduledAt }` to schedule or reschedule, `null` to unschedule; `publish: true` means "send it then" |
| `PATCH` | `/posts/:id/details`          | Topic, pillar, goal, tone, instructions                       |

A date can mean two things, and `publish` separates them. Pressing **Schedule** sends
`publish: true`: the post is queued (`SCHEDULED`) whatever status it had, so an idea or draft is
moved on rather than being given a time that would never fire. Dragging a card between days leaves
the flag off and only changes the date, so an idea stays an idea and the calendar can still record
what was planned, including past dates. Queueing always needs a future time. Unscheduling a queued
post returns it to `APPROVED`.

**Scheduling from the editor.** `components/schedule/SchedulePicker.tsx` is shared by AI Create and
the calendar's details panel, so a generated post can be scheduled without leaving the editor and
both places behave the same: date and time in the workspace zone, an account picker when there is
more than one connected, and the connect prompt when there is none.

**The page (`/calendar`):** no post creation — posts are written in AI Create and then planned here. Month and week views, drag and drop between days (the time of day is
kept), a details panel for status, topic, pillar and scheduling, filters by platform, status and
content pillar, an unscheduled backlog you can drag posts into, and a link that opens the post in
AI Create. The view and date live in the URL (`?view=week&date=2026-10-12`). Members can view;
editors and above can change things.

**Tests:** `tests/calendar.test.ts` covers creating posts, UTC storage whatever offset is sent,
scheduling rules, the calendar range and filters, duplicating, editing details, the status rules,
locked published posts, permissions and workspace isolation.

## Scheduled publishing (Redis + BullMQ)

Scheduling an approved post queues a delayed job; a separate worker process publishes it. Code:
`models/schedule.model.ts`, `models/publishJob.model.ts`, `models/publishAttempt.model.ts`,
`services/publishing.service.ts`, `queues/publish.queue.ts`, `workers/publish.worker.ts`,
and the worker entry point `src/worker.ts`.

**The flow:**

1. A post with content is scheduled (`PATCH /posts/:id/schedule`).
2. The API validates it: text to publish, a platform that can publish, and one connected account
   (or the `socialAccountId` you name when the workspace has several).
3. A `Schedule` row is saved, then a `PublishJob` row, then the delayed BullMQ job. The database is
   written first, so nothing is queued that can't be found again.
4. At its time the worker loads the job, claims it, loads the account, refreshes the access token
   if it's expired, and calls the provider.
5. The provider's answer is stored on the attempt, the job and the schedule, and the post becomes
   `PUBLISHED` (or `FAILED`).

**Three records, three jobs to do:**

| Model            | Holds                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| `Schedule`       | The intent: post, account, time, status, attempts, result or last error |
| `PublishJob`     | One queued execution: BullMQ id, idempotency key, lock, outcome         |
| `PublishAttempt` | One run: when it started, whether the platform was called, what happened |

Statuses: `SCHEDULED` → `PROCESSING` → `PUBLISHED`, or `FAILED`, or `CANCELLED`.

**A retry never publishes twice.** Four independent guards:

- **One live schedule per post** — a partial unique index (`one_live_schedule_per_post`) rejects a
  second one, so rescheduling can't leave two jobs racing.
- **Deterministic queue ids** (`publish:<scheduleId>:<n>`) — adding the same job twice is a no-op,
  and every attempt of a job shares one idempotency key.
- **An atomic claim** — `findOneAndUpdate` moves the job to `PROCESSING` only from `QUEUED` or a
  stale lock, so two workers can't both run it. Finished jobs report "already published" and stop.
- **Unknown outcomes stop the line** — an attempt records `requestSent` immediately before the
  platform call. If an attempt never finished (a crash, or a timeout mid-request), the schedule is
  marked `FAILED` with `needsReview` and **nothing is retried**: the post may already be live, so a
  person checks. Errors that definitely failed (rate limits, 5xx, network refusals) are retried
  normally.

**Retries and backoff:** up to `PUBLISH_MAX_ATTEMPTS` (default 3) with exponential backoff from
`PUBLISH_BACKOFF_MS` (default 60 s). Only retryable failures rethrow; permanent ones raise BullMQ's
`UnrecoverableError` so the queue stops immediately.

**Recovery after a restart:** delayed jobs live in Redis and survive a restart on their own. On top
of that the worker sweeps every `PUBLISH_RECOVERY_INTERVAL_MS` (default 60 s) and at boot:
jobs claimed by a worker that died are requeued (or failed for review if the platform call had
started), and live schedules whose queue entry has vanished — a flushed or replaced Redis — are
queued again from the database.

**Concurrency** is `PUBLISH_CONCURRENCY` (default 5) jobs per worker process; run more processes to
scale. **Logging** is structured: every line carries the schedule, job, post, platform, workspace,
attempt and worker id.

**Running it:** `npm run dev:worker` (or `npm run start:worker`) beside the API. It needs
`REDIS_URL` and `MONGO_URI`. Settings: `PUBLISH_CONCURRENCY`, `PUBLISH_MAX_ATTEMPTS`,
`PUBLISH_BACKOFF_MS`, `PUBLISH_LOCK_TIMEOUT_MS`, `PUBLISH_RECOVERY_INTERVAL_MS`.

**Scope today:** LinkedIn is the only platform that can publish, and the worker publishes text
posts. Scheduling a post for a platform that can't publish yet is refused with a clear message;
ideas and drafts can still hold any calendar slot.

**API:** `PATCH /posts/:id/schedule` (schedule, reschedule, unschedule, with an optional
`socialAccountId` and the `publish` intent flag) and `GET /posts/:id/schedule` (the schedule with its job and attempt history).
The calendar's details panel shows the publishing status, attempt count, the link to the published
post, and a warning when something needs checking.

**Tests:** `tests/publishing.test.ts` runs the worker against a mock provider and an in-memory
queue: scheduling, publishing, idempotent repeats, two workers racing for one job, retry then
success, exhausted retries, permanent failures, timeouts and crashes that must not republish,
cancellation, token refresh, reconnect-needed accounts, and the three recovery paths.

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
│   ├── ui/             # Button, TextField, TextAreaField, Dropdown, TagInput, ChoiceGroup, Alert, Spinner
│   ├── onboarding/     # OnboardingWizard, OnboardingProgress, BrandProfileReview, steps/
│   ├── workspace/      # WorkspaceSwitcher, WorkspaceCard, WorkspaceForm, ArchivedWorkspaceRow, badges
│   ├── dashboard/      # StatCard, GettingStarted
│   └── shared/ landing/ account/
├── hooks/              # useDismiss, usePageTitle, useUrlToken
└── index.css           # Tailwind v4 + @theme design tokens
```

### Dashboard

Widgets: connected accounts, posts this month, scheduled posts, published posts and engagement
rate (with trends against last month), a 14-day engagement chart, upcoming posts, recent posts
and AI recommendations. A setup checklist shows until everything the user can act on is done.

- **Sample data:** analytics and social integrations don't exist yet, so
  `services/dashboard/dashboardApi.ts` returns generated data from `lib/mockDashboard.ts`, flagged
  with a "Sample data" notice.
  - The data is seeded by workspace and day, so it's stable between refreshes.
  - It's personalised from the brand profile (platforms, topics, keywords, goal).
  - To switch to real data, replace the body of `getSummary` with an API call returning the
    `DashboardSummary` shape from `types/dashboard.ts`.
- **Notifications:** notifications are mocked the same way (`services/notifications`).
- **State previews (development only):** add `?preview=loading`, `?preview=empty` or
  `?preview=error` to `/dashboard` to check each state.
- **Reusable pieces:**
  - `components/shared`: `AsyncContent` (loading → error → empty → content), `EmptyState`,
    `ErrorState`, `PlatformBadge`.
  - `components/ui`: `Skeleton`, `Badge`, `Popover`.
  - `components/dashboard`: `WidgetCard`, `StatCard`.

### Layouts

| Layout            | Used for                                                                          |
| ----------------- | --------------------------------------------------------------------------------- |
| `MarketingLayout` | Landing page (`/`)                                                                |
| `RootLayout`      | Login, signup, password reset, email verification and invitation acceptance      |
| `AppLayout`       | Every signed-in page: sidebar navigation, header (workspace selector, Quick Create, notifications, user menu) and content. Below 1024px the sidebar becomes a drawer and a bottom tab bar appears. |
| `SettingsLayout`  | Tabs shared by the Workspace, Brand profile and Account settings pages            |

### App pages

| Path                        | Page                                                            |
| --------------------------- | --------------------------------------------------------------- |
| `/dashboard`                | Stats, engagement, upcoming/recent posts, AI recommendations and the setup checklist |
| `/media`                    | Images, videos and documents for the current workspace          |
| `/team`                     | Team members and invitations for the current workspace          |
| `/settings/workspace`       | Workspace settings and archiving (Settings tabs)                |
| `/settings/brand-profile`   | Brand onboarding wizard and review (read-only below ADMIN)      |
| `/settings/account`         | Profile, password and sessions                                  |
| `/workspaces`, `/workspaces/new` | Workspace management and creation                          |
| `/strategy`                 | Generate, edit, version and activate the content strategy |
| `/social-accounts`          | Connect LinkedIn; account status, test, reconnect and disconnect |
| `/create`                   | AI Create: brief, per-platform drafts, editor, preview and versions |
| `/calendar`                 | Month and week calendar: plan, schedule, drag and drop, filter |
| `/content`, `/analytics`, `/autopilot`, `/billing` | Placeholders ("Coming soon") listing the planned features |

Old URLs (`/posts`, `/workspace/files`, `/workspace/members`, `/workspace/settings`,
`/workspace/brand-profile`, `/settings/password`) redirect to the new ones and keep their query
string (`legacyRedirects` in `routing/paths.ts`).

**Adding a page**

1. Add its path to `routing/paths.ts`.
2. Add a route under `AppLayout` in `routing/router.tsx` with `handle: { title }`. The title shows
   in the navbar and browser tab. Put pages that act on the current workspace under
   `RequireWorkspace`.
3. Add a sidebar entry in `config/navigation.ts`. `requiresWorkspace` hides it until the user has a
   workspace, and `comingSoon` shows a "Soon" badge.

In development the frontend calls `/api/v1`, which Vite proxies to the backend, so no CORS setup
is needed locally.

## Autopilot

Autopilot picks topics, writes a post for each platform, checks the drafts for repeats and quality, and then either holds them for approval or schedules them. You'll find it at `/autopilot`, with four tabs: review queue, schedule, settings and activity.

### Settings

- Platforms, plus which account to use when a platform has more than one connected
- Posts per week
- Posting days and times, on the workspace clock
- Content pillars (Autopilot rotates through them, least recently used first)
- Formats (tips, how-to, list, story, question, myth vs fact, behind the scenes, opinion)
- Approval on or off
- Most posts per day

Every setting is checked against the workspace plan (`constants/plan.constant.ts`). Billing isn't built yet, so every workspace starts on `FREE` and you change the plan by editing `workspace.plan` in the database.

### Pipeline

1. **Plan.** The worker's sweep runs every `AUTOPILOT_SWEEP_INTERVAL_MS` (default 5 minutes). It creates `AutopilotSlot` rows for the next 7 days. The same settings always give the same posting times, and a unique index on (workspace, time) stops a slot being planned twice.
2. **Claim.** When a slot is due (72 hours ahead with approval on, 24 hours with it off), one worker claims it atomically.
3. **Topic.** The AI suggests three topics for the slot's pillar and format. A suggestion is rejected if it's too close to a topic used in the last 180 days.
4. **Write.** All platforms are written in one request. The prompt lists recent openings the AI must not reuse.
5. **Check.** Each draft is checked for:
   - a repeated hook
   - a copy of an earlier post on the same platform
   - blocking quality problems: too short, over the platform's limit, or a missing required field

   A draft that fails is rewritten once. If it fails again, that platform is dropped for the slot.
6. **Route.** Each written post is created as READY and then:
   - **Approval on:** it's held until someone approves it. Approving schedules it.
   - **Approval off:** it's scheduled, unless something holds it for review:
     - the platform needs media (Instagram, TikTok, YouTube)
     - it contains a placeholder such as `[link]`, or a buzzword
     - the daily limit is reached
     - scheduling fails

### Safeguards

| Risk | How it's handled |
| --- | --- |
| Repeated topics, hooks or posts | Word-overlap scoring against the last 180 days. Every rejection is logged with the text it matched and the score. |
| Too many posts in a day | The daily limit counts everything scheduled, publishing or published that day, not only Autopilot's posts. It's checked when a slot is written, when a post is scheduled and when a post is approved. |
| Plan limits | Posts per week, platforms and posts per day are checked when settings are saved, when Autopilot starts and for each slot. |
| Failed writing | Retried up to 3 times, waiting 5, 10 and 20 minutes. After 3 failures in a row, Autopilot pauses itself with a reason. |
| Failed publishing | The existing publish retries still apply. After 3 failed publishes in a row, Autopilot pauses itself. |
| Crashes | A slot stuck being written is released after 15 minutes. If a crashed run already saved posts, the next run uses those posts instead of writing again. |
| The person who started Autopilot loses edit rights | Autopilot pauses. It always writes as the person who started it. |

### Pausing

Any editor can pause Autopilot with one click; starting it and changing settings need an admin.

- The status changes in a single atomic update, so from that moment nothing new is written or scheduled.
- Posts Autopilot scheduled on its own come off the queue and go back to the review queue.
- A write that finishes after the pause is thrown away.
- The publish worker checks the pause again right before calling the platform, so a job that was already queued is stopped too.
- Posts a person approved still publish, because that was a human decision (`autopilot.approvedBy`).
- Posts taken off the schedule stay in the review queue after you resume. Nothing is rescheduled automatically.

### Audit trail

`AutopilotEvent` is append-only: the schema refuses updates. It records every event, including:

- settings changes, with before and after values
- start, pause and automatic pause
- planning, skipped slots and topic choices
- blocked repeats and failed quality checks
- writing, failures and discarded writes
- held posts, approvals, rejections and expired approvals
- scheduling, publishing, failed publishes and publishes stopped by a pause

Each event records its actor, or null when Autopilot acted on its own. `GET /workspaces/:id/autopilot/events` returns the events a page at a time and can filter them by type.

### API

| Method | Path | Role |
| --- | --- | --- |
| GET | `/autopilot` | member: settings, plan, slots, review queue, stats |
| PUT | `/autopilot/settings` | admin |
| POST | `/autopilot/start` | admin |
| POST | `/autopilot/pause` | editor |
| POST | `/autopilot/posts/:postId/approve` | editor (`scheduledAt` required if the planned time has passed) |
| POST | `/autopilot/posts/:postId/reject` | editor |
| POST | `/autopilot/slots/:slotId/retry` | admin |
| GET | `/autopilot/events` | member |

**Tests:** `tests/autopilot.test.ts` (27 tests) covers the planner (including a daylight saving change), repeat and quality checks, settings validation and plan limits, permissions, both approval modes, every safeguard, pausing (including a paused publish that was already queued, approved posts still publishing, and writing that finishes after a pause) and audit immutability.

## Billing and entitlements

Stripe subscriptions for a user's account, plus one entitlement system that every limit goes through.

### Who pays

A subscription belongs to a **person**. It covers every workspace where that person is the **billing owner**. The billing owner starts as the workspace's creator. If they stop being an owner, billing moves to the longest-standing remaining owner, and that person's plan applies from then on. Every member of a workspace gets its billing owner's plan, and they can see it at `GET /workspaces/:id/entitlements`.

### Plans (`constants/billing.constant.ts`)

| | Free | Creator | Pro | Agency |
| --- | --- | --- | --- | --- |
| Workspaces | 1 | 1 | 3 | 25 |
| Social accounts per workspace | 3 | 5 | 15 | 50 |
| AI generations per period | 30 | 300 | 1,500 | 10,000 |
| Scheduled posts per period | 30 | 150 | 1,000 | 10,000 |
| Team seats per workspace | 1 | 2 | 5 | 25 |
| Media storage | 500 MB | 5 GB | 25 GB | 200 GB |
| Analytics and insights | no | yes | yes | yes |
| Autopilot (posts/week, platforms, posts/day) | no | 3, 2, 3 | 14, 5, 10 | 50, 5, 30 |

This file is the only place limits are defined. Stripe prices decide what's charged, and the table decides what's allowed.

### Enforcement (`services/entitlement.service.ts`)

All checks run on the backend, before the action happens. A blocked action returns `403` with the code `PLAN_LIMIT_REACHED` and details: `limit` or `feature`, `plan`, `used`, `max`, and `upgradePlan`.

| Limit | Checked in |
| --- | --- |
| Workspaces | creating a workspace, restoring an archived one |
| Social accounts | starting OAuth, storing a new or reconnected account |
| Team seats (members plus pending invitations) | inviting, accepting an invitation |
| AI generations | before every AI call, including Autopilot's |
| Scheduled posts | `schedulePublish` (rescheduling a post already counted this period is free) |
| Storage | before uploads reach object storage |
| Analytics | the analytics and insights routes, the collection sweep, weekly insight reports |
| Autopilot | settings, start, planning, each slot (a lapsed plan pauses Autopilot with a reason) |

Usage resets with the Stripe billing period. Without a paid period, it resets on the first of each UTC month. After a downgrade, nothing is deleted: anything already over the new limits stays, but new additions are blocked.

### Trust model

- The plan and status are only written from objects **fetched from Stripe by the server** (`applySubscription`).
- A webhook, or the browser returning from checkout, only triggers that fetch. The event body itself is never trusted.
- Request bodies accept only a plan name and a billing interval (strict schemas), never a price, status or amount.
- The checkout return page sends only a session id. The server fetches that session and checks it belongs to the signed-in user's own Stripe customer.

### Plan in force (`resolvePlan`)

- **active / trialing:** the subscribed plan.
- **past_due:** the subscribed plan until `graceUntil` (`BILLING_GRACE_DAYS`, default 7 days after the first failed payment), then Free.
- **unpaid, canceled, incomplete, paused, or an unmapped price:** Free.
- **No subscription:** `BILLING_DEFAULT_PLAN` (Free in production; self-hosted installs can set a higher plan).

### Flows

| Flow | How |
| --- | --- |
| Checkout | `POST /billing/checkout` creates one Stripe customer per user (idempotency key `customer:<userId>`), then a subscription Checkout Session. The server refuses if the user already has a live subscription. |
| Confirm | `POST /billing/checkout/confirm` fetches the session and syncs the subscription straight away, without waiting for the webhook. |
| Upgrade | Applies now with `proration_behavior: always_invoice` and `payment_behavior: pending_if_incomplete`, so the new plan starts only once the prorated charge succeeds. |
| Downgrade | A subscription schedule switches the price at the end of the current period. You keep the higher plan until then. Choosing the current plan again releases the schedule. |
| Cancel / resume | Cancel sets `cancel_at_period_end` and releases any booked downgrade. Resume clears the cancellation. |
| Portal | `POST /billing/portal` returns a Stripe billing portal URL for the user's own customer. |
| Payment failure | `invoice.payment_failed` and `invoice.payment_action_required` re-sync the subscription. If it's still past due, the failure and grace date are recorded and the user gets one email. A later successful payment clears them. |
| Sync | Webhooks, plus `POST /billing/refresh`, plus a worker reconcile every `BILLING_SYNC_INTERVAL_MS` (default 6 hours) for any subscription that isn't in a final state. |

### Webhooks

`POST /api/v1/billing/webhook` is mounted with `express.raw()` before the JSON parser, so the signature can be checked against the exact bytes Stripe sent. Idempotency works through a unique `eventId` on `StripeWebhookEvent`:

- a processed event is acknowledged as a duplicate and not processed again;
- a failed one is retried on Stripe's next delivery;
- one still being handled returns `409`, so Stripe tries again later.

Because every handler re-fetches from Stripe, the order events arrive in doesn't matter.

**Events to enable in Stripe:**
- `checkout.session.completed`, `checkout.session.async_payment_succeeded`
- `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `.pending_update_applied`, `.pending_update_expired`
- `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`
- `subscription_schedule.updated`, `.released`, `.completed`, `.canceled`
- `customer.deleted`

### Setup

1. In Stripe, create a product for Creator, Pro and Agency, each with a monthly price (yearly is optional).
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and the `STRIPE_PRICE_*` variables. The server refuses to start with only some of the required ones set.
3. Add a webhook endpoint pointing at `/api/v1/billing/webhook` with the events listed above. For local development, use `stripe listen --forward-to localhost:5000/api/v1/billing/webhook`.
4. Configure the Stripe customer portal: allow payment method updates and cancellation.

**Tests:**
- `tests/billing.test.ts` (28 tests) runs against an in-memory fake Stripe gateway (`tests/helpers/fakeStripe.ts`), with webhook signatures checked by Stripe's real verification code.
- `vitest.config.mts` sets `BILLING_DEFAULT_PLAN=AGENCY`, so feature tests aren't limited.
- `tests/helpers/billing.ts` (`setUserPlan`) puts a user on a specific plan.

## Super admin panel

This is a platform operator console at `/admin`, backed by `/api/v1/admin/*`.

### Access

- Users have a system role, `user` or `super_admin`, which is separate from their workspace roles.
- **The role can't be granted through the API.** Only someone with server and database access can grant or remove it:
  ```
  npm run admin:grant -- person@example.com
  npm run admin:revoke -- person@example.com
  # built: node dist/scripts/superAdmin.js grant person@example.com
  ```
  Both write an audit record with source `CLI`.
- `authenticate` reloads the user from the database on every request, and `requireSuperAdmin` checks that role. Revoking the role therefore takes effect on the next request.
- Anyone who isn't a super admin gets `404` from both the API and the page, so the panel doesn't reveal that it exists.
- The admin API has its own per-admin rate limit. Its responses are sent with `Cache-Control: no-store`.

### What it shows

| Section | Contents |
| --- | --- |
| Dashboard | Total, active (last 30 days), paid, new and suspended users; workspaces; subscriptions by status and paying plan; MRR and at-risk MRR; AI requests, tokens and estimated cost; connected accounts; published and failed posts, and failures needing review |
| Users | Search by name or email; filter by status, plan or role; details: account, billing, memberships, sessions, AI spend, admin history; suspend and reactivate |
| Workspaces | Search and filter by status; details: billing owner, plan and usage, members, social accounts, publishing counts, recent failures, Autopilot state |
| Subscriptions | Filter by status, plan or failed payment; details: Stripe ids, amounts, period, booked changes, covered workspaces |
| Plans | Limits from `billing.constant.ts`, configured Stripe price ids, subscribers per plan (active, grace period, past due, cancelling) |
| AI usage | Any range up to a year; by operation, model and day; top workspaces and users; recent failures |
| Connections | Social accounts across all workspaces: status, token expiry, last check, last error |
| Publishing failures | Failed publishes, filterable by platform and whether they need review |
| Audit log | Every audit record, filterable by action and target |

**MRR** uses the amount Stripe charges, copied onto the subscription at sync, with yearly prices divided by 12. Trials aren't counted. Past-due subscriptions are reported separately as at-risk MRR. A subscription synced before amounts were stored falls back to the plan's list price, and the dashboard shows how many did.

Credentials never reach the panel. Social account tokens are never selected, and the user model strips password hashes and token fields.

### Suspension

Suspending a user:
- requires a reason;
- blocks sign-in (checked after the password, so it isn't revealed to someone guessing passwords);
- ends every session: `tokenVersion` is bumped and refresh tokens are revoked;
- stops Autopilot acting as that person, which pauses it with a reason.

Their workspaces, posts and schedules are left alone, since those may belong to a team. Super admins can't suspend themselves or another super admin; that has to go through the role script first. Reactivating also requires a reason.

### AuditLog

Sensitive actions write an `AuditLog` record:
- **Changes:** suspend, reactivate, grant or revoke super admin.
- **Access to personal or billing data:** user details, workspace details, subscription details, usage inspection.

Lists and searches aren't audited, because they only show summary rows. Each record stores the actor and their email at the time, the target, the reason, small metadata, the source (panel or CLI), IP, user agent and request id.

Records are **append-only**: the schema refuses updates and deletes, and no API changes or removes them. The audit write is part of the action:
- a failed audit write fails the action, and a suspension or reactivation is rolled back if its record can't be written;
- detail views record the access before returning any data.

The panel fetches detail pages once per visit (no refetch on window focus), and updates the page in place after suspending or reactivating instead of refetching. This keeps "viewed" records meaningful rather than noisy.

**Tests:**
- `tests/admin.test.ts` (20 tests) covers access and role revocation, dashboard numbers including MRR, search, filters and pagination, secrets never returned, suspension (sessions ended, sign-in and refresh refused, Autopilot paused), rollback when the audit write fails, append-only records, and each management endpoint.
- The browser check covered the full panel flow, including a suspended member failing to sign in.

## Real-time notifications

The bell in the top bar shows notifications stored per user in MongoDB (`Notification`, kept 90 days by a TTL index) and delivered live over Server-Sent Events.

| Event | Who is notified |
| --- | --- |
| Post published | The post's author |
| Publish failed or result unknown | The author, plus workspace owners and admins |
| Autopilot posts held for review (once per slot) | Whoever started Autopilot, plus owners and admins |
| Autopilot paused itself | Whoever started Autopilot, plus owners and admins |
| Social account needs reconnecting (on the status change) | Owners and admins |
| Invitation accepted | The person who sent it |
| Your role changed / you were removed | That member (removal is account-level) |
| Payment failed (first failure) | The billing account's user (account-level) |
| Weekly insights report ready | Owners and admins |

**How delivery works**

- Services call `NotificationEvents.*` (`services/notificationEvents.service.ts`), which stores one row per recipient and never throws, so a notification failure can't break the action that caused it. A `dedupeKey` (unique per user) keeps job retries and webhook redeliveries from notifying twice. Links are restricted to in-app paths.
- New rows go onto a bus. The API and worker use Redis pub/sub (`flowpost:notifications`), so a notification created by the worker, or on another API instance, reaches whichever instance holds the user's connection. Tests use an in-process bus.
- `GET /api/v1/notifications/stream` is the event stream. It authenticates with the normal `Authorization: Bearer` header (the browser reads it with `fetch`, because `EventSource` can't send headers, and tokens never go in URLs). A heartbeat every 25 s re-checks the account and closes the stream with a `revoked` event after logout-everywhere, a password change or suspension. Streams close after an hour so clients reconnect with a current token; each user can hold 5 at once. Compression is skipped for the stream, and shutdown closes all open streams before the server stops.
- `GET /api/v1/notifications?workspaceId=` lists the newest 30 (that workspace plus account-level ones) with the unread count; `before=<ISO date>` pages back. `GET /notifications/unread-count` and `POST /notifications/read` (`{ ids }` or `{ all: true }`, optional `workspaceId`) complete the API.

**Frontend.** `useNotificationStream` keeps one connection per tab, reconnects with exponential backoff (refreshing the session on 401), refetches the list after every reconnect to catch up, adds incoming notifications to the bell, shows a toast, and refreshes the affected data (posts, calendar, Autopilot, social accounts, team, billing, insights). While the stream is down, the list polls every 60 s.

**Deploying behind a proxy.** The stream needs unbuffered, long-lived responses: disable response buffering for `/api/v1/notifications/stream` (the API already sends `X-Accel-Buffering: no` for Nginx) and set the proxy's idle or read timeout above 25 seconds.
