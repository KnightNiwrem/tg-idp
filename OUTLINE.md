# Telegram Bot Identity Provider (`tg-idp`): Outline

> **Note:** This document is the initial outline of the project, not a finalised specification. It directs implementation, and may be updated or reworked based on findings as implementation empirically reveals gaps or contradictions.

`tg-idp` is a standalone key registry and provisioning CLI for Telegram bots. It lets a bot prove ownership of its identity via Telegram's **Bot-to-Bot Communication** (Bot API 10.0+) and register Ed25519 public keys. Downstream services can then verify bot requests using short-lived, client-signed JWTs without ever handling a Telegram bot token.

## How It Works

`tg-idp` runs as a single service backed by one database with two interfaces: a Telegram **Auth Bot** (for identity proofs) and an **HTTP API** (for key management and public key distribution). Telegram is only used to prove bot ownership when creating a short-lived **management key**; everything else happens over HTTP.

1. **Create a management key (via Telegram)**
   - The bot owner runs the CLI locally with their `BOT_TOKEN`. The token never leaves the owner's machine.
   - The CLI resolves `botId` via Telegram's `getMe`, generates an ephemeral Ed25519 keypair, and registers a pending management key via `POST /v1/registrations`, receiving a single-use `code`.
   - The CLI uses `BOT_TOKEN` to send `/confirm <code>` to `@<AuthBot>` via Telegram's `sendMessage`.
   - Telegram delivers the private message to the Auth Bot with a verified `message.from.id` (`botId`) and `message.from.is_bot === true`.
   - If `botId` matches the pending registration, the Auth Bot atomically cancels any other pending registrations for that bot, replaces the bot's active management key with the new one, and marks the registration `confirmed`.
   - The Auth Bot never replies. The CLI polls `GET /v1/registrations/:code` until the status changes from `pending` to `confirmed`, `cancelled`, or `expired`.

2. **Manage service keys (over HTTP)**
   - Using short-lived JWTs signed by the active management key, the owner registers service keys scoped to specific downstream services (`audiences`), updates those audiences, revokes one or all service keys, or revokes the management key early.
   - Each bot holds at most one active management key; confirming a new one immediately invalidates the old one.
   - Service keys have a separate cap and cannot call management endpoints, so exhausting the service-key cap never blocks administrative recovery.

3. **Verify requests at runtime (downstream services)**
   - Downstream services never talk to Telegram. They fetch a bot's service keys from the IdP's JWKS endpoint, cache them, and verify per-request Ed25519 JWTs signed by the bot's service private key.

### Why Telegram Only Confirms a Single-Use Code

Telegram updates can be delayed or redelivered, and the Auth Bot cannot reliably send status replies back to the calling bot. Passing commands like key creation or revocation over Telegram would require deduplication, ordering guarantees, and a separate feedback channel. A single-use code avoids all of that: a redelivered `/confirm` hits an already-consumed code and is ignored, a delayed one finds the code expired or cancelled, and the IdP remains the single source of truth for timing and state.

## Core Concepts

### Keys and `kid`

- **Public key format:** 32-byte raw Ed25519 public key (rejecting small-order points), encoded as unpadded base64url.
- **Key ID (`kid`):** First 16 characters of `base64url(SHA-256(rawPubKeyBytes))`. Because it is deterministic, the CLI and IdP derive the same `kid` independently.

| Property              | Management Key                             | Service Key                           |
| --------------------- | ------------------------------------------ | ------------------------------------- |
| **Purpose**           | Admin HTTP endpoints on the IdP            | Authenticating to downstream services |
| **Created via**       | Telegram `/confirm` flow                   | `POST /v1/bots/:botId/keys`           |
| **Cap per bot**       | **1** (new `/confirm` replaces old)        | **10** (configurable; rejects at cap) |
| **Lifetime**          | Short-lived (configurable; default 30 min) | Long-lived until revoked              |
| **Published in JWKS** | Never                                      | Yes                                   |

- At the service-key cap, registering a new `kid` returns `409 key_limit_reached` without evicting existing keys.
- Re-registering an existing service `kid` with the same public key overwrites its `audiences` and keeps its original `createdAt`.

