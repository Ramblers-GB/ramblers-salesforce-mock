export interface ReleaseEntry {
  sha: string;
  author: string;
  date: string;
  subject: string;
  body: string;
}

const RELEASE_NOTE_BODY_OVERRIDES: Record<string, string> = {
  "15c47ad": "The mock now implements Ramblers Team Emails 1.0.0 with team-scoped credentials, complete supporter snapshots, and auditable unsubscribe and bounce writebacks. Consumers can retrieve members, affiliated members, volunteers, and Wellbeing Walkers through `GET /get_supporters`. The operator console shows writeback history. Routes from the superseded NGX API proposal at https://github.com/nbarrett/ngx-ramblers/issues/209 now return `404`. Synthetic fixtures cover the published supporter relationships, permissions, and nullable membership numbers.",
};

export function releaseEntryForDisplay(entry: ReleaseEntry): ReleaseEntry {
  const matchingSha = Object.keys(RELEASE_NOTE_BODY_OVERRIDES)
    .find((sha) => entry.sha.startsWith(sha));

  return {
    ...entry,
    body: matchingSha ? RELEASE_NOTE_BODY_OVERRIDES[matchingSha] ?? entry.body : entry.body,
  };
}
