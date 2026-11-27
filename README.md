# Telegram Bot Identity Provider

A key registry that lets Telegram bots prove their identity through bot-to-bot messaging and register
Ed25519 public keys, so downstream services can authenticate bots with short-lived signed JWTs
instead of bot tokens.

The project is at the specification stage: [SPEC.md](SPEC.md) describes the design, and no service
code exists yet.

## Runtime support

The code targets Node.js 24+, Deno, Bun, and Cloudflare Workers, preferring web-standard APIs. Where a
runtime-specific API is used, runtime-aware branching selects the right one for each runtime, kept in
a thin adapter.
Bun is the runtime for development only, with Biome for linting and formatting.

## Getting started

Install [Bun](https://bun.sh/docs/installation) 1.4.4, then install dependencies:

```sh
bun install --frozen-lockfile
```

## Commands

- `bun run start` — run `src/main.ts`
- `bun run dev` — run `src/main.ts` with file watching
- `bun run test` — run tests
- `bun run lint` — lint files with Biome
- `bun run fmt` — format files with Biome
- `bun run fmt:check` — check formatting
- `bun run check` — type-check source files and tests

Biome uses two-space indentation, single quotes, and a 100-column line width. GitHub Actions runs
formatting, lint, type, and test checks on pushes to `main` or `master` and on pull requests.