### Audiences

- Every service key must specify a non-empty list of allowed audiences naming the downstream services it may authenticate to (e.g., `session`, `analytics`).
- Each audience entry must match `^([A-Za-z0-9._-]+|\*)$` (alphanumeric plus `.`, `_`, `-`, or standalone `*`).
- `idp` is reserved for management JWTs and is rejected if supplied in a service key's audience list.
- `*` matches every downstream service audience, never `idp`.
- A service key allows an audience `a` if `a !== "idp"` and its list contains either `a` or `*`. Both the diagnostic `/v1/auth/verify` endpoint and downstream verifiers apply this rule.

### JWT Format

All bot-signed JWTs use the fully-specified `Ed25519` algorithm (RFC 9864) and must carry `kid` in the header and `sub`, `aud`, `iat`, `exp`, and `jti` in the payload:

```json
// Header
{ "alg": "Ed25519", "kid": "a1b2c3d4e5f6g7h8" }

// Payload (service token; management tokens use "aud": "idp")
{
  "sub": "1234567890",
  "aud": "session",
  "iat": 1732752000,
  "exp": 1732752300,
  "jti": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```

- `sub` is the `botId` encoded as a decimal string.
- `aud` must be a single string (not an array). Management tokens require `aud === "idp"`; service tokens require an `aud` allowed by the signing service key.
- `iat` and `exp` are Unix epoch seconds with `exp > iat`, validated explicitly against `iat <= now + clockSkew`, `exp > now - clockSkew`, and `exp - iat <= maxLifetime`.
- `jti` is a non-empty string (1–128 printable ASCII characters) required on every token. The IdP enforces replay protection on management JWTs (scoped per `(botId, jti)` until `exp` + clock skew); downstream services may optionally enforce replay protection on service JWTs.

### Credential Formats

The provisioning CLI outputs self-contained, base64url-encoded JSON credentials whose `privKey` is an Ed25519 private JWK (`{ kty, crv, x, d }`):

- **Service credential:** `botidp_v1_<base64url>` encoding `{ v: 1, botId, kid, privKey }`.
- **Management credential:** `botidp_mgmt_v1_<base64url>` encoding `{ v: 1, botId, kid, privKey, expiresAt }` (where `expiresAt` is Unix epoch seconds).

### Defaults and Limits

All limits and durations are configurable unless noted as fixed:

| Setting                             | Default         | Scope                                                    |
| ----------------------------------- | --------------- | -------------------------------------------------------- |
| Management key cap                  | **1** (fixed)   | Active management keys per bot                           |
| Management key TTL                  | **30 minutes**  | Lifetime of a confirmed management key                   |
| Service key cap                     | **10**          | Active service keys per bot                              |
| Pending registration TTL            | **5 minutes**   | Window to confirm `/confirm <code>`                      |
| Finished registration retention     | **24 hours**    | Retention before purging resolved registrations          |
| Service JWT max lifetime            | **300 seconds** | Maximum `exp - iat` for downstream tokens                |
| Management JWT max lifetime         | **60 seconds**  | Maximum `exp - iat` for IdP management tokens            |
| JWT clock-skew tolerance            | **±30 seconds** | Applied to `iat`/`exp` (not to management key TTL)       |
| Auth Bot rate limit                 | **10 / minute** | Per-`botId` private bot messages                         |
| JWKS `Cache-Control` `max-age`      | **60 seconds**  | HTTP cache header on `/jwks`                             |
| Reference verifier cache TTL        | **10 minutes**  | Per-bot cached JWKS lifetime                             |
| Reference verifier refetch cooldown | **30 seconds**  | Minimum interval between unknown-`kid` refetches per bot |

## System Components

### 1. Auth Bot (Telegram Interface)

