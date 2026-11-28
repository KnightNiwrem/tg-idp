# Telegram Bot Identity Provider (`tg-idp`): Specification

`tg-idp` is a standalone key registry and provisioning CLI for Telegram bots. It lets a bot prove ownership of its identity using Telegram's **Bot-to-Bot Communication** (Bot API 10.0+) and register Ed25519 public keys. Downstream services can then verify bot requests using short-lived, client-signed JWTs without ever handling a Telegram bot token.

## How It Works

Telegram is only used to prove bot ownership when creating a short-lived **management key**. All service-key management happens over HTTP.

1. **Create a management key (via Telegram)**
   - The bot owner runs the CLI locally with their `BOT_TOKEN`. The token never leaves the owner's machine.
   - The CLI generates an ephemeral Ed25519 keypair and calls `POST /v1/registrations` with the public key and `botId`. The IdP creates a pending registration and returns a short-lived, single-use `code`.
   - The CLI uses `BOT_TOKEN` to send `/confirm <code>` directly to `@<AuthBot>` via Telegram's `sendMessage`.
   - Telegram delivers the private message to the **Auth Bot** with a verified `message.from.id` (`botId`) and `message.from.is_bot === true`.
   - If `botId` matches the pending registration, the Auth Bot atomically cancels any other pending registrations for that bot, replaces the bot's active management key with the new one (default TTL: **30 minutes**), and marks the registration `confirmed`.
   - The Auth Bot never replies. The CLI polls `GET /v1/registrations/:code` until the registration resolves.

2. **Manage service keys (over HTTP)**
   - Using short-lived JWTs signed by the active management key, the owner registers service keys, updates their audiences, revokes one or all service keys, or revokes the management key early.
   - Each bot can hold at most **1** active management key. Confirming a new one immediately invalidates the old one.
   - Service keys have a separate cap (default **10**) and cannot call management endpoints. Exhausting the service-key cap never blocks creating a management key or revoking keys.

3. **Verify requests at runtime (downstream services)**
   - Downstream services never talk to Telegram. They fetch a bot's service keys from the IdP's JWKS endpoint, cache them, and verify per-request EdDSA JWTs signed by the bot's service private key.

### Why Telegram Only Confirms a Single-Use Code

Telegram updates can be delayed or redelivered, and the Auth Bot cannot reliably send status replies back to the calling bot. Passing commands like key creation or revocation over Telegram would require deduplication, ordering guarantees, and a separate feedback channel. A single-use code avoids all of that: a redelivered `/confirm` hits an already-consumed code and is ignored, a delayed one finds the code expired or cancelled, and the IdP remains the single source of truth for timing and state.

## Core Concepts

### Keys and `kid`

- **Format:** 32-byte raw Ed25519 public keys, encoded as base64url.
- **Key ID (`kid`):** First 16 characters of `base64url(SHA-256(rawPubKeyBytes))`. Because it is deterministic, the CLI and IdP compute the same `kid` independently.

| Property | Management Key | Service Key |
| --- | --- | --- |
| **Purpose** | Admin HTTP endpoints on the IdP | Authenticating to downstream services |
| **How it is created** | Telegram `/confirm` flow | `POST /v1/bots/:botId/keys` |
| **Cap per bot** | **1** (new `/confirm` replaces old) | **10** (configurable; rejects at cap) |
| **Lifetime** | Short-lived (default **30 minutes**) | Long-lived until revoked |
| **Published in JWKS** | Never | Yes |

- At the service-key cap, registering a new `kid` returns `409 key_limit_reached` without evicting existing keys.
- Re-registering an existing service `kid` overwrites its `audiences` and keeps its original `createdAt`.

### Audiences

- Every service key must specify a non-empty list of audiences (e.g., `session`, `analytics`). Registrations with an empty list are rejected.
- Allowed characters per audience: alphanumeric, `-`, `_`, `.`, or the wildcard `*`.
- `idp` is reserved for management JWTs and is rejected if included in a service key's audience list.
- `*` matches every downstream service audience, never `idp`.
- A service key **covers** an audience `a` if `a !== "idp"` and its list contains either `a` or `*`. Both `/v1/auth/verify` and the reference verifier use this rule.

