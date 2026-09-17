# FlowPost production-readiness review

Reviewed 2026-09-17. **Scope:** authentication, authorization and workspace isolation, OAuth and token encryption, social API handling, AI and prompt injection, rate limiting, input validation, MongoDB indexes, Redis/BullMQ, retries and idempotency, Stripe webhooks, logging, error handling, CORS/Helmet, secrets and environment configuration.

**No new product features were added.**

## Verification

| Check | Result |
| --- | --- |
| Backend TypeScript (`tsc --noEmit`, build config) | Pass |
| Backend ESLint / Prettier | Pass |
| Backend unit + integration tests (Vitest, in-memory MongoDB) | 513 passed, including 13 new tests for the fixes below |
| Frontend TypeScript / ESLint / production build | Pass |
| `npm audit --omit=dev` (backend and frontend) | 0 vulnerabilities |
| Index build against a real MongoDB (`npm run db:indexes`, run twice) | All indexes created; second run confirms none missing |

---

## Critical issues

All critical issues found were fixed (see Resolved). **None remain open.**

## High-priority issues (open)

1. **Video uploads are held fully in memory.** Every provider loads the whole video into memory before uploading.
   - Mitigated: the extra copy is gone, and uploads are capped per worker (`PUBLISH_VIDEO_CONCURRENCY`, default 2).
   - Worker memory must still be sized for `PUBLISH_VIDEO_CONCURRENCY × largest allowed video`.
   - Proper fix: stream uploads in ranged chunks (YouTube resumable, TikTok chunks, Meta `file_offset`).
2. **Media files are served from permanent public URLs.** Anyone who once had a URL, including a removed member, can still download the file.
   - Needs a private bucket plus signed URLs, or an authenticated download route. That's a storage-design change.
   - Until then, confirm the bucket policy is intentional.

## Medium-priority issues (open)

1. **Plan limits are check-then-act.** Concurrent requests can overshoot limits (AI generations, seats, social accounts, storage) by a few. Per-user and per-workspace rate limits bound it. A hard guarantee needs atomic usage counters.
2. **AI usage only counts successful calls.** Failed or incomplete AI calls cost money but don't use quota. Consider token-weighted units.
3. **Billing ownership moves without consent.** When the paying owner leaves, billing moves to the oldest remaining owner, with no acceptance step and no limit check. This is a product/policy decision.
4. **No content moderation before Autopilot auto-publishes.** With approval off, content passes only the repeat and quality checks. Recommended: keep approval on, or add a moderation step (a feature, so not added here).
5. **Long AI generations stay in the HTTP request.** A strategy generation can take over 2 minutes, and client disconnects don't cancel it, so users retrying can pay twice. Proxy timeouts must allow it, or the work should move to the queue.
6. **One BullMQ attempt counter and one DB counter.** A stalled job re-run can drift the two retry counts apart. Retry limits are still enforced by the DB claim, and outcome-unknown attempts are never retried.
7. **Payment and verification emails are fire-and-forget.** There is no retry queue, so a mail outage loses them.
8. **Stripe events for customers we don't know are acknowledged and dropped.** An alert is logged. Reconcile can't recover them.
9. **Encryption key rotation is lazy.** Tokens are re-encrypted only when an account is used, so the previous keys can't be removed until every account has been touched. A batch re-encryption script is recommended before removing a key.
10. **Meta token exchange uses GET query strings.** `client_secret` and `code` travel in the query string, per Meta's documented flow. It's TLS-only, but proxies could log it.
11. **Single-host sweeps.** Analytics, insights and billing reconcile guard against overlap within a process, and unique indexes prevent duplicate reports. They are not fully coordinated across several worker replicas, which just repeats work. **Run one worker replica** until a distributed lock is added. Publishing itself is safe with many workers.

---

## Resolved issues (fixed in this review)