- Supports webhook mode for production and long-polling for local development.
- **Webhook verification:** Configure a webhook `secret_token` and validate `X-Telegram-Bot-Api-Secret-Token` using constant-time comparison. Requests with a missing or mismatched secret are rejected with `401` or `403` before update dispatch.
- **Update handling:**
  - Process only `message` updates where `chat.type === "private"` and `from?.is_bot === true`. Ignore everything else (including `edited_message`).
  - Enforce the per-`botId` rate limit on accepted private bot messages.
  - **Never send a reply.** This prevents bot-to-bot reply loops; callers observe outcomes via the HTTP registration endpoint.
  - Return `2xx` to Telegram for all authenticated updates (handled, ignored, or rate-limited) so Telegram does not redeliver them.
- **`/confirm <code>` semantics:** Accepts `/confirm <code>` (or `/confirm@<authBotUsername> <code>`) and executes atomically:
  1. Look up `<code>`. If missing, expired, or not `pending`, do nothing.
  2. If `registration.botId !== message.from.id`, do nothing and leave the registration `pending` so another bot cannot consume or cancel it.
  3. Mark all other `pending` registrations for `botId` as `cancelled` so a delayed `/confirm` from an earlier session cannot overwrite the new key.
  4. Replace the bot's single management key with the registration's key (`expiresAt = now + managementKeyTtl`).
  5. Mark the registration `confirmed` and record `managementKeyExpiresAt`.

### 2. Data Model and Consistency

- **Entities:**
  - **Management key** (unique on `botId`): `botId` (positive safe integer; Telegram IDs use at most 52 significant bits, stored as 64-bit integer in SQLite), `kid`, `publicKey`, `createdAt`, `expiresAt`. Expired rows are retained until replaced by a new `/confirm` or deleted via `DELETE /management-key` so callers receive `401 management_key_expired` rather than `401 unknown_key`.
  - **Service key** (unique on `(botId, kid)`): `botId`, `kid`, `publicKey`, `audiences`, `createdAt`.
  - **Registration** (unique on `code`): `code` (≥128 bits CSPRNG, base64url), `botId`, `kid`, `publicKey`, `status` (`pending` | `confirmed` | `cancelled` | `expired`), `createdAt`, `expiresAt`, `managementKeyExpiresAt?`.
  - **Used management token** (unique on `(botId, jti)`): retained until `exp` + clock skew.
- **Atomicity:** Multi-step state transitions (confirming a registration, upserting a service key against the cap, atomic replacement, and revocations) must execute atomically in a write transaction that acquires its write lock before its first read (`BEGIN IMMEDIATE`), preventing races on key-cap counts, pending checks, and cancellations. Write transactions must not perform external I/O (libSQL remote write transactions have a 5-second hard completion timeout).
- **Cleanup:** Expired registrations (past retention) and expired used-token records are purged periodically or opportunistically on writes so the design works cleanly on serverless runtimes without background timers.

### 3. HTTP API

The HTTP API never accepts, logs, or stores Telegram bot tokens. All timestamps on the wire are integer Unix epoch seconds. All responses except JWKS set `Cache-Control: no-store`. Errors return JSON in the form `{ "error": "<code>" }`.

#### Management Key Registrations (Unauthenticated)

- **`POST /v1/registrations`**
  - Body: `{ "botId": 123, "publicKey": "<base64url>" }`.
  - Validates `botId` as a positive safe integer (`400 invalid_bot_id`) and `publicKey` as a valid non-small-order 32-byte Ed25519 key (`400 invalid_public_key`).
  - Creates a pending management-key registration and returns `201 { "code", "kid", "status": "pending", "expiresAt" }`.
  - Deliberately has **no per-`botId` pending cap**: capping an unauthenticated endpoint would let anyone block a bot from registering. Pending rows are small, short-lived, and purged after retention.
- **`GET /v1/registrations/:code`**
  - Returns `200 { "status", "botId", "kid", "expiresAt", "managementKeyExpiresAt"? }` (reporting `expired` when `status` is `pending` and `now >= expiresAt`), or `404` for an unknown code.

#### Key Management (Management Key Auth)

All endpoints below require `Authorization: Bearer <jwt>` signed by the bot's active management key (see [JWT Format](#jwt-format)). Validation runs in this order:

