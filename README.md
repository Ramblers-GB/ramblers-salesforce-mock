# ramblers-salesforce-mock

Reference mock server for the Ramblers Salesforce API specified in [`nbarrett/ngx-ramblers#209`](https://github.com/nbarrett/ngx-ramblers/issues/209). Live at [`salesforce-mock.ngx-ramblers.org.uk`](https://salesforce-mock.ngx-ramblers.org.uk).

## One repo of three

This repo is one of three that make up the Salesforce Member API family. Architecture story: [_From Mock to Production_](https://www.ngx-ramblers.org.uk/how-to/technical-articles/2026-04-27-salesforce-mock-to-production).

| Repo | What it is | Live at |
|---|---|---|
| [`ramblers-salesforce-contract`](https://github.com/nbarrett/ramblers-salesforce-contract) | The shared wire-format package — TypeScript types, Zod request schemas, OpenAPI builder, error envelope, Insight Hub columns, and the `MemberProvider` port interface. Versioned (currently `v0.2.0`). | npm-style git tag dependency |
| **`ramblers-salesforce-mock`** (this repo) | The development server — Mongo-backed, with the admin SPA, xlsx ingest and synthetic-data generator. | [salesforce-mock.ngx-ramblers.org.uk](https://salesforce-mock.ngx-ramblers.org.uk) |
| [`ramblers-salesforce-server`](https://github.com/nbarrett/ramblers-salesforce-server) | The production server skeleton — same wire format, same routes, same OpenAPI document, with a Salesforce-backed adapter waiting on Phase 4 of the migration. | [salesforce-server.ngx-ramblers.org.uk](https://salesforce-server.ngx-ramblers.org.uk) |

The mock and the production server are interchangeable from a consumer's perspective — both serve the byte-identical wire shape because both depend on the same contract package. Consumers (NGX-Ramblers, MailMan) point at whichever URL fits their environment.

## What this server provides

- **Day-one endpoints** from [#209](https://github.com/nbarrett/ngx-ramblers/issues/209): `GET /api/groups/{groupCode}/members` and `POST /api/members/{membershipNumber}/consent`. Phase 2 endpoints ([#211](https://github.com/nbarrett/ngx-ramblers/issues/211) — training detail, area aggregates, accreditation) are a future extension.
- **Multi-tenant scoping**: each API token is scoped to a single `groupCode` or `areaCode`; each operator account (NGX, MailMan, etc.) owns its own tenants and sees only its own data.
- **Data loading**: upload Insight Hub `ExportAll.xlsx` through the admin UI, or generate synthetic rows for load/shape testing.
- **Wire-format docs**: OpenAPI at `/api/openapi.json`, Swagger UI at `/docs`. Both built from the contract package's `buildOpenApiDocument()` so they stay aligned with whatever the production server ships.
- **Admin SPA**: tenant + token + member management at `/admin`. Mock-only — production is API-only.

## Stack

- Node 20+ and strict TypeScript (no `.js` / `.mjs` / `.cjs` source files anywhere).
- Express + Mongoose (MongoDB Atlas).
- `@ramblers/sf-contract` pinned at a git tag for the wire format.
- pnpm for package management. esbuild for the server bundle. Vite for the admin-UI client bundle and dev HMR.
- Deployed to Fly.io (`lhr`).

## Local development

```sh
corepack enable                # one-off — activates the pnpm version pinned in package.json
pnpm install
cp .env.example .env           # fill in ATLAS_URI and admin creds
pnpm dev
```

`pnpm dev` runs the server with Vite middleware mounted, so the admin SPA gets true HMR on every save.

## Deployment

See `fly.toml`. Secrets live in the NGX staging `config.environments` document (the only place they live) and are mirrored to Fly via `fly secrets set` at deploy time.

## Reading

- [_From Mock to Production_](https://www.ngx-ramblers.org.uk/how-to/technical-articles/2026-04-27-salesforce-mock-to-production) — architecture, port-and-adapter pattern, and how the three repos fit together.
- [_The Ramblers Salesforce Mock Server_](https://www.ngx-ramblers.org.uk/how-to/technical-articles/2026-04-21-ramblers-salesforce-mock-server) — the original write-up of this repo.
- [_Using the Mock_](https://www.ngx-ramblers.org.uk/how-to/technical-articles/2026-04-21-using-ramblers-salesforce-mock) — operator-level walkthroughs (sign-in, tenants, tokens, calling the API, loading data).