### Critical
- **Indexes were never built in production** (`autoIndex` is off in production, and nothing created them). Several guarantees depended on unique or TTL indexes:
  - webhook deduplication;
  - one live schedule per post;
  - one billing account per user;
  - token expiry.

  Fix:
  - added `npm run db:indexes` (`src/scripts/syncIndexes.ts`), which creates missing indexes and never drops anything;
  - in production, the API and worker **refuse to start** if any declared index is missing (`src/config/indexes.ts`).
- **Duplicate publishing: a stale schedule overwrote a cancellation.** The worker read the schedule, then saved it back as PROCESSING or SCHEDULED, which could revive a schedule the user had cancelled or replaced, so the post went out twice. Now:
  - the worker claims the schedule atomically (`isLive` + status) after claiming the job;
  - every later transition is a conditional update;
  - success is recorded by id.
- **Duplicate publishing: cancelling during an in-flight publish.** A reschedule could cancel a schedule that was already being sent and create a second one. `cancelLiveSchedule` is now atomic and **refuses (409) while a publish is in progress**.
- **Duplicate publishing: lock expiry during long uploads.** Recovery could reclaim a job that was still uploading. The worker now renews its lock with a heartbeat, and recovery claims abandoned jobs atomically, so only one sweep handles each one.
- **Stuck publishes after a crash.** Recovery checked `queue.has()`, which counted BullMQ's *completed/failed* retained jobs, so re-adding silently did nothing and the post never went out. `has()` now counts only waiting, delayed or active jobs, and recovery removes finished entries before re-adding.

### High
- **Prompt injection through nested tags.** `</user_re</user_request>quest>` reassembled into a real closing tag after one sanitize pass. The sanitizer now:
  - folds look-alike characters (NFKC);
  - strips invisible characters;
  - matches tags with whitespace or attributes;
  - repeats until the text stops changing.

  Every data tag is now declared as reference data in the shared instructions, and `tagged()` only accepts known tag names.
- **Recovery checked only an unsorted first 200 queued jobs.** It now scans jobs due within 15 minutes, sorted by due time (with an index), so every job is checked as it approaches.
- **Redis outage hung requests.** The shared producer and rate-limit connection had infinite retries and an offline queue. It now fails fast (`maxRetriesPerRequest: 2`, no offline queue). General rate limits fail open when Redis is down; credential limits fail closed.
- **Social token refresh race.** Concurrent refreshes spent rotating refresh tokens (TikTok) and marked accounts for reconnection. There is now a per-account refresh lease; waiting processes reuse the refreshed token.
- **Throttled token refreshes forced a reconnect.** 429/408 responses from TikTok, Google and LinkedIn token endpoints are now retryable rate limits, not "reauth required".
- **OAuth codes in logs.** Request logs and 404 messages included query strings, which carry `code`/`state` on callbacks. Logs now contain the path only, and incoming request ids are restricted to a safe character set.
- **Two checkout sessions from two tabs.** Checkout now uses a Stripe idempotency key per user, price and 10-minute window, so repeat clicks reuse one session.
- **Upgrade call rejected by Stripe.** `cancel_at_period_end` was sent together with `payment_behavior: pending_if_incomplete`. It's now a separate call, and upgrades carry an idempotency key.
- **Failed subscription schedule release was swallowed.** Only "already released/completed" errors are ignored now; anything else stops the plan change.
- **Posts in archived workspaces still published.** Archiving now:
  - cancels live schedules;
  - pauses Autopilot.

  The worker refuses to publish for any non-active workspace, and analytics collection skips archived workspaces.

### Medium
- **Environment guards for production.** Startup now fails unless:
  - `TRUST_PROXY ≥ 1`;
  - `RATE_LIMIT_STORE=redis`;
  - `FRONTEND_URL` and `CORS_ORIGINS` use https.
