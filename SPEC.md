# Telegram Bot Identity Provider (Key Registry): Specification

A standalone **Telegram Bot Identity Provider (Key Registry)** service and provisioning CLI. Its purpose is to let Telegram bots prove ownership of their identity via Telegram's native **Bot-to-Bot Communication** (Bot API 10.0+) and manage Ed25519 public keys, so downstream services can authenticate bot requests using short-lived, client-signed JWTs without ever receiving or storing a Telegram bot token.

## Architecture Overview

Telegram is used for exactly one thing: proving which bot approves a short-lived **management key** registration. All service-key lifecycle operations happen over HTTP.

1. **Establishing a management key (Telegram-rooted)**
   - A bot owner runs a local CLI with their `BOT_TOKEN`. `BOT_TOKEN` never touches our backend.
   - The CLI generates an ephemeral Ed25519 keypair and calls `POST /v1/registrations` with the public key and the bot's ID. The IdP stores a pending registration and returns a single-use, short-lived `code`.
   - The CLI uses `BOT_TOKEN` _locally_ to call Telegram's `sendMessage` to `@<AuthBot>` with `/confirm <code>`.
   - Telegram delivers the private message to our **Auth Bot** with a Telegram-verified `message.from.id` (`botId`) and `message.from.is_bot === true`. If that `botId` matches the pending registration, the Auth Bot atomically cancels any other pending registrations for that bot, replaces the bot's single active management key with the new key (valid for a short TTL, default **30 minutes**), and marks the registration `confirmed`.
   - The Auth Bot never replies. The CLI polls `GET /v1/registrations/:code` for the outcome.

2. **Managing service keys (HTTP, authenticated by the management key)**
   - The active management key authorizes administrative HTTP endpoints on the IdP: minting service keys, updating a service key's audiences, revoking one or all service keys, and explicitly revoking the management key itself.
   - Management keys have an effective cap of **1** per bot (a new `/confirm` immediately supersedes any previous management key), expire automatically after their TTL, and are never published in the JWKS endpoint.
   - Service keys have their own separate cap (default **10**) and can never call management endpoints. Exhausting the service key cap can never block establishing a management key or revoking keys.

3. **Runtime (downstream services; out of scope except the reference verifier and HTTP endpoints)**
   - Downstream services never talk to Telegram. They fetch a bot's service public keys from our JWKS endpoint, cache them, and verify per-request EdDSA JWTs signed by the bot's service private key.

### Why Telegram only confirms a code

A Telegram update can be delayed or redelivered, and the Auth Bot cannot usefully answer the sending bot. Carrying state-changing commands such as key creation or revocation over that channel would need deduplication, ordering rules, and a separate way to report outcomes. A single-use code avoids all of that: a redelivered `/confirm` finds the code already consumed and does nothing, a delayed one finds it expired or cancelled, and every expiry and cancellation decision is made on the IdP's own clock.

## Stack

