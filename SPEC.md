# Telegram Bot Identity Provider (Key Registry): Specification

A standalone **Telegram Bot Identity Provider (Key Registry)** service and provisioning CLI. Its purpose is to let Telegram bots prove ownership of their identity via Telegram's native **Bot-to-Bot Communication** (Bot API 10.0+) and register Ed25519 public keys, so downstream services can authenticate bot requests using short-lived, client-signed JWTs without ever receiving or storing a Telegram bot token.

## Architecture Overview

1. **Provisioning time (one-time setup / rotation)**
   - A bot owner runs a local CLI with their `BOT_TOKEN`.
   - The CLI generates an Ed25519 keypair, computes a deterministic `kid`, and uses `BOT_TOKEN` *locally* to call Telegram's `sendMessage` to `@<AuthBot>` with `/register <pubKey> <audiences>`. `BOT_TOKEN` never touches our backend.
   - Telegram delivers the private message to our **Auth Bot** with a Telegram-verified `message.from.id` (`botId`) and `message.from.is_bot === true`.
   - The Auth Bot stores `(botId, kid) -> { publicKey, audiences, createdAt }` and records the command outcome.
   - The Auth Bot never replies. The CLI learns the outcome from a status endpoint, then signs a test JWT and calls `GET /v1/auth/verify` to confirm the key works end to end.
   - The CLI prints a single self-contained credential string for the owner to store in their environment variables.

2. **Runtime (downstream services; out of scope except the reference verifier and HTTP endpoints)**
   - Downstream services never talk to Telegram. They fetch a bot's public keys from our read-only JWKS endpoint, cache them, and verify per-request EdDSA JWTs signed by the bot's private key.

## Stack

