import { describe, expect, it } from "vitest";
import { releaseEntryForDisplay } from "./release-notes.model.js";

describe("releaseEntryForDisplay", () => {
  it("corrects the cross-repository issue link without removing release-note content", () => {
    const entry = releaseEntryForDisplay({
      sha: "15c47ad",
      author: "Nick Barrett",
      date: "2026-07-22T00:00:00Z",
      subject: "feat(api+fixtures): implement Ramblers Team Emails 1.0.0 (#9, #10)",
      body: "## What's new\n\nSuperseded Ticket #209 routes now return `404`.",
    });

    expect(entry.body).toContain("## What's new");
    expect(entry.body).toContain("## At a glance");
    expect(entry.body).toContain("## Technical changes");
    expect(entry.body).not.toContain("Ticket #209");
    expect(entry.body).toContain("https://github.com/nbarrett/ngx-ramblers/issues/209");
    expect(entry.body).toContain("records unsubscribe requests without assuming their unresolved consent scope");
    expect(entry.body).toContain("audits hard and soft bounces");
    expect(entry.body).toContain("`@ramblers/sf-contract` to `v1.0.0`");
    expect(entry.body).toContain("route-level conformance tests");
    expect(entry.body).toContain("OpenAPI document and Swagger UI");
  });

  it("leaves other release notes unchanged", () => {
    const body = "A normal project release note.";
    const entry = releaseEntryForDisplay({
      sha: "abcdef0",
      author: "Nick Barrett",
      date: "2026-07-23T00:00:00Z",
      subject: "fix(admin): improve release notes",
      body,
    });

    expect(entry.body).toBe(body);
  });
});