1. Parse header/claims and verify `alg === "Ed25519"`, string `aud === "idp"`, `0 < exp - iat <= 60`, `iat <= now + 30`, and `exp > now - 30` (`401`).
2. Look up the management key for `sub` (`401 unknown_key` if missing or `kid` does not match, including service keys or superseded management keys).
3. Verify the Ed25519 signature (`401 invalid_signature`).
4. Check `now < managementKey.expiresAt` with zero clock skew (`401 management_key_expired`).
5. Check `sub === :botId` in the path (`403 forbidden`).
6. Atomically record `(botId, jti)` (`401 token_replayed` if already used).

Endpoints:

- **`POST /v1/bots/:botId/keys`** — Register a service key or update an existing key's audiences.
  - Body: `{ "publicKey": "<base64url>", "audiences": ["session"], "replaceAll": false }` (`replaceAll` is optional, default `false`).
  - Validates `publicKey` (`400 invalid_public_key`) and `audiences` (`400 invalid_audiences`).
  - When `replaceAll` is `true`, atomically removes all existing service keys for `:botId` and inserts the new key in a single write transaction.
  - Otherwise, enforces the service-key cap (`409 key_limit_reached` for a new `kid` at the cap; `409 kid_collision` if `(botId, kid)` exists with a different public key) and upserts on `(botId, kid)` (overwriting `audiences` and preserving `createdAt` for an existing `kid`).
  - Returns `201` (created) or `200` (updated) with `{ "botId", "kid", "audiences", "createdAt" }`.
- **`DELETE /v1/bots/:botId/keys/:kid`** — Revoke one service key.
- **`DELETE /v1/bots/:botId/keys`** — Revoke all service keys for `:botId` while leaving the active management key intact so the caller can immediately mint replacements.
  - Both `DELETE /keys` endpoints return `200 { "revoked": ["<kid>", ...] }` and are idempotent (missing keys return an empty list).
- **`DELETE /v1/bots/:botId/management-key`** — Revoke the active management key immediately. Returns `200 { "revoked": true }`. Because this deletes the signing key itself, a retry after a lost response receives `401 unknown_key`.

#### Public Keys, Verification, and Health

- **`GET /v1/bots/:botId/jwks`**
  - Returns a JWK Set of all active **service keys** for `:botId` (never the management key):

    ```json
    {
      "keys": [
        {
          "kty": "OKP",
          "crv": "Ed25519",
          "alg": "Ed25519",
          "use": "sig",
          "kid": "<deterministic_kid>",
          "x": "<base64url_raw_32byte_pubkey>",
          "tg_idp_aud": ["session"]
        }
      ]
    }
    ```

  - `tg_idp_aud` is a private, collision-resistant JWK extension member carrying the key's allowed audiences.
  - Returns `200 { "keys": [] }` when a bot has no active service keys, never `404`. Sets `Cache-Control: public, max-age=60`.
- **`GET /v1/auth/verify`**
  - Requires `Authorization: Bearer <jwt>`. Diagnostic endpoint allowing bot owners to verify a service JWT end to end against their registered **service keys** (management keys return `401 unknown_key`).
  - Returns `200 { "botId", "kid", "audiences" }`, or `401` with `malformed_token`, `missing_claim`, `unknown_key`, `invalid_signature`, `token_expired`, `token_not_yet_valid`, `token_lifetime_too_long`, or `invalid_audience`.
- **`GET /health`**
  - Returns `200 { "status": "ok" }` when the service is healthy (`503` if unhealthy).

### 4. Provisioning CLI

Commands: `login`, `logout`, `init`, `rotate`, `update`, `revoke`, and `keys`. Raw credential strings are written to `stdout` for clean shell capture; status notices, expiry timestamps, and reminders are written to `stderr`.

```bash
# One-shot: confirms via Telegram, mints a service key, revokes the temp management key
BOT_TOKEN=... tg-idp init --aud session,analytics --auth-bot @MyAuthBot --idp-url https://idp.example.com

# Multi-command session: confirm once, run multiple operations, then log out
export TG_IDP_MGMT_CREDENTIAL=$(BOT_TOKEN=... tg-idp login --auth-bot @MyAuthBot --idp-url https://idp.example.com)
tg-idp init --aud session --idp-url https://idp.example.com
tg-idp update --kid a1b2c3d4e5f6g7h8 --aud session,analytics --idp-url https://idp.example.com
tg-idp revoke --kid a1b2c3d4e5f6g7h8 --idp-url https://idp.example.com
tg-idp logout --idp-url https://idp.example.com
```

