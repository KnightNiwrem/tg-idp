# Telegram Bot Identity Provider

A key registry that lets Telegram bots prove their identity through bot-to-bot messaging and register
Ed25519 public keys, so downstream services can authenticate bots with short-lived signed JWTs
instead of bot tokens.

The project is at the skeleton stage: [OUTLINE.md](OUTLINE.md) describes the initial design, and
the source tree contains its module structure, types, and documented stubs. No features work yet;
stubbed functions throw `NotImplementedError`, and HTTP routes respond `501`.

## Runtime support

The code targets Node.js LTS release lines from 24 onward (24, 26, and every major from 27 on; the
non-LTS 25 line and Alpha prereleases are not targeted), Deno, Bun, and Cloudflare Workers,
preferring web-standard APIs. Where a runtime-specific API is used, runtime-aware branching selects
the right one for each runtime, kept in a thin adapter.
Bun is the runtime for development only, with Biome for linting and formatting.

## Getting started

Install [Bun](https://bun.sh/docs/installation) 1.4.4, then install dependencies:

```sh
bun install --frozen-lockfile
```

## Project layout

- `src/domain/` — runtime-independent concepts: bot IDs, public keys and `kid`s, audiences, JWT
  claims, credentials, and registrations
- `src/config/` — limits, defaults, and environment configuration
- `src/storage/` — the `IdpRepository` interface and its libSQL implementation
- `src/idp/` — IdP use cases, the HTTP API (`http/`), and the Telegram Auth Bot (`auth-bot/`)
- `src/cli/` — the `tg-idp` provisioning CLI
- `src/verifier/` — the self-contained reference verifier for downstream services (depends only on
  `jose`)
- `src/runtime/` — the thin adapter over runtime-specific APIs
- `src/entrypoints/` — the server (Node.js, Deno, Bun), Cloudflare Workers, and CLI entry points
- `tests/` — Vitest tests mirroring `src/`; `test.todo` entries list behavior still to implement

## Commands

- `bun run start` — run the IdP server (`src/entrypoints/server.ts`)
- `bun run dev` — run the IdP server with file watching
- `bun run cli` — run the provisioning CLI (`src/entrypoints/cli.ts`)
- `bun run test` — run tests
- `bun run lint` — lint files with Biome
- `bun run fmt` — format files with Biome
- `bun run fmt:check` — check formatting
- `bun run check` — type-check source files and tests

TypeScript is limited to erasable syntax (`erasableSyntaxOnly`) so Node.js can run sources with
type stripping; for example, use explicit fields instead of constructor parameter properties.

Biome uses two-space indentation, single quotes, and a 100-column line width. GitHub Actions runs
formatting, lint, type, and test checks on pushes to `main` or `master` and on pull requests.
