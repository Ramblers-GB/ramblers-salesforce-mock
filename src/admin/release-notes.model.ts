export interface ReleaseEntry {
  sha: string;
  author: string;
  date: string;
  subject: string;
  body: string;
}

const RELEASE_NOTE_BODY_OVERRIDES: Record<string, string> = {
  "15c47ad": [
    "## What's new",
    "",
    "The live mock now implements the three Ramblers Team Emails operations and uses team-scoped API credentials. It returns current supporter snapshots, records unsubscribe requests without assuming their unresolved consent scope, and audits hard and soft bounces.",
    "",
    "## At a glance",
    "",
    "- Consumers can retrieve members, affiliated members, volunteers and Wellbeing Walkers through `GET /get_supporters`.",
    "- The operator console shows unsubscribe and bounce writeback history.",
    "- Superseded NGX Ticket 209 at https://github.com/nbarrett/ngx-ramblers/issues/209 routes now return `404`.",
    "- Synthetic fixtures cover the published supporter relationships, permissions and nullable membership numbers.",
    "",
    "## Technical changes",
    "",
    "- Upgrade `@ramblers/sf-contract` to `v1.0.0`.",
    "- Replace bearer and path authentication with published `api_key` and `team_code` query parameters.",
    "- Add supporter mapping, writeback persistence and route-level conformance tests.",
    "- Serve the Ramblers Team Emails 1.0.0 OpenAPI document and Swagger UI.",
  ].join("\n"),
};

export function releaseEntryForDisplay(entry: ReleaseEntry): ReleaseEntry {
  const matchingSha = Object.keys(RELEASE_NOTE_BODY_OVERRIDES)
    .find((sha) => entry.sha.startsWith(sha));

  return {
    ...entry,
    body: matchingSha ? RELEASE_NOTE_BODY_OVERRIDES[matchingSha] ?? entry.body : entry.body,
  };
}
