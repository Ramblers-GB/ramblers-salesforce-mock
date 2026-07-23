# ramblers-salesforce-mock

Live development and test implementation of [Ramblers Team Emails 1.0.0](https://app.swaggerhub.com/apis/JAMESKEARS/ramblers-group-email/1.0.0). The deployed service is available at [salesforce-mock.ngx-ramblers.org.uk](https://salesforce-mock.ngx-ramblers.org.uk).

The mock gives API consumers realistic, isolated and repeatable supporter data before the Head Office implementation is available. It implements the same contract consumed by NGX and can also support other clients testing against the published interface.

## Published operations

| Operation | Purpose |
|---|---|
| `GET /get_supporters` | Retrieve the current supporters associated with a team. |
| `POST /unsubscribe` | Record an unsubscribe request for a supporter. |
| `POST /bounced_email` | Record a hard or soft email bounce. |

Each operation accepts the published `api_key` and `team_code` query parameters. API keys are restricted to one team, and mismatched combinations are rejected.

The superseded Ticket #209 routes are not retained. Consumers therefore fail clearly if they have not migrated to Ramblers Team Emails 1.0.0.

## Contract

The mock pins [`@ramblers/sf-contract` v1.0.2](https://github.com/nbarrett/ramblers-salesforce-contract/releases/tag/v1.0.2). That package mirrors the published SwaggerHub definition and supplies the TypeScript types, validation schemas, error mappings and OpenAPI document used here.

- Swagger UI: [salesforce-mock.ngx-ramblers.org.uk/docs](https://salesforce-mock.ngx-ramblers.org.uk/docs)
- OpenAPI JSON: [salesforce-mock.ngx-ramblers.org.uk/api/openapi.json](https://salesforce-mock.ngx-ramblers.org.uk/api/openapi.json)
- Operator console: [salesforce-mock.ngx-ramblers.org.uk/admin](https://salesforce-mock.ngx-ramblers.org.uk/admin)

## Supporter fixtures

The synthetic generator creates all four published team relationships:

- members;
- affiliated members;
- volunteers; and
- Wellbeing Walkers.

It produces stable `contactId` and `memberRef` values, optional membership numbers, the published membership statuses, volunteer roles, email preferences and team-scoped permissions. Insight Hub spreadsheet import remains available as a transitional way to seed member-shaped records.

Unsubscribe and bounce calls are written to a separate audit collection. Unsubscribe calls are recorded without changing a consent field because the published specification does not yet define the scope of that change.

## Local development

```sh
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Deployment

The service is deployed to Fly.io using `fly.toml`. Infrastructure credentials remain in the NGX staging environment configuration and are resolved only when required for deployment or diagnostics.