Common environment variables / flags: `BOT_TOKEN` (`--bot-token`), `TG_IDP_URL` (`--idp-url`), `TG_IDP_AUTH_BOT` (`--auth-bot`), `TG_IDP_MGMT_CREDENTIAL` (`--mgmt-credential`).

- **`login`** — Runs the Telegram `/confirm` flow (sending `/confirm <code>` without `parse_mode` to `@username`, never numeric ID), polls with exponential backoff, and outputs `botidp_mgmt_v1_...`. Maps `USER_BOT_TO_BOT_DISABLED` (mode disabled on either bot), `chat not found` (invalid `--auth-bot`), and `403` self-send (`the bot can't send messages to the bot`) to clear error messages while preserving Telegram's raw error description.
- **`logout`** — Calls `DELETE /v1/bots/:botId/management-key`, treating `401 unknown_key` or `401 management_key_expired` as already logged out.
- **`init`** — Mints a service key for `--aud` using either `--mgmt-credential` or `BOT_TOKEN` + `--auth-bot` (automatically logging in and out around the command). Supports `--replace-all` (atomic replacement via `replaceAll: true`). Verifies the new key via `GET /v1/auth/verify` (signing a diagnostic audience such as `verify` when `--aud *` is used) and outputs `botidp_v1_...`.
- **`rotate`** — Mints an additional service key for `--aud` without revoking existing ones (does not accept `--replace-all`) and reminds the owner on `stderr` to revoke the old `kid` once deployed.
- **`update`** — Updates `--aud` on an existing service key (`--kid`) by fetching its public key from `/jwks` and re-registering it via `POST /v1/bots/:botId/keys` (preserving `createdAt`).
- **`revoke`** — Revokes `--kid <kid>` or `--all` service keys using `--mgmt-credential` or `BOT_TOKEN` + `--auth-bot`, printing the revoked `kid` list.
- **`keys`** — Lists active service `kid`s and audiences from `/jwks` using `--bot-id`, `BOT_TOKEN`, or `--mgmt-credential`.
- When a management call returns `401 unknown_key` or `401 management_key_expired`, the CLI reports that the management session expired or was superseded by a newer login.

### 5. Reference Verifier Module

A standalone module downstream services can import or copy, with `jose` as its only runtime dependency:

- Reads the unverified `sub`, validates it as a positive decimal integer (`botId`, rejecting non-numeric or path characters before URL construction), fetches `GET /v1/bots/:botId/jwks`, filters the JWK array to keys whose `tg_idp_aud` allows `expectedService`, and verifies the JWT against that filtered set using `jose.createLocalJWKSet` and `jose.jwtVerify` (with `audience: expectedService`).
- Does not use `jose.createRemoteJWKSet`: `jose` only evaluates standard JWK fields (`kty`, `crv`, `alg`, `kid`, `use`, `key_ops`, `ext`) during key selection and ignores custom members like `tg_idp_aud`, so remote key sets cannot enforce per-key audience filtering without pre-filtering.
- Caches per-bot JWKS (or per-`(botId, expectedService)` filtered key sets when a verifier instance serves multiple audiences) in a bounded LRU cache (default 10-minute TTL, ignoring HTTP `max-age`) and refetches on an unknown `kid` with a 30-second per-bot cooldown.
- Explicitly enforces all JWT rules—including `alg === "Ed25519"`, single-string `aud`, `exp > iat`, `iat <= now + 30s`, lifetime cap, and presence of `jti`—and exposes an optional replay-check hook so downstream services can reject replayed `jti`s until `exp` + 30s. Without the hook, a captured service token remains replayable during that window.

## Security Model