- **Language:** TypeScript. Core crypto/JWT logic must be portable across Node.js 20+, Deno, and Cloudflare Workers.
- **JWT/JWK library:** [`jose`](https://github.com/panva/jose) everywhere (CLI, IdP, reference verifier). Do not hand-roll JWT parsing or signature verification.
- **Bot framework:** grammY, deployable on a VPS or serverless.
- **Rate limiting:** grammY `ratelimiter` plugin, with Redis storage so limits are shared across instances (in-memory storage for tests and local dev).
- **Key store:** SQLite via libSQL (`@libsql/client`), so the same adapter works with a local file and with Turso in serverless deployments. Connection config injected via env vars.

## Scope & Deliverables

### 1. Central Auth Bot (Telegram update handler)

- Support webhook mode, plus long-polling for local dev.
- **Webhook authenticity (required):** set a webhook `secret_token` and reject any request whose `X-Telegram-Bot-Api-Secret-Token` header does not match, using a constant-time comparison. The entire trust model depends on updates genuinely coming from Telegram.
- **Guards on every update:**
  - Handle only `message` updates. Ignore `edited_message` and everything else.
  - Ignore any message where `chat.type !== "private"` or `from?.is_bot !== true`.
  - Enforce per-`botId` rate limiting (default: 10 commands/minute).
  - **Never send any reply.** This removes any possibility of bot-to-bot reply loops. All outcomes are reported through the status endpoint.
  - There is no staleness check on `message.date`; updates are processed regardless of age.
- **Commands:**
  - `/register <pubKey_base64url> <audiences>`
    - `<pubKey_base64url>` must decode to a valid 32-byte raw Ed25519 public key.
    - `kid` is the first 16 characters of `base64url(SHA-256(rawPubKeyBytes))`.
    - `<audiences>` is **required**: a comma-separated list (e.g. `session,analytics`). Each entry is alphanumeric plus `-`, `_`, `.`; or the single entry `*` meaning all services. Registration without audiences is rejected. There is no implicit wildcard.
    - Upsert on `(botId, kid)`. Re-registering an existing `kid` **overwrites its audiences** and keeps `createdAt`.
    - Enforce a configurable cap on active keys per `botId` (default: **10**). At the cap, a new `kid` is **rejected** with `key_limit_reached`; nothing is evicted. The count-and-insert must be atomic.
  - `/revoke <kid>`: delete that `kid` for `from.id`.
  - `/revoke_all`: delete all keys for `from.id`.
  - There is no `/keys` command; the public JWKS endpoint serves that purpose.

### 2. Key Registry Storage Layer

- A swappable `KeyStore` interface: `upsertKey`, `getKeysByBotId`, `getKey`, `deleteKey`, `deleteAllKeys`, `countKeys`, plus whatever is needed for command status records.
- Key record:
  - `botId: number` (Telegram IDs exceed 32 bits; store as 64-bit integer)
  - `kid: string`
  - `publicKey: string` (base64url 32-byte raw Ed25519 public key)
  - `audiences: string[]`
  - `createdAt: number` (Unix epoch seconds)
- Unique index on `(botId, kid)`.
- Adapters: libSQL (production) and in-memory (tests).

### 3. HTTP API

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
  - `aud` is a non-standard extension member carrying the key's registered scope; document it as such.
  - A bot with no keys returns `200 { "keys": [] }`, never 404.
  - `Cache-Control: public, max-age=60`.
- `GET /v1/bots/:botId/keys/:kid/status`
  - Returns the outcome of the most recent command affecting `(botId, kid)`: `registered`, `revoked`, or an error code such as `key_limit_reached`, `invalid_public_key`, `invalid_audiences`. Returns 404 if nothing is recorded.
  - Status records may expire after a configurable retention period (default 24h).
  - `Cache-Control: no-store`.
  - Commands that cannot be tied to a `kid` (unparseable input, rate-limited before parsing) produce no status record. The CLI validates input locally before sending and, on timeout, lists these as likely causes.
- `GET /v1/auth/verify`
  - Purpose: lets a bot owner confirm their JWT signing implementation and private key are correct.
  - Accepts `Authorization: Bearer <jwt>`. `Cache-Control: no-store`.
  - Required header: `alg: "EdDSA"`, `kid`. Required claims: `sub` (botId as a decimal string), `aud` (a single string), `iat`, `exp`, `jti`.
  - Verifies the signature against the registered `(sub, kid)` key.
  - Checks `exp` and `iat` with ±30s clock tolerance.
  - Rejects tokens whose lifetime `exp - iat` exceeds a configurable maximum (env var, default **300s**).
  - Requires `aud` to be within the key's registered scope: the key's audiences contain `*` or contain `aud`.
  - Returns `200 { botId, kid, audiences }`, or `401` with a machine-readable code: `malformed_token`, `missing_claim`, `unknown_key`, `invalid_signature`, `token_expired`, `token_lifetime_too_long`, `invalid_audience`.
- `GET /health`
- The HTTP API must never accept, log, or store Telegram bot tokens. Apply basic rate limiting to the public endpoints.

### 4. Provisioning CLI (`init`, `rotate`, `revoke`, `keys`)

- `init` / `rotate`
  - Inputs: `BOT_TOKEN` (env or flag), `--auth-bot <@username>`, `--idp-url <url>`, `--aud <comma_list>` (required).
  - Generates an extractable Ed25519 keypair, computes `kid`, obtains `botId` via `getMe`.
  - Calls Telegram `sendMessage` directly, **without `parse_mode`**. Never sends `BOT_TOKEN` to the IdP.
  - Always address the Auth Bot by `@username`, never by numeric ID.
  - Map send failures to actionable messages, always including Telegram's raw description:
    - `USER_BOT_TO_BOT_DISABLED`: tell the owner to enable Bot-to-Bot Communication Mode for their bot in @BotFather, and note that the same error appears if the Auth Bot has it disabled.
    - `chat not found`: the `--auth-bot` username is wrong.
    - Anything else: print the description unchanged.
  - Polls the status endpoint with exponential backoff. On an error status, print the code and exit non-zero.
  - On `registered`, signs a test JWT (using the first registered audience, or any audience if the scope is `*`) and calls `GET /v1/auth/verify` to confirm.
  - Outputs `botidp_v1_<payload>`, where `<payload>` is base64url of the JSON `{ v: 1, botId, kid, privKey }` and `privKey` is the **private JWK** (`{ kty, crv, x, d }`), directly usable with `jose.importJWK`.
  - `rotate` registers an additional key and does not revoke the old one; remind the owner to revoke the old `kid` once the new credential is deployed.
- `revoke`: inputs `BOT_TOKEN`, `--auth-bot`, `--idp-url`, and `--kid <kid>` or `--all`. Sends `/revoke <kid>` or `/revoke_all`, then confirms by polling the status endpoint (`--kid`) or JWKS until empty (`--all`).
- `keys`: inputs `--idp-url` and `--bot-id` (or `BOT_TOKEN` to derive it). Lists active `kid`s and audiences from the JWKS endpoint. Needs no token otherwise.

### 5. Reusable Verification Reference Module

A small module downstream services can import or copy. Its only dependency is `jose`.

- Read the unverified `sub` to locate the bot, then verify with `jose.jwtVerify` against that bot's JWKS.
- Keep an LRU of `createRemoteJWKSet` instances keyed by `botId`.
  - JWKS cache TTL: jose's default of **10 minutes** (`cacheMaxAge`), configurable.
  - Unknown `kid` triggers a refetch, rate-limited by jose's cooldown (30s).
- Enforce: `alg === "EdDSA"`, `sub` matches the JWKS owner, `aud === expectedService`, key-level scope (`key.aud` contains `*` or `expectedService`), `iat`/`exp` with ±30s tolerance, maximum lifetime (default 300s, configurable), and presence of `jti`.
- `jti` is mandatory in every token. **Tracking `jti` to reject replays is each downstream service's choice**; expose an optional hook (e.g. `isReplay(jti, exp)`) and document that without it a captured token is replayable until it expires.

## Operational Semantics to Document

- **Revocation latency:** revoking deletes the key from the IdP immediately, but a downstream service keeps accepting it until its JWKS cache refreshes, so up to about 10 minutes with the reference verifier's default TTL. That TTL belongs to each downstream service, which may refresh sooner as it sees fit. It is independent of any CDN in front of the IdP: no CDN is planned, and if one is added, JWKS entries will be invalidated whenever a bot's keys change, so assume the IdP's HTTP layer serves current keys well within its nominal `max-age`.
- **Leaked `BOT_TOKEN` runbook:** rotating the token in @BotFather does not remove keys an attacker already registered. Recovery is: rotate the token, run `keys` to inspect, `revoke --all`, then `init`.
- **Bot-to-Bot prerequisites:** both the sending bot and the Auth Bot must have Bot-to-Bot Communication Mode enabled in @BotFather . This is verified live (2026-11-11, Bot API 10.4 docs era): the both-enabled flow at https://github.com/KnightNiwrem/tg-bot-api-emulator/issues/155#issuecomment-6791557230 and the full mode on/off matrix at https://github.com/KnightNiwrem/tg-bot-api-emulator/issues/155#issuecomment-6793695525. Findings:
  - If either bot (or both) has the mode off, every send in either direction fails with `400 Bad Request: USER_BOT_TO_BOT_DISABLED`, and nothing is delivered. The error is identical whichever side is off, so the CLI cannot tell whether the owner's bot or the Auth Bot is misconfigured.
  - An unknown username returns `400 Bad Request: chat not found` even when the mode is off, so that error means a wrong `--auth-bot` value, not a mode problem.
  - `sendMessage` to the peer's `@username` succeeds (case-insensitive) and the recipient gets a `message` update with `chat.type: "private"` and `from.is_bot: true`.
  - `sendMessage` to the peer's **numeric ID fails** with `400 Bad Request: chat not found` until the sender has first resolved the peer by username. The CLI must therefore always address the Auth Bot by `@username`.
  - Not measured: delivery of bot-to-bot updates via webhook (both recordings used long-polling). Confirm this with one live check early in implementation, since webhook is the production path.

## Known Open Gaps (do not implement; record in README)

- **`update_id` deduplication is deliberately deferred.** Each command is idempotent on its own, so a plain redelivery is harmless. The unresolved risk is ordering: a redelivered old `/register` processed after a `/revoke` would resurrect a revoked key. Open design questions: whether to mark an `update_id` as seen at the start or the end of handling, and how to treat our own 5xx responses, which cause Telegram to redeliver. Do make handlers return 2xx for all handled outcomes, including rejected commands, so Telegram does not redeliver them needlessly.

## Tests

Unit and integration tests covering:

- Deterministic `kid` derivation; idempotent re-registration; audience overwrite on re-registration
- Webhook secret token: missing and wrong header rejected
- Update guards: `from.is_bot === false`, non-private chats, non-`message` updates, rate limit
- `/register` validation: bad key length, missing audiences, invalid audience format, key cap rejection
- `/revoke` and `/revoke_all` flows, including revoking another bot's `kid` having no effect
- Status endpoint outcomes for success and each error code
- JWKS response format, including the empty case
- End-to-end JWT signing and verification: valid, expired, tampered payload, unknown `kid`, `sub` mismatch, wrong `aud`, key-scope mismatch, missing `jti`, over-long lifetime, `alg: none` and HS256 algorithm confusion
- Credential string round trip: CLI output decodes, imports via `jose.importJWK`, and signs a token the IdP accepts

## Documentation

A `README.md` covering: @BotFather Bot-to-Bot Communication Mode prerequisites, architecture diagram, environment variables, CLI usage, HTTP API contract, credential string format, downstream verification guide, the operational semantics above, and the known open gaps.