- **Anyone could lock a user out of login** with 5 wrong passwords. Failures are now limited per email **and IP** (5 per 15 minutes), plus a per-account ceiling across all IPs (50 per hour).
- **Refresh racing "log out everywhere" or a password change** could keep a session alive. Refresh now compares the session version before and after rotating and revokes the new token if it changed.
- **Password flows:**
  - changing the password increments `tokenVersion` atomically and invalidates outstanding reset links;
  - a reset validates its token before the expensive hash.
- **Concurrent Stripe syncs overwrote each other.** Optimistic concurrency on `BillingAccount`, with retry from a fresh Stripe fetch. Payment-failure state is written conditionally, so a later success isn't undone.
- **Removing owners at the same moment could leave zero owners.** The removal is rolled back if it would.
- **Connection drafts** (choosing a Page after OAuth) are now bound to the admin who authorized, honor expiry immediately, and are claimed atomically so each completes once.
- **OAuth callback** re-checks that the user isn't suspended.
- **Invitations** stop working if the person who sent them was removed or demoted.
- **Direct-publish endpoint** (`POST /social-accounts/:id/posts`) bypassed approval and plan limits. It's now admin-only and checks the publishing quota.
- **Analytics sweep:**
  - stops calling an account after a rate-limit or auth failure;
  - never runs overlapping collections.
- **Weekly AI reports:** a unique index allows one automatic report per workspace per week.
- **Autopilot:**
  - a unique index allows one post per slot and platform;
  - a scheduling failure after writing no longer counts as a generation failure;
  - a post held for review has its live schedule cancelled, so it can't go out.
- **Worker shutdown** waited only 15 seconds, cutting uploads mid-flight. It's now configurable (`WORKER_SHUTDOWN_TIMEOUT_MS`, default 5 minutes), and stalled jobs are logged.
- **Job numbering race** when two jobs were created at once: now retried on duplicate key.
- **Graph API pagination** could follow links to any host with the user's token. It's now limited to Meta's Graph hosts.
- **Missing indexes added** for hot queries:
  - Schedule `(workspace, createdAt)` and `(workspace, socialAccount, publishedAt)`;
  - PostVersion `(workspace, post)`;
  - Post `(workspace, updatedAt)`, `(workspace, status, publishedAt)`, `(workspace, status, scheduledAt)`;
  - PublishJob `(status, runAt)`;
  - AuditLog `(targetId, createdAt)`;
  - Workspace `(status, createdAt)`;
  - User `(activeWorkspace)`.
- **Body-parser client errors** (bad charset or encoding, aborted uploads) now return 400 instead of 500. URL-encoded parsing is flat (`extended: false`).

### Verified sound (no change needed)
- **Access tokens:** JWT is pinned to HS256 and checks issuer, audience, expiry and type. `tokenVersion` is re-checked from the database on every request.
- **Refresh tokens:** hashed, rotated atomically, and a reused token revokes its whole family.
- **Cookies and CSRF:** `httpOnly`, `secure` in production, path-scoped. A custom CSRF header is required, and CORS uses an allow-list only.
- **Passwords and one-time links:** argon2id with a dummy hash for unknown emails. Reset and verification tokens are hashed, expire, and are consumed atomically.
- **Workspace isolation:**
  - every tenant query I traced is limited to the authorized workspace;
  - a query without a workspace filter throws;
  - aggregations `$match` on workspace first;
  - media attachments are checked against the workspace.
- **Token encryption:** AES-256-GCM with a random IV and a tag bound to the account (workspace, platform, account, field). Tokens are never selected, serialized or logged.
- **OAuth state:** hashed, bound to the browser, single-use and expiring. The redirect URI is fixed, and platform errors are never reflected.
- **Admin API:** super admin only (404 for everyone else). Changes and detail views are audited, and the audit log is append-only.
- **Stripe:** signatures are verified on the raw body, the plan is never taken from the client, and the webhook claim/lease logic is idempotent.
- **Uploads:** file type detected from magic bytes, size limits applied, temp files cleaned up. The frontend never renders AI output as HTML.
- **Process safety:** handlers for unhandled rejections and uncaught exceptions, and graceful shutdown for the API and worker.

