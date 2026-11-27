# Telegram Bot Identity Provider (Key Registry): Specification

A standalone **Telegram Bot Identity Provider (Key Registry)** service and provisioning CLI. Its purpose is to let Telegram bots prove ownership of their identity via Telegram's native **Bot-to-Bot Communication** (Bot API 10.0+) and register Ed25519 public keys, so downstream services can authenticate bot requests using short-lived, client-signed JWTs without ever receiving or storing a Telegram bot token.

## Architecture Overview

Telegram is used for exactly one thing: proving which bot approves a pending key registration. Everything else is HTTP.

1. **Registering a key (Telegram-rooted)**
   - A bot owner runs a local CLI with their `BOT_TOKEN`. `BOT_TOKEN` never touches our backend.
   - The CLI generates an Ed25519 keypair and calls `POST /v1/registrations` with the public key, the audiences, and the bot's ID. The IdP stores a pending registration and returns a single-use, short-lived `code`.
   - The CLI uses `BOT_TOKEN` _locally_ to call Telegram's `sendMessage` to `@<AuthBot>` with `/confirm <code>`.
   - Telegram delivers the private message to our **Auth Bot** with a Telegram-verified `message.from.id` (`botId`) and `message.from.is_bot === true`. If that `botId` matches the pending registration, the Auth Bot consumes the code and stores `(botId, kid) -> { publicKey, audiences, createdAt }`.
   - The Auth Bot never replies. The CLI polls `GET /v1/registrations/:code` for the outcome, then signs a test JWT and calls `GET /v1/auth/verify` to confirm the key works end to end.
   - The CLI prints a single self-contained credential string for the owner to store in their environment variables.

2. **Managing keys (HTTP, authenticated by a registered key)**
   - The IdP is itself a service that bots authenticate to with the same signed JWTs. A key registered with the reserved `idp` audience can revoke the bot's keys over HTTP and gets a synchronous response.
   - HTTP management can only **reduce** access. Adding a key or changing a key's audiences always requires a Telegram-confirmed registration, so a leaked private key can never be used to mint further keys.

3. **Runtime (downstream services; out of scope except the reference verifier and HTTP endpoints)**
   - Downstream services never talk to Telegram. They fetch a bot's public keys from our JWKS endpoint, cache them, and verify per-request EdDSA JWTs signed by the bot's private key.

### Why Telegram only confirms a code

A Telegram update can be delayed or redelivered, and the Auth Bot cannot usefully answer the sending bot. Carrying state-changing commands such as revocation over that channel would need deduplication, ordering rules, and a separate way to report outcomes. A single-use code avoids all of that: a redelivered `/confirm` finds the code already consumed and does nothing, a delayed one finds it expired or cancelled, and every expiry and cancellation decision is made on the IdP's own clock.

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
- Each bot may hold a configurable maximum number of active keys (default: **10**). At the cap, registering a new `kid` is rejected with `key_limit_reached`; nothing is evicted.

### Audiences

- Every key is registered with a non-empty list of audiences naming the services it may be used for (e.g. `session`, `analytics`). There is no default: a registration without audiences is rejected.
- Each entry is alphanumeric plus `-`, `_`, `.`, or the wildcard `*`.
- `*` covers every downstream service. It never covers a reserved audience.
- `idp` is the one **reserved audience**. It authorises key management on the IdP itself and must be listed explicitly; `*` alone does not grant it.
- A key's scope **covers** an audience `a` when its list contains `a`, or when its list contains `*` and `a` is not reserved. This single definition is used by `/v1/auth/verify`, the management endpoints, and the reference verifier.

### Tokens

A bot-signed JWT, wherever it is verified, must have:

- Header: `alg: "EdDSA"`, `kid`.
- Claims: `sub` (botId as a decimal string), `aud` (a single string), `iat`, `exp`, `jti`.
- A signature that verifies against the registered `(sub, kid)` key.
- `exp` and `iat` valid within ±30s clock tolerance.
- A lifetime `exp - iat` no longer than a configurable maximum (default **300s**).
- An `aud` covered by the key's scope.

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
  3. If the registration has `replaceExisting` set, delete all of the bot's keys and cancel all of its other pending registrations.
  4. If the `kid` is new and the bot is at the key cap, mark the registration `rejected` with `key_limit_reached`.
  5. Otherwise upsert the key on `(botId, kid)` and mark the registration `confirmed`. For an existing `kid`, the audiences are overwritten and `createdAt` is kept; this is how a key's audiences are changed.