- **Language:** TypeScript. The code must be portable across Node.js 24+ (even-numbered release lines; odd-numbered lines such as 25 are not targeted or tested), Deno, Bun, and Cloudflare Workers, so prefer web-standard APIs. Runtime-specific APIs (`Bun.*`, `Deno.*`, Node-only built-ins) are allowed only behind runtime-aware branching that detects the current runtime and selects the right API for each supported one, so no code path depends on a single runtime. Keep that branching in a thin adapter rather than spread through the code.
- **Development runtime and tooling:** Bun is the runtime used for development and package management, with Biome for formatting and linting. Bun is a development convenience only, not a deployment requirement.
- **Tests:** Vitest, not `bun:test`, so the test suite itself is not tied to one runtime. Tests are how cross-runtime compatibility is checked.
- **JWT/JWK library:** [`jose`](https://github.com/panva/jose) everywhere (CLI, IdP, reference verifier). Do not hand-roll JWT parsing or signature verification.
- **Bot framework:** grammY, deployable on a VPS or serverless.
- **Rate limiting:** grammY `ratelimiter` plugin for the Auth Bot, with Redis storage so limits are shared across instances (in-memory storage for tests and local dev).
- **Store:** SQLite via libSQL (`@libsql/client`), so the same adapter works with a local file and with Turso in serverless deployments. Connection config injected via env vars.

## Concepts

### Keys and `kid`

- A public key is a 32-byte raw Ed25519 key, transported as base64url.
- `kid` is the first 16 characters of `base64url(SHA-256(rawPubKeyBytes))`. It is deterministic, so the CLI and the IdP compute the same value independently.
- Keys are split into two distinct types:
  - **Management key (1 per bot, short-lived):** Registered exclusively through the Telegram `/confirm` flow. Valid for a configurable TTL (default **30 minutes**), after which it is automatically invalid. Each bot has at most **1** active management key; confirming a new management key atomically revokes the previous one. Management keys are never returned by the JWKS endpoint and cannot authenticate to downstream services.
  - **Service keys (configurable cap, default 10 per bot):** Long-lived runtime keys registered and revoked over HTTP using an active management key, and published in the JWKS endpoint. At the cap, registering a new `kid` is rejected with `key_limit_reached`; nothing is evicted. Re-registering an existing `kid` overwrites its audiences and keeps `createdAt`. Service keys cannot authenticate to management endpoints.

### Audiences

- Every **service key** is registered with a non-empty list of audiences naming the downstream services it may be used for (e.g. `session`, `analytics`). There is no default: a registration without audiences is rejected.
- Each entry is alphanumeric plus `-`, `_`, `.`, or the wildcard `*`.
- `idp` is reserved for management JWTs and is rejected if supplied in a service key's audience list.
- `*` covers every downstream service audience (never `idp`).
- A service key's scope **covers** an audience `a` when `a !== "idp"` and its list contains `a` or `*`. This single definition is used by `/v1/auth/verify` and the reference verifier.

### Tokens

A bot-signed JWT, wherever it is verified, must have:

- Header: `alg: "EdDSA"`, `kid`.
- Claims: `sub` (botId as a decimal string), `aud` (a single string), `iat`, `exp`, `jti`.
- A signature that verifies against the matching registered key for `sub` and `kid` (the active, non-expired management key for IdP management endpoints; a registered service key for `/v1/auth/verify` and downstream services).
- `exp` and `iat` valid within ±30s clock tolerance.
- A lifetime `exp - iat` no longer than a configurable maximum (default **300s** for service tokens; **60s** for management tokens).
- For service tokens: an `aud` covered by the service key's scope. For management tokens: `aud === "idp"`.

## Scope & Deliverables

### 1. Central Auth Bot (Telegram update handler)

- Support webhook mode, plus long-polling for local dev.
- **Webhook authenticity (required):** set a webhook `secret_token` and reject any request whose `X-Telegram-Bot-Api-Secret-Token` header does not match, using a constant-time comparison. The entire trust model depends on updates genuinely coming from Telegram.
- **Guards on every update:**
  - Handle only `message` updates. Ignore `edited_message` and everything else.
  - Ignore any message where `chat.type !== "private"` or `from?.is_bot !== true`.
  - Enforce per-`botId` rate limiting (default: 10 commands/minute).
  - **Never send any reply.** This removes any possibility of bot-to-bot reply loops. Outcomes are reported through the registration resource.
  - Return 2xx to Telegram for every handled update, including ignored and rejected ones, so Telegram does not redeliver them needlessly.
- **The only command is `/confirm <code>`.** In one atomic operation (see Storage):
  1. Look up the registration for `<code>`. If it does not exist, is not `pending`, or has expired, do nothing.
  2. If the registration's `botId` differs from `message.from.id`, do nothing. The registration stays pending, so another bot cannot consume or cancel it.
  3. Cancel all other `pending` registrations for `botId`. This ensures a delayed `/confirm` from an earlier registration (for example, one sent before a `BOT_TOKEN` rotation) cannot overwrite the newly confirmed management key.
  4. Upsert the bot's single active management key on `botId` with `expiresAt = now + managementKeyTtl` (default 30 minutes), immediately replacing any previous management key.
  5. Mark the registration `confirmed` and record the management key's `expiresAt`.
- No `update_id` deduplication or `message.date` staleness check is needed: a code can be consumed once, and its expiry is enforced by the IdP.

### 2. Storage Layer

- A swappable `Store` interface, with a libSQL adapter (production) and an in-memory adapter (tests).
- **Management key record**, unique on `botId` (at most one row per bot):
  - `botId: number` (Telegram IDs exceed 32 bits; store as 64-bit integer)
  - `kid: string`
  - `publicKey: string` (base64url 32-byte raw Ed25519 public key)
  - `createdAt: number` (Unix epoch seconds)
  - `expiresAt: number` (Unix epoch seconds)
- **Service key record**, unique on `(botId, kid)`:
  - `botId: number`
  - `kid: string`
  - `publicKey: string` (base64url 32-byte raw Ed25519 public key)
  - `audiences: string[]`
  - `createdAt: number` (Unix epoch seconds)
- **Registration record** (for pending management keys), unique on `code`:
  - `code: string` (at least 128 bits from a CSPRNG, base64url)
  - `botId`, `kid`, `publicKey`
  - `status`: `pending`, `confirmed`, `cancelled`, or `expired`
  - `createdAt`, `expiresAt` (Unix epoch seconds)
  - `managementKeyExpiresAt?: number` (set when `confirmed`)
- **Used-token record:** the `jti` of each accepted management token, kept until its `exp` plus the clock tolerance.
- **Writes are command-level operations that the adapter applies atomically:** create a management-key registration, confirm a registration, upsert a service key, revoke a service key, revoke all service keys, revoke the management key. Handlers must not compose a command from separate check and write calls.
  - All reads and writes of one command run in a single write transaction, so concurrent commands for the same bot cannot interleave. This covers the service key-cap count, management key replacement, pending-status checks, and cancellation.
  - The transaction must take the write lock before its first read (SQLite `BEGIN IMMEDIATE`; a libSQL `write` transaction), so a check is never made against a snapshot that a concurrent command then invalidates.
- Reads: service keys by bot, a single service key, the active management key by bot, a registration by code.

### 3. HTTP API

The HTTP API must never accept, log, or store Telegram bot tokens. The service does not rate-limit HTTP requests itself; that is the deployment's responsibility (see Operational Semantics). Responses other than the JWKS carry `Cache-Control: no-store`. Errors use a JSON body with a machine-readable `error` code.

#### Management key registrations (unauthenticated)

- `POST /v1/registrations`
  - Body: `{ "botId": 123, "publicKey": "<base64url>" }`.
  - Validates the public key; on failure returns `400` with `invalid_public_key`.
  - Creates a pending management-key registration that expires after a configurable period (default **5 minutes**) and returns `201 { "code", "kid", "status": "pending", "expiresAt" }`.
  - `botId` here is only a claim. It grants nothing until that bot confirms the code through Telegram.
  - There is deliberately **no cap on pending registrations per `botId`**: since the endpoint is unauthenticated, such a cap would let anyone block a bot from registering. The service bounds what one request can cost instead: a registration is a single small row, it expires quickly, and expired registrations are purged.
- `GET /v1/registrations/:code`
  - Returns `200 { "status", "botId", "kid", "expiresAt", "managementKeyExpiresAt"? }`. A pending registration past its `expiresAt` reports `expired`.
  - Returns `404` for an unknown code. Finished registrations may be purged after a configurable retention period (default 24h).

#### Key management (authenticated by management key)

- Requests carry `Authorization: Bearer <jwt>`. The token must satisfy the token rules above, and additionally:
  - Must be signed by the bot's active **management key** (matched by `(sub, kid)` against the management key store; service keys are rejected with `401 unknown_key`).
  - If the stored management key's `kid` matches but `now > expiresAt`, reject with `401 management_key_expired` (and treat the key as expired/revoked). If no management key exists or `kid` does not match (e.g. superseded by a newer `/confirm`), reject with `401 unknown_key`.
  - `aud` must be `idp`.
  - `sub` must equal `:botId` in the path; otherwise `403 forbidden`.
  - Its lifetime must not exceed **60s**.
  - Its `jti` must not have been used before; a repeat is rejected with `401 token_replayed`.
- `POST /v1/bots/:botId/keys`: register a new service key or update an existing service key's audiences.
  - Body: `{ "publicKey": "<base64url>", "audiences": ["session"] }`.
  - Validates the public key and audiences (rejecting empty lists and the reserved `idp` audience); on failure returns `400` with `invalid_public_key` or `invalid_audiences`.
  - Atomically checks the service key cap (default **10**): if `kid` is new and the bot is at the cap, returns `409` with `key_limit_reached`.
  - Otherwise upserts the service key on `(botId, kid)`. For an existing `kid`, `audiences` are overwritten and `createdAt` is kept.
  - Returns `201` (new key) or `200` (updated audiences) with `{ "botId", "kid", "audiences", "createdAt" }`.
- `DELETE /v1/bots/:botId/keys/:kid`: revoke one service key.
- `DELETE /v1/bots/:botId/keys`: revoke all of the bot's service keys. Does **not** revoke the active management key, so the caller can immediately mint replacement service keys in the same session.
- Both `DELETE /keys` endpoints return `200 { "revoked": ["<kid>", ...] }` listing the service keys actually removed. Revoking a key that does not exist is not an error and returns an empty list, so a client can safely retry with a fresh token.
- `DELETE /v1/bots/:botId/management-key`: explicitly revoke the bot's active management key (for example, when a one-shot CLI command finishes before the 30-minute TTL). Returns `200 { "revoked": true }`.

#### Public keys and verification

- `GET /v1/bots/:botId/jwks`
  - Returns a standard JWK Set for all active **service keys** of `:botId` (never includes the management key):

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

  - `aud` is a non-standard extension member carrying the key's registered audiences; document it as such.
  - A bot with no service keys returns `200 { "keys": [] }`, never 404.
  - `Cache-Control: public, max-age=60`.
- `GET /v1/auth/verify`
  - Purpose: lets a bot owner confirm their service JWT signing implementation and service private key are correct.
  - Accepts `Authorization: Bearer <jwt>` and verifies against the bot's registered **service keys** (management keys are rejected with `401 unknown_key`). Any `aud` covered by the service key's scope is accepted.
  - Returns `200 { botId, kid, audiences }`, or `401` with one of: `malformed_token`, `missing_claim`, `unknown_key`, `invalid_signature`, `token_expired`, `token_lifetime_too_long`, `invalid_audience`.
- `GET /health`

### 4. Provisioning CLI (`login`, `logout`, `init`, `rotate`, `revoke`, `keys`)

- `login`: establishes a short-lived management key via the Telegram confirmation flow so the owner can run multiple `init`, `rotate`, or `revoke` commands within the 30-minute TTL without repeating `/confirm`.
  - Inputs: `BOT_TOKEN` (env or flag), `--auth-bot <@username>`, `--idp-url <url>`.
  - Generates an extractable Ed25519 keypair, computes `kid`, and obtains `botId` via `getMe`.
  - Calls `POST /v1/registrations`. Never sends `BOT_TOKEN` to the IdP.
  - Sends `/confirm <code>` with Telegram `sendMessage`, **without `parse_mode`**, always addressing the Auth Bot by `@username` and never by numeric ID.
  - Maps send failures to actionable messages, always including Telegram's raw description:
    - `USER_BOT_TO_BOT_DISABLED`: tell the owner to enable Bot-to-Bot Communication Mode for their bot in `@BotFather`, and note that the same error appears if the Auth Bot has it disabled.
    - `chat not found`: the `--auth-bot` username is wrong.
    - Anything else: print the description unchanged.
  - Polls `GET /v1/registrations/:code` with exponential backoff until the status is no longer `pending`. On `cancelled` or `expired`, print the status and exit non-zero.
  - Outputs `botidp_mgmt_v1_<payload>` (base64url of `{ v: 1, botId, kid, privKey, expiresAt }`) and prints its expiry timestamp.
- `logout`: inputs `--idp-url` and `--mgmt-credential <botidp_mgmt_v1_...>` (or env). Calls `DELETE /v1/bots/:botId/management-key` to revoke the management key early.
- `init` / `rotate`: mints a service key over HTTP.
  - Inputs: `--idp-url <url>`, `--aud <comma_list>` (required), optional `--replace-all`, and one way to authenticate:
    - `--mgmt-credential <botidp_mgmt_v1_...>` (or env): uses an existing management session.
    - `BOT_TOKEN` and `--auth-bot`: runs the `login` confirmation flow automatically, executes the service-key operation, and calls `DELETE /v1/bots/:botId/management-key` on exit.
  - When `--replace-all` is set, calls `DELETE /v1/bots/:botId/keys` first to wipe all existing service keys, then registers the new service key.
  - Generates an extractable Ed25519 service keypair, calls `POST /v1/bots/:botId/keys`, then signs a test JWT (using the first registered audience, or any non-reserved name if that audience is `*`) and calls `GET /v1/auth/verify` to confirm.
  - Outputs `botidp_v1_<payload>`, where `<payload>` is base64url of the JSON `{ v: 1, botId, kid, privKey }` and `privKey` is the **private JWK** (`{ kty, crv, x, d }`), directly usable with `jose.importJWK`.
  - `rotate` registers an additional service key without revoking the old one; remind the owner to revoke the old `kid` once the new credential is deployed.
  - If a management call fails with `401 unknown_key` or `401 management_key_expired`, print a clear message indicating that the management session expired or was superseded by a newer login.
- `revoke`: inputs `--idp-url`, and `--kid <kid>` or `--all`, plus either `--mgmt-credential` or `BOT_TOKEN` + `--auth-bot`.
  - With `BOT_TOKEN` + `--auth-bot`, establishes a temporary management key via `/confirm` (which always succeeds even when service keys are at the cap), calls the matching `DELETE` endpoint, and revokes the temporary management key on exit.
  - Prints the list of revoked `kid`s returned by the IdP.
- `keys`: inputs `--idp-url` and `--bot-id` (or `BOT_TOKEN` to derive it). Lists active service `kid`s and audiences from the JWKS endpoint. Needs no credential otherwise.

### 5. Reusable Verification Reference Module

A small module downstream services can import or copy. Its only dependency is `jose`.

- Read the unverified `sub` to locate the bot, then verify with `jose.jwtVerify` against a key set built from that bot's JWKS for this service.
- **Build a service-scoped key set.** The module fetches `GET /v1/bots/:botId/jwks` itself, keeps only the keys whose scope covers `expectedService`, and passes those to `jose.createLocalJWKSet`. It does not use `createRemoteJWKSet`, which exposes only the imported key and not the JWK's `aud` member, so it cannot filter by scope.
  - Key-level scope is therefore enforced when the set is built: a token signed by a key registered for other services finds no matching key and is rejected.
  - Keep an LRU of these key sets keyed by `botId`.
  - Key set TTL: **10 minutes** (matching jose's `cacheMaxAge` default), configurable.
  - An unknown `kid` triggers a refetch, limited to one per bot per 30 seconds (matching jose's cooldown).
- Enforce the token rules above, with `aud === expectedService` checked through `jwtVerify`'s `audience` option. This complements the key-level scope filter and does not replace it.
- `jti` is mandatory in every token. **Tracking `jti` to reject replays is each downstream service's choice**; expose an optional hook (e.g. `isReplay(jti, exp)`). Because of the clock tolerance, a token is accepted until `exp` plus 30 seconds, so a service that tracks `jti` must retain each record until `exp` plus the tolerance. Document that without the hook a captured token is replayable for that whole period.

## Security Model to Document

- **`BOT_TOKEN` is the root of trust.** Only its holder can establish a management key via Telegram `/confirm`.
- **Management keys are ephemeral, single-slot admin sessions.** Each bot has at most **1** active management key with a short TTL (default 30 minutes). Confirming a new management key atomically revokes the previous one and cancels all other pending registrations. Management keys are never exposed in JWKS and should never be deployed to runtime servers.
- **Service keys are strictly runtime credentials.** A leaked service key can only authenticate to its registered downstream audiences; it can never mint, modify, or revoke keys on the IdP.
- **Service key cap cannot cause lockout.** Because management keys occupy their own single-slot table and always supersede the previous management key on `/confirm`, filling the service key cap can never prevent recovery.
- **Leaked service key runbook:** revoke that `kid` (`revoke --kid`), then `rotate`.
- **Leaked management key runbook:** run `login` (or any `BOT_TOKEN`-backed CLI command) to immediately supersede the leaked management key via `/confirm`, inspect active service keys with `keys`, and revoke any unauthorized keys (or `revoke --all`).
- **Leaked `BOT_TOKEN` runbook:** rotating the token in `@BotFather` does not remove keys an attacker already registered. Recovery is:
  1. Rotate `BOT_TOKEN` in `@BotFather`.
  2. Run `init --replace-all` (or `login`, then `revoke --all`, then `init` for each service). The `/confirm` step immediately invalidates any active attacker management key and cancels all pending registrations, `DELETE /v1/bots/:botId/keys` wipes all attacker-minted service keys, and with the old token dead the attacker cannot confirm a new management key.

## Operational Semantics to Document

- **Revocation latency:** revoking a service key deletes it from the IdP immediately, but a downstream service keeps accepting it until its JWKS cache refreshes, so up to about 10 minutes with the reference verifier's default TTL. That TTL belongs to each downstream service, which may refresh sooner as it sees fit. It is independent of any CDN in front of the IdP: no CDN is planned, and if one is added, JWKS entries will be invalidated whenever a bot's keys change, so assume the IdP's HTTP layer serves current keys well within its nominal `max-age`. Management key replacement and revocation take effect immediately on the IdP (no cache).
- **HTTP rate limiting and abuse protection belong to the deployment, not the service.** Client IP addresses are only trustworthy at the network edge, and how they reach the application differs per platform, so per-IP limits are enforced by whatever fronts the IdP (a CDN or DDoS shield, a reverse proxy, or the platform's own rate limiting). The README must state this as a deployment requirement, and call out `POST /v1/registrations` in particular: it is the one unauthenticated endpoint that writes to the store.
- **Bot-to-Bot prerequisites:** both the sending bot and the Auth Bot must have Bot-to-Bot Communication Mode enabled in `@BotFather`. This is verified live (2026-11-11, Bot API 10.4 docs era): the both-enabled flow at https://github.com/KnightNiwrem/tg-bot-api-emulator/issues/155#issuecomment-6791557230 and the full mode on/off matrix at https://github.com/KnightNiwrem/tg-bot-api-emulator/issues/155#issuecomment-6793695525. Findings:
  - If either bot (or both) has the mode off, every send in either direction fails with `400 Bad Request: USER_BOT_TO_BOT_DISABLED`, and nothing is delivered. The error is identical whichever side is off, so the CLI cannot tell whether the owner's bot or the Auth Bot is misconfigured.
  - An unknown username returns `400 Bad Request: chat not found` even when the mode is off, so that error means a wrong `--auth-bot` value, not a mode problem.
  - `sendMessage` to the peer's `@username` succeeds (case-insensitive) and the recipient gets a `message` update with `chat.type: "private"` and `from.is_bot: true`.
  - `sendMessage` to the peer's **numeric ID fails** with `400 Bad Request: chat not found` until the sender has first resolved the peer by username. The CLI must therefore always address the Auth Bot by `@username`.
  - Not measured: delivery of bot-to-bot updates via webhook (both recordings used long-polling). Confirm this with one live check early in implementation, since webhook is the production path.

## Tests

Unit and integration tests covering:

- Deterministic `kid` derivation
- Audience rules: missing audiences, invalid format, `idp` rejected on service keys, `*` covering ordinary audiences but not `idp`
- Webhook secret token: missing and wrong header rejected
- Update guards: `from.is_bot === false`, non-private chats, non-`message` updates, rate limit
- Management-key registration creation: bad key length, response shape
- `/confirm`: success; unknown, expired, cancelled, and already-consumed codes do nothing; a redelivered `/confirm` does nothing; a `/confirm` from a different bot leaves the registration pending
- Single-slot management key replacement: confirming a new management key immediately invalidates the previous management key and cancels all other pending registrations for that bot; works even when service keys are at the cap
- Management key TTL: requests signed by an expired management key are rejected with `401 management_key_expired`; superseded or revoked management keys are rejected with `401 unknown_key`
- Management authentication: service key rejected on management endpoints, `aud !== "idp"` rejected, `sub` not matching the path, lifetime over 60s, reused `jti`
- Service key management endpoints: `POST /keys` creation, audience overwrite for existing `kid` keeping `createdAt`, `409 key_limit_reached` at cap; `DELETE /keys/:kid` and `DELETE /keys` returned `revoked` lists, retry returning an empty list, `DELETE /keys` preserving the active management key; `DELETE /management-key` revoking the active management key
- Atomic commands: concurrent `POST /keys` never exceed the service key cap; concurrent `/confirm` calls leave exactly one active management key and cancel losing pending registrations
- Registration resource outcomes for each status (`pending`, `confirmed`, `cancelled`, `expired`)
- JWKS response format, including the empty case and confirming management keys are never included
- End-to-end service JWT signing and verification: valid, expired, tampered payload, unknown `kid`, management key rejected on `/v1/auth/verify`, `sub` mismatch, wrong `aud`, key-scope mismatch, missing `jti`, over-long lifetime, `alg: none` and HS256 algorithm confusion
- Reference verifier scope filter: a token signed by a key registered for a different service is rejected
- Credential string round trip: both `botidp_mgmt_v1_...` and `botidp_v1_...` decode, import via `jose.importJWK`, and sign tokens accepted by their respective endpoints

## Documentation

A `README.md` covering: `@BotFather` Bot-to-Bot Communication Mode prerequisites, architecture diagram, environment variables, CLI usage (`login`, `logout`, `init`, `rotate`, `revoke`, `keys`), HTTP API contract, credential string formats, downstream verification guide, and the security model and operational semantics above.