---

## Remaining external configuration

| Area | What to set up |
| --- | --- |
| MongoDB | Replica set (Atlas or self-hosted), backups, a user with least privilege; run `npm run db:indexes` on every deploy **before** starting processes |
| Redis | Managed Redis with persistence (AOF), `maxmemory-policy noeviction` (BullMQ requirement), TLS URL |
| Secrets manager | `JWT_ACCESS_SECRET` (≥32 random chars), `TOKEN_ENCRYPTION_KEY` (32 bytes base64), Stripe keys, OAuth client secrets, SMTP credentials, OpenAI key |
| Stripe | Products and prices for Creator/Pro/Agency, webhook endpoint `https://<api>/api/v1/billing/webhook` with the events listed in the README, customer portal configured |
| Meta / TikTok / Google / LinkedIn | Production apps, HTTPS redirect URIs matching the env values, app review for publishing and insights scopes |
| Object storage | Bucket and credentials; decide public-read vs private (see open High #2); CORS for the frontend origin if browser uploads are added |
| Email | SMTP provider with SPF, DKIM and DMARC for the sending domain |
| Edge | TLS termination, a load balancer whose hop count matches `TRUST_PROXY`, request timeout ≥ longest AI generation (~5 min) or move those to the queue; no response buffering and an idle timeout above 25 s for `/api/v1/notifications/stream` |
| Orchestrator | Worker `terminationGracePeriod` ≥ `WORKER_SHUTDOWN_TIMEOUT_MS`; worker memory ≥ `PUBLISH_VIDEO_CONCURRENCY × max video size × ~1.5`; **one worker replica** (see medium #11) |
| Monitoring | Log shipping with alerts on `fatal`, "Publish job failed", "Subscription doesn't belong to any billing account", "Autopilot paused itself", "Database indexes are missing"; health checks on `/api/v1/health/ready` |
| Super admin | Grant with `npm run admin:grant -- email` from a trusted host |

## Deployment checklist

1. [ ] `NODE_ENV=production` set explicitly for the API, worker and scripts.
2. [ ] All secrets in a secrets manager; `.env` files not deployed; the `backend/.env.backup-*` files removed from servers and never committed.
3. [ ] `TRUST_PROXY` = number of proxies in front of the API; `RATE_LIMIT_STORE=redis`.
4. [ ] `FRONTEND_URL` and `CORS_ORIGINS` are the https production origins; `COOKIE_SAME_SITE` matches the domain setup (`none` only if the API is on another site).
5. [ ] `TOKEN_ENCRYPTION_KEY` generated once and backed up (losing it disconnects every social account).
6. [ ] `BILLING_DEFAULT_PLAN=FREE`; Stripe live keys, webhook secret and all monthly price ids set.
7. [ ] OAuth redirect URIs registered with each platform exactly as configured.
8. [ ] `npm ci && npm run build` for the backend; `npm run db:indexes` against production MongoDB.
9. [ ] Start the API, then **one** worker; confirm startup logs show no "indexes are missing" and the Redis connections are "ready".
10. [ ] Check `GET /api/v1/health/ready` returns 200.
11. [ ] Stripe test: send a test webhook from the dashboard, then check the response is 200 and a second delivery of the same event is reported as `duplicate`.
12. [ ] Connect one account per platform, schedule a text post 5 minutes out, and confirm it publishes once.
13. [ ] Frontend: `VITE_API_BASE_URL` points at the production API; `npm run build`; serve over HTTPS with SPA fallback.
14. [ ] Grant the first super admin and confirm `/admin` works for them and returns 404 for others.
15. [ ] Alerts wired (see Monitoring) and a restore from the database backup tested once.
16. [ ] Open the app in two tabs, trigger a notification (for example, accept an invitation) and confirm the bell updates in both without a reload, through the production proxy.