- No `update_id` deduplication or `message.date` staleness check is needed: a code can be consumed once, and its expiry is enforced by the IdP.

### 2. Storage Layer

- A swappable `Store` interface, with a libSQL adapter (production) and an in-memory adapter (tests).
- **Key record**, unique on `(botId, kid)`:
  - `botId: number` (Telegram IDs exceed 32 bits; store as 64-bit integer)
  - `kid: string`
  - `publicKey: string` (base64url 32-byte raw Ed25519 public key)
  - `audiences: string[]`
  - `createdAt: number` (Unix epoch seconds)
- **Registration record**, unique on `code`:
  - `code: string` (at least 128 bits from a CSPRNG, base64url)
  - `botId`, `kid`, `publicKey`, `audiences`, `replaceExisting: boolean`
  - `status`: `pending`, `confirmed`, `rejected`, `cancelled`, or `expired`
  - `error?: string` (set when `rejected`)
  - `createdAt`, `expiresAt` (Unix epoch seconds)
- **Used-token record:** the `jti` of each accepted management token, kept until its `exp` plus the clock tolerance.
- **Writes are command-level operations that the adapter applies atomically:** create a registration, confirm a registration, revoke a key, revoke all keys. Handlers must not compose a command from separate check and write calls.
  - All reads and writes of one command run in a single write transaction, so concurrent commands for the same bot cannot interleave. This covers the key-cap count, the pending-status check, and cancellation.
  - The transaction must take the write lock before its first read (SQLite `BEGIN IMMEDIATE`; a libSQL `write` transaction), so a check is never made against a snapshot that a concurrent command then invalidates.
- Reads: keys by bot, a single key, a registration by code.

### 3. HTTP API

The HTTP API must never accept, log, or store Telegram bot tokens. The service does not rate-limit HTTP requests itself; that is the deployment's responsibility (see Operational Semantics). Responses other than the JWKS carry `Cache-Control: no-store`. Errors use a JSON body with a machine-readable `error` code.

#### Registrations (unauthenticated)

- `POST /v1/registrations`
  - Body: `{ "botId": 123, "publicKey": "<base64url>", "audiences": ["session"], "replaceExisting": false }`. `replaceExisting` is optional and defaults to `false`.
  - Validates the public key and audiences; on failure returns `400` with `invalid_public_key` or `invalid_audiences`.
  - Creates a pending registration that expires after a configurable period (default **5 minutes**) and returns `201 { "code", "kid", "status": "pending", "expiresAt" }`.
  - `botId` here is only a claim. It grants nothing until that bot confirms the code through Telegram.
  - There is deliberately **no cap on pending registrations per `botId`**: since the endpoint is unauthenticated, such a cap would let anyone block a bot from registering. The service bounds what one request can cost instead: a registration is a single small row, it expires quickly, and expired registrations are purged.
- `GET /v1/registrations/:code`
  - Returns `200 { "status", "botId", "kid", "expiresAt", "error"? }`. A pending registration past its `expiresAt` reports `expired`.
  - Returns `404` for an unknown code. Finished registrations may be purged after a configurable retention period (default 24h).

#### Key management (authenticated)

- Requests carry `Authorization: Bearer <jwt>`. The token must satisfy the token rules above, and additionally:
  - `aud` must be `idp`, so the signing key must have been registered with the `idp` audience.
  - `sub` must equal `:botId` in the path; otherwise `403 forbidden`.
  - Its lifetime must not exceed **60s**.
  - Its `jti` must not have been used before; a repeat is rejected with `401 token_replayed`.
- `DELETE /v1/bots/:botId/keys/:kid`: revoke one key and cancel the bot's pending registrations for that `kid`.
- `DELETE /v1/bots/:botId/keys`: revoke all of the bot's keys, including the one that signed the request, and cancel all of its pending registrations.
- Both return `200 { "revoked": ["<kid>", ...] }` listing the keys actually removed. Revoking a key that does not exist is not an error and returns an empty list, so a client can safely retry with a fresh token.
- There are no endpoints that add a key or change a key's audiences.

#### Public keys and verification

