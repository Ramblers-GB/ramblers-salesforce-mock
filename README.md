# ramblers-salesforce-mock

Standalone reference mock server for the Ramblers Salesforce API specified in
[`nbarrett/ngx-ramblers#209`](https://github.com/nbarrett/ngx-ramblers/issues/209).
Intended as a shared development fixture for the NGX Ramblers platform, Charlie
Bigley's MailMan, and Ramblers HQ's own Salesforce build-out team.

- **Contract**: implements the day-one endpoints from #209 (`GET /api/groups/{groupCode}/members`,
  `POST /api/members/{membershipNumber}/consent`). Phase 2 endpoints (#211) are a
  future extension.
- **Tenancy**: each API token is scoped to a single `groupCode` or `areaCode`;
  each operator account (e.g. NGX, MailMan) owns its own tenants and sees only
  its own data.
- **Data**: ingest Insight Hub `ExportAll.xlsx` via the admin UI, or generate
  synthetic rows for load/shape testing.
- **Docs**: OpenAPI served at `/api/openapi.json`; Swagger UI at `/docs`.

## Stack

- Node 20 + TypeScript (100% TS source, strict mode, no hand-written JS).
- Express + Mongoose (MongoDB Atlas).
- esbuild for both server and admin-UI client bundles.
- Deployed to Fly.io (`lhr`) at `salesforce-mock.ngx-ramblers.org.uk`.

## Local development

```sh
npm ci
cp .env.example .env  # fill in ATLAS_URI and admin creds
npm run dev
```

## Deployment

See `fly.toml`. Secrets live in the NGX staging `config.environments` document
(single source of truth) and are mirrored to Fly via `fly secrets set` at deploy
time.