### JWT Format

All bot-signed JWTs must meet these requirements:

- **Header:** `alg: "EdDSA"`, `kid`.
- **Claims:** `sub` (`botId` as a decimal string), `aud` (single string), `iat`, `exp`, `jti`.
- **Signature:** Must verify against the matching registered key for `(sub, kid)` — the active, non-expired management key for IdP management routes, or a registered service key for `/v1/auth/verify` and downstream services.
- **Clock skew:** `iat` and `exp` are validated with a ±30s tolerance.
- **Max lifetime (`exp - iat`):** Configurable, defaulting to **300s** for service tokens and **60s** for management tokens.
- **Audience check:** Management tokens require `aud === "idp"`; service tokens require an `aud` covered by the signing key's scope.

## Tech Stack

- **Language & runtime portability:** TypeScript targeting Node.js 24+ (even-numbered release lines only; odd lines such as 25 are not targeted), Deno, Bun, and Cloudflare Workers. Prefer web-standard APIs; isolate any runtime-specific APIs (`Bun.*`, `Deno.*`, Node built-ins) behind a thin runtime-detection adapter.
- **Dev tooling:** Bun for local development and package management; Biome for linting and formatting. (Bun is a dev convenience, not a deployment requirement.)
- **Testing:** Vitest (not `bun:test`) so the test suite verifies cross-runtime compatibility.
- **JWT/JWK:** [`jose`](https://github.com/panva/jose) across the IdP, CLI, and reference verifier. Do not hand-roll JWT parsing or signature verification.
- **Bot framework:** grammY, supporting both VPS and serverless deployments.
- **Auth Bot rate limiting:** grammY `ratelimiter` plugin backed by Redis in production (shared across instances) and in-memory storage for local dev and tests.
- **Storage:** SQLite via libSQL (`@libsql/client`), supporting local files and Turso in serverless deployments via environment variables.

## Components

### 1. Auth Bot (Telegram Update Handler)

- Supports webhook mode for production and long-polling for local development.
- **Webhook verification (required):** Configure a webhook `secret_token` and validate `X-Telegram-Bot-Api-Secret-Token` using constant-time comparison. Reject any mismatched request.
- **Update guards:**
  - Process only `message` updates; ignore `edited_message` and all other update types.
  - Ignore messages where `chat.type !== "private"` or `from?.is_bot !== true`.
  - Apply per-`botId` rate limiting (default: 10 commands/minute).
  - **Never send a reply.** This prevents bot-to-bot reply loops; clients observe results by polling the registration endpoint.
  - Always return `2xx` to Telegram for handled, ignored, and rejected updates so Telegram does not redeliver them.
- **Command handling (`/confirm <code>`):** Execute as a single atomic store command:
  1. Look up `<code>`. If it does not exist, is not `pending`, or has expired, do nothing.
  2. If `registration.botId !== message.from.id`, do nothing and leave the registration `pending` so another bot cannot consume or cancel it.
  3. Mark all other `pending` registrations for `botId` as `cancelled` so a delayed `/confirm` from an earlier session cannot overwrite the new management key.
  4. Upsert the bot's single management key on `botId` with `expiresAt = now + managementKeyTtl` (default 30 minutes), replacing any previous management key immediately.
  5. Mark the registration `confirmed` and record `managementKeyExpiresAt`.
- No `update_id` deduplication or `message.date` staleness check is needed: codes are single-use and expiry is enforced on the IdP's clock.

### 2. Storage Layer

Expose a swappable `Store` interface with a libSQL adapter (production) and an in-memory adapter (tests).

- **Management key** (unique on `botId`, at most one row per bot):
  - `botId: number` (64-bit integer; Telegram IDs exceed 32 bits)
  - `kid: string`
  - `publicKey: string` (base64url 32-byte raw Ed25519 key)
  - `createdAt: number`, `expiresAt: number` (Unix epoch seconds)
- **Service key** (unique on `(botId, kid)`):
  - `botId: number`
  - `kid: string`
  - `publicKey: string` (base64url 32-byte raw Ed25519 key)
  - `audiences: string[]`
  - `createdAt: number` (Unix epoch seconds)
- **Registration** (unique on `code`; management keys only):
  - `code: string` (at least 128 bits of CSPRNG entropy, base64url)
  - `botId`, `kid`, `publicKey`
  - `status`: `pending` | `confirmed` | `cancelled` | `expired`
  - `createdAt`, `expiresAt` (Unix epoch seconds)
  - `managementKeyExpiresAt?: number` (set when `confirmed`)
- **Used token:** `jti` of each accepted management JWT, retained until `exp` plus the 30s clock tolerance.
- **Atomicity:** Implement all writes as single command-level adapter methods (`createRegistration`, `confirmRegistration`, `upsertServiceKey`, `revokeServiceKey`, `revokeAllServiceKeys`, `revokeManagementKey`). Each command must acquire the write lock before its first read (SQLite `BEGIN IMMEDIATE` / libSQL `write` transaction) so concurrent operations for the same bot cannot interleave or race on key-cap counts, pending checks, or cancellations.
- **Reads:** List service keys by `botId`, get one service key, get the active management key by `botId`, and get a registration by `code`.

### 3. HTTP API

The HTTP API must never accept, log, or store Telegram bot tokens. All responses except JWKS must set `Cache-Control: no-store`. Errors return JSON with a machine-readable `error` code.

#### Management Key Registrations (Unauthenticated)

- **`POST /v1/registrations`**
  - Body: `{ "botId": 123, "publicKey": "<base64url>" }`.
  - Validates the public key; returns `400 invalid_public_key` on failure.
  - Creates a pending registration expiring after a configurable TTL (default **5 minutes**) and returns `201 { "code", "kid", "status": "pending", "expiresAt" }`.
  - `botId` is unverified until confirmed via Telegram.
  - **No per-`botId` pending cap:** Because this endpoint is unauthenticated, capping pending rows per bot would allow anyone to DoS a bot's registrations. Instead, rows are small, short-lived, and purged after expiry.
- **`GET /v1/registrations/:code`**
  - Returns `200 { "status", "botId", "kid", "expiresAt", "managementKeyExpiresAt"? }`. Pending rows past `expiresAt` report `expired`.
  - Returns `404` for unknown codes. Completed registrations may be purged after a configurable retention period (default **24 hours**).

#### Key Management (Management Key Auth)

All management endpoints require `Authorization: Bearer <jwt>` satisfying the JWT rules above plus:

- Signed by the bot's active management key for `(sub, kid)`. Service keys are rejected with `401 unknown_key`.
- If the stored management key matches `kid` but `now > expiresAt`, return `401 management_key_expired`. If missing or superseded, return `401 unknown_key`.
- `aud` must equal `"idp"`.
- `sub` must match `:botId` in the path; otherwise return `403 forbidden`.
- Lifetime (`exp - iat`) must not exceed **60s**.
- `jti` must be unused; replays return `401 token_replayed`.

Endpoints:

- **`POST /v1/bots/:botId/keys`** — Register a service key or update an existing key's audiences.
  - Body: `{ "publicKey": "<base64url>", "audiences": ["session"] }`.
  - Returns `400 invalid_public_key` or `400 invalid_audiences` (including empty lists or `idp`) on validation failure.
  - Enforces the service-key cap atomically; returns `409 key_limit_reached` if `kid` is new and the bot is at the cap.
  - Upserts on `(botId, kid)`. Existing keys overwrite `audiences` and preserve `createdAt`.
  - Returns `201` (created) or `200` (updated) with `{ "botId", "kid", "audiences", "createdAt" }`.
- **`DELETE /v1/bots/:botId/keys/:kid`** — Revoke one service key.
- **`DELETE /v1/bots/:botId/keys`** — Revoke all service keys for `:botId`. Does **not** revoke the active management key, allowing the caller to mint replacement keys in the same session.
  - Both `DELETE /keys` endpoints return `200 { "revoked": ["<kid>", ...] }`. Missing keys are not an error and return an empty list so retries are idempotent.
- **`DELETE /v1/bots/:botId/management-key`** — Revoke the active management key immediately (used for explicit logout or CLI teardown). Returns `200 { "revoked": true }`.

#### Public Keys and Verification

- **`GET /v1/bots/:botId/jwks`**
  - Returns a JWK Set containing all active **service keys** for `:botId` (never the management key):

    ```json
    {
      "keys": [
        {
          "kty": "OKP",
          "crv": "Ed25519",
          "alg": "EdDSA",
          "use": "sig",
          "kid": "<deterministic_kid>",
          "x": "<base64url_raw_32byte_pubkey>",
          "aud": ["session"]
        }
      ]
    }
    ```

  - `aud` is a non-standard JWK extension member carrying the key's audiences (document this explicitly).
  - Returns `200 { "keys": [] }` when a bot has no service keys, never `404`.
  - Sets `Cache-Control: public, max-age=60`.
- **`GET /v1/auth/verify`**
  - Lets bot owners verify their service key and JWT signing implementation end to end.
  - Verifies `Authorization: Bearer <jwt>` against the bot's **service keys** (management keys return `401 unknown_key`). Accepts any `aud` covered by the key's scope.
  - Returns `200 { botId, kid, audiences }`, or `401` with one of: `malformed_token`, `missing_claim`, `unknown_key`, `invalid_signature`, `token_expired`, `token_lifetime_too_long`, `invalid_audience`.
- **`GET /health`**

### 4. Provisioning CLI

Commands: `login`, `logout`, `init`, `rotate`, `revoke`, `keys`.

- **`login`** — Establish a 30-minute management session via Telegram so subsequent commands can run without repeating `/confirm`.
  - Inputs: `BOT_TOKEN` (env or flag), `--auth-bot <@username>`, `--idp-url <url>`.
  - Generates an extractable Ed25519 keypair, derives `kid`, resolves `botId` via `getMe`, and calls `POST /v1/registrations`.
  - Sends `/confirm <code>` via Telegram `sendMessage` **without `parse_mode`**, always addressing the Auth Bot by `@username` (never numeric ID).
  - Maps Telegram send errors to actionable guidance while preserving Telegram's raw error description:
    - `USER_BOT_TO_BOT_DISABLED`: instruct the user to enable Bot-to-Bot Communication Mode in `@BotFather`, noting that the same error occurs if the Auth Bot has it disabled.
    - `chat not found`: `--auth-bot` username is invalid.
    - Other errors: print the raw description unchanged.
  - Polls `GET /v1/registrations/:code` with exponential backoff until resolved; exits non-zero on `cancelled` or `expired`.
  - Outputs `botidp_mgmt_v1_<payload>` (base64url JSON of `{ v: 1, botId, kid, privKey, expiresAt }`) and prints its expiry time.
- **`logout`** — Inputs: `--idp-url`, `--mgmt-credential <botidp_mgmt_v1_...>` (or env). Calls `DELETE /v1/bots/:botId/management-key`.
- **`init` / `rotate`** — Mint a service key.
  - Inputs: `--idp-url <url>`, `--aud <comma_list>` (required), optional `--replace-all`, plus either `--mgmt-credential` (or env) or `BOT_TOKEN` + `--auth-bot`.
  - When using `BOT_TOKEN` directly, automatically runs `login`, performs the key operation, and calls `DELETE /v1/bots/:botId/management-key` on exit.
  - `--replace-all` calls `DELETE /v1/bots/:botId/keys` before registering the new service key.
  - Generates an extractable Ed25519 keypair, registers it via `POST /v1/bots/:botId/keys`, signs a test JWT (using the first audience, or any non-reserved name if `*`), and confirms it via `GET /v1/auth/verify`.
  - Outputs `botidp_v1_<payload>`, where `<payload>` is base64url JSON of `{ v: 1, botId, kid, privKey }` and `privKey` is a private JWK (`{ kty, crv, x, d }`) directly compatible with `jose.importJWK`.
  - `rotate` adds a new service key without revoking the old one and reminds the owner to revoke the old `kid` after deployment.
  - On `401 unknown_key` or `401 management_key_expired`, report clearly that the management session expired or was superseded by a newer login.
- **`revoke`** — Inputs: `--idp-url`, `--kid <kid>` or `--all`, plus either `--mgmt-credential` or `BOT_TOKEN` + `--auth-bot`.
  - With `BOT_TOKEN` + `--auth-bot`, establishes a temporary management key (always succeeding even at the service-key cap), revokes the requested key(s), and revokes the temporary management key on exit.
  - Prints the `revoked` list returned by the IdP.
- **`keys`** — Inputs: `--idp-url`, `--bot-id` (or `BOT_TOKEN` to derive it). Lists active service `kid`s and audiences from the JWKS endpoint.

### 5. Reference Verifier Module

A minimal module downstream services can import or copy, depending only on `jose`.

- Decode the unverified `sub` to identify the bot, then verify the JWT with `jose.jwtVerify` against a service-scoped key set.
- **Service-scoped key sets:** Fetch `GET /v1/bots/:botId/jwks` directly, keep only keys whose `aud` covers `expectedService`, and pass them to `jose.createLocalJWKSet`. Do not use `createRemoteJWKSet`, which strips the custom `aud` JWK member and cannot enforce key-level scope.
  - Cache key sets in an LRU keyed by `botId` with a configurable TTL (default **10 minutes**, matching `jose`'s `cacheMaxAge`).
  - Refetch on an unknown `kid`, rate-limited to once per bot every **30 seconds** (matching `jose`'s cooldown).
- Enforce all JWT rules above, including `audience: expectedService` in `jwtVerify` alongside the key-level scope filter.
- `jti` is always required. Expose an optional replay hook (e.g. `isReplay(jti, exp)`) for downstream services that want replay protection. Services using it must retain each `jti` until `exp` plus 30s; document that without the hook, a captured token can be replayed during that window.

## Security Model

- **`BOT_TOKEN` is the root of trust.** Only its holder can establish a management key via Telegram `/confirm`.
- **Management keys are short-lived, single-slot admin sessions.** Each bot has at most **1** active management key (default 30-minute TTL). Confirming a new management key atomically revokes the previous one and cancels all other pending registrations. Management keys are never published in JWKS and must not be deployed to runtime servers.
- **Service keys are runtime-only.** A leaked service key can only authenticate to its registered downstream audiences; it cannot mint, edit, or revoke keys.
- **No lockout from the service-key cap.** Because management keys live in a separate single-slot table and replace any prior management key on `/confirm`, filling the service-key cap can never block administrative recovery.
- **Incident runbooks:**
  - **Leaked service key:** Revoke the compromised `kid` (`revoke --kid`), then run `rotate`.
  - **Leaked management key:** Run `login` (or any `BOT_TOKEN`-backed CLI command) to supersede it immediately via `/confirm`, inspect active keys with `keys`, and revoke any unauthorized service keys (or `revoke --all`).
  - **Leaked `BOT_TOKEN`:** Rotating the token in `@BotFather` does not remove keys an attacker already minted. Recover by:
    1. Rotating `BOT_TOKEN` in `@BotFather`.
    2. Running `init --replace-all` (or `login` -> `revoke --all` -> `init` per service). The `/confirm` step immediately kills any active attacker management key and cancels all pending registrations, `DELETE /v1/bots/:botId/keys` wipes all attacker service keys, and the dead token prevents the attacker from confirming again.

## Operational Notes

- **Revocation latency:** Revoking a service key removes it from the IdP immediately, but downstream services continue accepting it until their JWKS cache refreshes (up to ~10 minutes with the reference verifier's default TTL). No CDN is planned in front of the IdP; if one is added, invalidate JWKS entries on key changes so the IdP stays current well within `max-age`. Management key replacement and revocation take effect immediately with no caching.
- **Edge rate limiting:** HTTP rate limiting is the deployment's responsibility (CDN, reverse proxy, or platform edge), since client IP handling is platform-specific. Document this as a deployment requirement, especially for `POST /v1/registrations`, which is the only unauthenticated write endpoint.
- **Bot-to-Bot Communication prerequisites:** Both the client bot and the Auth Bot must have Bot-to-Bot Communication Mode enabled in `@BotFather`. Verified live on 2026-11-11 (Bot API 10.4): [both-enabled recording](https://github.com/KnightNiwrem/tg-bot-api-emulator/issues/155#issuecomment-6791557230) and [mode on/off matrix](https://github.com/KnightNiwrem/tg-bot-api-emulator/issues/155#issuecomment-6793695525). Key findings:
  - If either bot has the mode disabled, `sendMessage` fails in both directions with `400 Bad Request: USER_BOT_TO_BOT_DISABLED` and delivers nothing. The error does not indicate which side is misconfigured.
  - An unknown username returns `400 Bad Request: chat not found` even when the mode is disabled, distinguishing a bad `--auth-bot` value from a mode issue.
  - Addressing the peer by `@username` (case-insensitive) succeeds and delivers a `message` update with `chat.type: "private"` and `from.is_bot: true`.
  - Addressing the peer by numeric ID fails with `400 Bad Request: chat not found` until resolved by username first; therefore, the CLI must always send to `@username`.
  - Both recordings used long-polling; confirm bot-to-bot delivery over webhooks with a quick live check early in implementation.

## Test Coverage

Unit and integration tests must cover:

- Deterministic `kid` derivation
- Audience validation: empty list, invalid characters, `idp` rejected on service keys, `*` matching downstream audiences only
- Webhook secret validation: missing and incorrect `X-Telegram-Bot-Api-Secret-Token` rejected
- Auth Bot update guards: `from.is_bot === false`, non-private chats, non-`message` updates, per-`botId` rate limit
- Management registration creation: invalid public key length, response format
- `/confirm`: happy path; unknown, expired, cancelled, and already-consumed codes ignored; redelivered `/confirm` ignored; `/confirm` from another bot leaves registration `pending`
- Single-slot management key replacement: new `/confirm` immediately invalidates the prior management key, cancels all other pending registrations for that bot, and succeeds even when service keys are at the cap
- Management key expiry and replacement errors: expired key returns `401 management_key_expired`; revoked or superseded key returns `401 unknown_key`
- Management auth checks: service key rejected, `aud !== "idp"` rejected, `sub` path mismatch (`403`), lifetime > 60s, replayed `jti` (`401 token_replayed`)
- Service key endpoints: `POST /keys` creation, audience overwrite keeping `createdAt`, `409 key_limit_reached` at cap; `DELETE /keys/:kid` and `DELETE /keys` returning `revoked` lists, idempotent retries returning `[]`, `DELETE /keys` preserving the active management key; `DELETE /management-key` revoking the active management key
- Concurrency and atomicity: concurrent `POST /keys` never exceed the service-key cap; concurrent `/confirm` calls leave exactly one active management key and cancel losing pending registrations
- Registration status reporting across `pending`, `confirmed`, `cancelled`, and `expired`
- JWKS output format, including the empty case and verifying management keys are never exposed
- End-to-end service JWT verification: valid, expired, tampered payload, unknown `kid`, management key rejected on `/v1/auth/verify`, `sub` mismatch, wrong `aud`, scope mismatch, missing `jti`, over-long lifetime, `alg: none` and HS256 confusion
- Reference verifier scope filtering: tokens signed by a key scoped to a different service are rejected
- Credential string round trips: `botidp_mgmt_v1_...` and `botidp_v1_...` decode, import via `jose.importJWK`, and sign accepted tokens

## Documentation

Provide a `README.md` covering `@BotFather` Bot-to-Bot Communication Mode setup, architecture overview, environment variables, CLI commands (`login`, `logout`, `init`, `rotate`, `revoke`, `keys`), HTTP API reference, credential string formats, downstream verification guide, security model, and operational notes.