- `GET /v1/bots/:botId/jwks`
  - Returns a standard JWK Set for all active keys of `:botId`:

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
  - A bot with no keys returns `200 { "keys": [] }`, never 404.
  - `Cache-Control: public, max-age=60`.
- `GET /v1/auth/verify`
  - Purpose: lets a bot owner confirm their JWT signing implementation and private key are correct.
  - Accepts `Authorization: Bearer <jwt>` and applies the token rules above. Any `aud` covered by the key's scope is accepted.
  - Returns `200 { botId, kid, audiences }`, or `401` with one of: `malformed_token`, `missing_claim`, `unknown_key`, `invalid_signature`, `token_expired`, `token_lifetime_too_long`, `invalid_audience`.
- `GET /health`

### 4. Provisioning CLI (`init`, `rotate`, `revoke`, `keys`)

- `init` / `rotate`
  - Inputs: `BOT_TOKEN` (env or flag), `--auth-bot <@username>`, `--idp-url <url>`, `--aud <comma_list>` (required), and optional `--replace-all`.
  - Generates an extractable Ed25519 keypair, computes `kid`, and obtains `botId` via `getMe`.
  - Calls `POST /v1/registrations`, with `replaceExisting` set when `--replace-all` is given. Never sends `BOT_TOKEN` to the IdP.
  - Sends `/confirm <code>` with Telegram `sendMessage`, **without `parse_mode`**, always addressing the Auth Bot by `@username` and never by numeric ID.
  - Maps send failures to actionable messages, always including Telegram's raw description:
    - `USER_BOT_TO_BOT_DISABLED`: tell the owner to enable Bot-to-Bot Communication Mode for their bot in @BotFather, and note that the same error appears if the Auth Bot has it disabled.
    - `chat not found`: the `--auth-bot` username is wrong.
    - Anything else: print the description unchanged.
  - Polls `GET /v1/registrations/:code` with exponential backoff until the status is no longer `pending`. On `rejected`, `cancelled`, or `expired`, print the status and any error code and exit non-zero.
  - On `confirmed`, signs a test JWT (using the first registered audience, or any non-reserved name if that audience is `*`) and calls `GET /v1/auth/verify` to confirm.
  - Outputs `botidp_v1_<payload>`, where `<payload>` is base64url of the JSON `{ v: 1, botId, kid, privKey }` and `privKey` is the **private JWK** (`{ kty, crv, x, d }`), directly usable with `jose.importJWK`.
  - `rotate` registers an additional key and does not revoke the old one; remind the owner to revoke the old `kid` once the new credential is deployed.
  - `--replace-all` is the recovery path: the new key replaces every existing key in one step. It works when all private keys are lost, when the bot is at the key cap, and after a leak.
- `revoke`: inputs `--idp-url`, and `--kid <kid>` or `--all`, plus one way to authenticate:
  - `--credential <botidp_v1_...>` (or env): a credential whose key was registered with the `idp` audience. The CLI signs a management token and calls the matching `DELETE` endpoint.
  - `BOT_TOKEN` and `--auth-bot`: the CLI registers a temporary key with only the `idp` audience through the normal confirmation flow, uses it to revoke, and then revokes the temporary key itself. This needs one free key slot; at the cap, use `init --replace-all` instead.
  - Prints the list of revoked `kid`s returned by the IdP.
- `keys`: inputs `--idp-url` and `--bot-id` (or `BOT_TOKEN` to derive it). Lists active `kid`s and audiences from the JWKS endpoint. Needs no credential otherwise.

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

- **`BOT_TOKEN` is the root of trust.** Only its holder can add a key or change a key's audiences, because both require a Telegram-confirmed registration.
- **A private key with the `idp` audience is a management credential.** Its holder can revoke the bot's keys, and nothing more. If it leaks, the worst outcome is that the bot's keys are revoked; the owner recovers with `init --replace-all`.
- **Keep management and runtime keys separate.** Runtime credentials deployed to servers should not include the `idp` audience. The CLI's `BOT_TOKEN`-based `revoke` exists so that owners need no long-lived management key at all.
- **Leaked private key runbook:** revoke that `kid` (`revoke --kid`), then `rotate`.
- **Leaked `BOT_TOKEN` runbook:** rotating the token in @BotFather does not remove keys an attacker already registered. Recovery is: rotate the token, then run `init --replace-all`. That removes every other key and cancels every pending registration in the same step as registering the new key, so the attacker's keys cannot be used to interfere, and with the old token dead the attacker cannot confirm anything further.

