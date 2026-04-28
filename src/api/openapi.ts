import { buildOpenApiDocument } from "@ramblers/sf-contract";
import { loadConfig } from "../config.js";

let cached: Record<string, unknown> | undefined;

export function getOpenApiDocument(): Record<string, unknown> {
  if (cached) return cached;
  const config = loadConfig();
  cached = buildOpenApiDocument({
    publicBaseUrl: config.PUBLIC_BASE_URL,
    serverDescription: "Mock deployment",
    info: {
      title: "Ramblers Salesforce API — Mock Server",
      version: "0.1.0",
      description: [
        "## Try it out",
        "",
        "**→ [Open the Admin Console](/admin)** — sign in (operator account or bootstrap token).<br>",
        "**→ [Create a tenant](/admin)** — pick a group code (4 chars) or area code (2 chars).<br>",
        "**→ [Generate synthetic members](/admin)** — set count, email pattern, consent distribution, then click **Generate &amp; import**.<br>",
        "**→ [Generate an API token](/admin)** — scoped to that tenant, shown once.<br>",
        "**→ Click _Authorize_ below** — paste the token; every endpoint with a 🔒 becomes live.<br>",
        "**→ [Download Insight Hub xlsx](/admin)** — exports the tenant's current dataset in the exact 36-column Insight Hub format any consumer can already import.",
        "",
        "## Reference",
        "",
        "**→ [nbarrett/ngx-ramblers#209](https://github.com/nbarrett/ngx-ramblers/issues/209)** — day-one API contract this mock conforms to (CI verifies the local schema stays in sync via `pnpm check:schema-sync`).<br>",
        "**→ [nbarrett/ngx-ramblers#211](https://github.com/nbarrett/ngx-ramblers/issues/211)** — Phase 2 spec (training, area aggregates, accreditation) — out of scope for this mock today.<br>",
        "**→ [ramblers-salesforce-mock on GitHub](https://github.com/nbarrett/ramblers-salesforce-mock)** — this server's source.<br>",
        "**→ [@ramblers/sf-contract](https://github.com/nbarrett/ramblers-salesforce-contract)** — the wire-format package shared with the production server.<br>",
        "**→ [Production server](https://salesforce-server.ngx-ramblers.org.uk/docs)** — sibling deployment serving real Salesforce data once Phase 4 wires it.<br>",
        "**→ [Raw openapi.json](/api/openapi.json)** — the document this page is rendered from.",
        "",
        "## What this is",
        "",
        "A shared development fixture for the NGX-Ramblers platform, Charlie Bigley's MailMan, and Ramblers HQ's own Salesforce build team. Not NGX-Ramblers, not MailMan, not Ramblers HQ — it exists only to give all three a conformant endpoint to code against.",
      ].join("\n"),
      contact: {
        name: "Ramblers Salesforce Mock",
        url: "https://github.com/nbarrett/ramblers-salesforce-mock",
      },
    },
  });
  return cached;
}
