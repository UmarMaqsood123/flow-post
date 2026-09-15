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
`components/ui/Dropzone`, the Media page (`/media`, with All files, Images, Videos and
Documents tabs), and the `useUploadFile` and
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
- **LinkedIn** is the first real provider (see [LinkedIn](#linkedin)).
- **The others** are placeholder providers. Each lists its planned capabilities, reports
  `available: false`, and fails every call with `NOT_IMPLEMENTED`.

```
backend/src/integrations/social
├── capabilities.ts   # capability list, capability → method map, helpers
├── provider.ts       # SocialProvider interface + BaseSocialProvider
├── types.ts          # platform-neutral inputs/outputs (tokens, profile, posts, analytics)
├── errors.ts         # SocialProviderError kinds
├── registry.ts       # SocialProviderRegistry (one provider per platform)
└── providers/        # one factory per platform (currently NotImplementedSocialProvider)
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

## AI service layer

AI features go through a provider abstraction, so controllers and features never depend on a
vendor API. OpenAI is the first provider.

```
integrations/ai/
  types.ts            AIProvider interface, structured-generation request/result, token usage
  errors.ts           AIProviderError with kinds (TIMEOUT, RATE_LIMITED, REFUSED, INVALID_OUTPUT, …)
  openai.provider.ts  OpenAIProvider: Responses API, strict JSON schema, timeouts and retries
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

**Setup:** set `OPENAI_API_KEY` in `backend/.env`. Optional: `OPENAI_MODEL` (default
`gpt-5.6-terra`), `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_OUTPUT_TOKENS`, and
`AI_PROVIDER=none` to disable AI. Without a key, AI routes return 503 `AI_NOT_CONFIGURED`.

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
| TikTok         | Hook, scene-by-scene script, caption, hashtags, shoot idea |
| YouTube Shorts | Title, hook, script, description, hashtags                 |

Fields a platform doesn't use are cleared on the way in and out, so an Instagram caption never
carries a YouTube title. `text` is always the publishable version.

**Post and PostVersion:** a `Post` holds the platform, the brief, the status
(`DRAFT`/`READY`/`ARCHIVED`) and a pointer to its current version. Every change appends a
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
| `/content`, `/calendar`, `/analytics`, `/autopilot`, `/billing` | Placeholders ("Coming soon") listing the planned features |

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
