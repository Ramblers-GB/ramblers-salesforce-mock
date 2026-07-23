import { buildOpenApiDocument } from "@ramblers/sf-contract";
import { loadConfig } from "../config.js";

let cached: Record<string, unknown> | undefined;

export function buildMockOpenApiDocument(publicBaseUrl: string): Record<string, unknown> {
  const document = buildOpenApiDocument({
    publicBaseUrl,
    serverDescription: "Live development and test mock",
  });
  const publishedInfo = document["info"] as Record<string, unknown>;
  return {
    ...document,
    info: {
      ...publishedInfo,
      description: [
        "## Try the live mock",
        "",
        "**→ [Open the operator console](/admin)** — sign in to manage teams, fixtures, API keys and writeback history.<br>",
        "**→ [Create or select a team](/admin)** — each team has an isolated supporter dataset.<br>",
        "**→ [Generate supporter fixtures](/admin?tab=generate)** — create members, affiliated members, volunteers and Wellbeing Walkers, including supporters without membership numbers.<br>",
        "**→ [Generate an API key](/admin?tab=tokens)** — keys are scoped to the selected team and displayed once.<br>",
        "**→ Use the operations below** — supply the generated `api_key` and matching `team_code` query values to retrieve supporters or test writebacks.<br>",
        "**→ [Inspect unsubscribe and bounce writebacks](/admin?tab=writebacks)** — review every received request and its recorded outcome.<br>",
        "**→ [Import or export Insight Hub data](/admin?tab=generate)** — retain spreadsheet compatibility while consumers move to the API.",
        "",
        "## Related resources",
        "",
        "**→ [Ramblers Team Emails 1.0.0 on SwaggerHub](https://app.swaggerhub.com/apis/JAMESKEARS/ramblers-group-email/1.0.0#/)** — the published interface implemented by this service.<br>",
        "**→ [NGX implementation programme](https://github.com/nbarrett/ngx-ramblers/issues/327)** — ordered contract, mock and consumer work.<br>",
        "**→ [Mock server source](https://github.com/nbarrett/ramblers-salesforce-mock)** — application code, issues and releases.<br>",
        "**→ [Shared contract](https://github.com/nbarrett/ramblers-salesforce-contract)** — TypeScript types, runtime validators and published-interface drift detection.<br>",
        "**→ [NGX Ramblers](https://github.com/nbarrett/ngx-ramblers)** — the consuming website and email platform.<br>",
        "**→ [Raw OpenAPI JSON](/api/openapi.json)** — the exact document rendered on this page.",
        "",
        "## About this service",
        "",
        "This is the live development and test implementation of Ramblers Team Emails 1.0.0. It provides isolated, repeatable supporter data and auditable writebacks so API consumers can integrate without using live supporter records.",
      ].join("\n"),
      contact: {
        name: "Ramblers Salesforce Mock",
        url: "https://github.com/nbarrett/ramblers-salesforce-mock",
        email: "membership@ramblers.org.uk",
      },
    },
  };
}

export function getOpenApiDocument(): Record<string, unknown> {
  if (cached) {
    return cached;
  }
  const config = loadConfig();
  cached = buildMockOpenApiDocument(config.PUBLIC_BASE_URL);
  return cached;
}