## Operational Semantics to Document

- **Revocation latency:** revoking deletes the key from the IdP immediately, but a downstream service keeps accepting it until its JWKS cache refreshes, so up to about 10 minutes with the reference verifier's default TTL. That TTL belongs to each downstream service, which may refresh sooner as it sees fit. It is independent of any CDN in front of the IdP: no CDN is planned, and if one is added, JWKS entries will be invalidated whenever a bot's keys change, so assume the IdP's HTTP layer serves current keys well within its nominal `max-age`.
- **HTTP rate limiting and abuse protection belong to the deployment, not the service.** Client IP addresses are only trustworthy at the network edge, and how they reach the application differs per platform, so per-IP limits are enforced by whatever fronts the IdP (a CDN or DDoS shield, a reverse proxy, or the platform's own rate limiting). The README must state this as a deployment requirement, and call out `POST /v1/registrations` in particular: it is the one unauthenticated endpoint that writes to the store.
- **Bot-to-Bot prerequisites:** both the sending bot and the Auth Bot must have Bot-to-Bot Communication Mode enabled in @BotFather. This is verified live (2026-11-11, Bot API 10.4 docs era): the both-enabled flow at https://github.com/KnightNiwrem/tg-bot-api-emulator/issues/155#issuecomment-6791557230 and the full mode on/off matrix at https://github.com/KnightNiwrem/tg-bot-api-emulator/issues/155#issuecomment-6793695525. Findings:
  - If either bot (or both) has the mode off, every send in either direction fails with `400 Bad Request: USER_BOT_TO_BOT_DISABLED`, and nothing is delivered. The error is identical whichever side is off, so the CLI cannot tell whether the owner's bot or the Auth Bot is misconfigured.
  - An unknown username returns `400 Bad Request: chat not found` even when the mode is off, so that error means a wrong `--auth-bot` value, not a mode problem.
  - `sendMessage` to the peer's `@username` succeeds (case-insensitive) and the recipient gets a `message` update with `chat.type: "private"` and `from.is_bot: true`.
  - `sendMessage` to the peer's **numeric ID fails** with `400 Bad Request: chat not found` until the sender has first resolved the peer by username. The CLI must therefore always address the Auth Bot by `@username`.
  - Not measured: delivery of bot-to-bot updates via webhook (both recordings used long-polling). Confirm this with one live check early in implementation, since webhook is the production path.

## Tests

Unit and integration tests covering:

- Deterministic `kid` derivation
- Audience rules: missing audiences, invalid format, `*` covering ordinary audiences but not `idp`
- Webhook secret token: missing and wrong header rejected
- Update guards: `from.is_bot === false`, non-private chats, non-`message` updates, rate limit
- Registration creation: bad key length, invalid audiences, response shape
- `/confirm`: success; unknown, expired, cancelled, and already-consumed codes do nothing; a redelivered `/confirm` does nothing; a `/confirm` from a different bot leaves the registration pending
- Key cap: a new `kid` at the cap is rejected with `key_limit_reached`; re-registering an existing `kid` at the cap succeeds and overwrites its audiences
- `replaceExisting`: other keys removed and other pending registrations cancelled in the same operation; works at the key cap
- Management endpoints: revoke one, revoke all, returned `revoked` lists, retry returning an empty list, cancellation of pending registrations
- Management authentication: key without `idp` rejected, key with only `*` rejected, `sub` not matching the path, lifetime over 60s, reused `jti`
- Atomic commands: concurrent confirmations never exceed the key cap; a confirmation racing a revoke-all never leaves a key registered from a cancelled registration
- Registration resource outcomes for each status
- JWKS response format, including the empty case
- End-to-end JWT signing and verification: valid, expired, tampered payload, unknown `kid`, `sub` mismatch, wrong `aud`, key-scope mismatch, missing `jti`, over-long lifetime, `alg: none` and HS256 algorithm confusion
- Reference verifier scope filter: a token signed by a key registered for a different service is rejected
- Credential string round trip: CLI output decodes, imports via `jose.importJWK`, and signs a token the IdP accepts

## Documentation

A `README.md` covering: @BotFather Bot-to-Bot Communication Mode prerequisites, architecture diagram, environment variables, CLI usage, HTTP API contract, credential string format, downstream verification guide, and the security model and operational semantics above.