- **`BOT_TOKEN` is the root of trust.** Only its holder can establish a management key via Telegram `/confirm`.
- **Management keys are short-lived, single-slot admin sessions.** Confirming a new management key atomically revokes the previous one and cancels all other pending registrations. Management keys are never exposed in JWKS and must not be deployed to runtime servers.
- **Service keys are runtime-only.** A leaked service key can only authenticate to its registered downstream audiences; it cannot mint, edit, or revoke keys.
- **No lockout from the service-key cap.** Because management keys occupy a separate single-slot record and always supersede the previous management key on `/confirm`, exhausting the service-key cap can never prevent recovery.
- **Incident runbooks:**
  - **Leaked service key:** Revoke the compromised `kid` (`revoke --kid`), then mint and deploy a replacement with `init`.
  - **Leaked management key:** Run `login` (or any `BOT_TOKEN`-backed CLI command) to supersede it immediately via `/confirm`, inspect active keys with `keys`, and revoke any unauthorized service keys (or `revoke --all`).
  - **Leaked `BOT_TOKEN`:** Rotating the token in `@BotFather` does not remove keys an attacker already minted. Recover by:
    1. Rotating `BOT_TOKEN` in `@BotFather`.
    2. Running `init --replace-all` (or `login`, then `revoke --all`, then `init` per service). The `/confirm` step immediately invalidates any active attacker management key and cancels all pending registrations, `DELETE /keys` (or `replaceAll: true`) wipes all attacker service keys, and the dead token prevents further confirmations.

## Operational Notes

- **Revocation latency:** Service-key revocations take effect immediately on the IdP, while downstream services continue accepting revoked keys until their local JWKS cache refreshes (up to ~10 minutes with the reference verifier's default TTL). If a CDN is placed in front of the IdP, invalidate JWKS entries on key changes. Management key replacement and revocation take effect immediately with no caching.
- **Edge rate limiting:** Deployments must enforce per-IP HTTP rate limiting at the network edge (CDN, reverse proxy, or platform edge), particularly on `POST /v1/registrations`, the only unauthenticated write endpoint.
- **Telegram Bot-to-Bot prerequisites:** Both the client bot and the Auth Bot must have Bot-to-Bot Communication Mode enabled (via `@BotFather` or Bot API 10.5+ `setMySettings`; verified live on Bot API 10.4: [both-enabled recording](https://github.com/KnightNiwrem/tg-bot-api-emulator/issues/155#issuecomment-6791557230), [mode on/off matrix](https://github.com/KnightNiwrem/tg-bot-api-emulator/issues/155#issuecomment-6793695525)):
  - If either bot has the mode disabled, `sendMessage` fails in both directions with `400 Bad Request: USER_BOT_TO_BOT_DISABLED` without indicating which side is misconfigured.
  - An unknown username returns `400 Bad Request: chat not found` even when the mode is disabled.
  - Addressing a peer by `@username` (case-insensitive) succeeds and delivers a `message` update with `chat.type: "private"` and `from.is_bot: true`. Addressing by numeric ID fails with `400 Bad Request: chat not found` until resolved by username first.

## Tech Stack and Runtime Portability

- **Language & runtimes:** TypeScript targeting **Node.js LTS release lines >= 24** (`24`, `26`, and `27+`; legacy non-LTS `25` and Alpha prereleases are not targeted), **Deno**, **Bun**, and **Cloudflare Workers**. Prefer web-standard APIs, isolating any runtime-specific code behind a thin adapter.
- **Development tooling:** Bun for local development and package management (dev-only; not a deployment requirement) and Biome for linting and formatting.
- **Testing:** Vitest (rather than `bun:test`) so the test suite can validate cross-runtime compatibility (using `@cloudflare/vitest-plugin` for Workers).
- **JWT/JWK:** [`jose`](https://github.com/panva/jose) across the IdP, CLI, and reference verifier.
- **Bot framework & rate limiting:** grammY with the `ratelimiter` plugin (Redis or an HTTP-compatible store adapter in production/serverless; in-memory for local dev and tests).
- **Storage:** SQLite via libSQL (`@libsql/client` for local files and remote Turso on Node/Deno/Bun; `@libsql/client/web` for Cloudflare Workers and edge runtimes), configured via environment variables.
