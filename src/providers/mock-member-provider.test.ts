import { beforeEach, describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown>;

const members: Doc[] = [];
const tenants: Doc[] = [];
const writebacks: Doc[] = [];

function matchField(value: unknown, cond: unknown): boolean {
  if (cond && typeof cond === "object" && !Array.isArray(cond)) {
    return Object.entries(cond as Doc).every(([op, operand]) => {
      switch (op) {
        case "$ne": return value !== operand;
        case "$nin": return !(operand as unknown[]).includes(value);
        case "$regex": return new RegExp(operand as string, (cond as Doc)["$options"] as string | undefined).test(String(value ?? ""));
        case "$options": return true;
        default: return false;
      }
    });
  }
  return value === cond;
}

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Doc[]).some((clause) => matches(doc, clause));
    return matchField(doc[key], cond);
  });
}

vi.mock("../db/models/index.js", () => ({
  Member: {
    find: (filter: Doc) => ({ exec: () => Promise.resolve(members.filter((doc) => matches(doc, filter))) }),
    findOne: (filter: Doc) => ({ exec: () => Promise.resolve(members.find((doc) => matches(doc, filter)) ?? null) }),
  },
  Tenant: {
    findOne: (filter: Doc) => ({ exec: () => Promise.resolve(tenants.find((doc) => matches(doc, filter)) ?? null) }),
  },
  WritebackEvent: {
    create: (event: Doc) => { writebacks.push(event); return Promise.resolve(event); },
  },
}));

const { MockMemberProvider } = await import("./mock-member-provider.js");

function seedMember(tenantCode: string, over: Doc = {}): void {
  members.push({
    tenantCode,
    salesforceId: `${tenantCode}-sf`,
    memberRef: `${tenantCode}-ref`,
    membershipNumber: `${tenantCode}-100`,
    lastName: "Holder",
    email: `${tenantCode.toLowerCase()}@example.org`,
    removed: false,
    ...over,
  });
}

describe("MockMemberProvider tenant isolation", () => {
  const provider = new MockMemberProvider();

  beforeEach(() => {
    members.length = 0;
    tenants.length = 0;
    writebacks.length = 0;
    tenants.push({ code: "KT" }, { code: "OT" });
    seedMember("KT", { lastName: "Kent", email: "shared@example.org", memberRef: "SHARED-REF" });
    seedMember("OT", { lastName: "Other", email: "shared@example.org", memberRef: "SHARED-REF" });
  });

  it("returns only the requested team's supporters, never another team's", async () => {
    const result = await provider.supporters({ teamCode: "kt" });

    expect(result.kind).toBe("ok");
    const supporters = result.kind === "ok" ? result.supporters : [];
    expect(supporters).toHaveLength(1);
    expect(supporters[0]!.lastName).toBe("Kent");
  });

  it("reports an unknown team rather than leaking data", async () => {
    const result = await provider.supporters({ teamCode: "ZZ" });

    expect(result.kind).toBe("teamNotFound");
  });

  it("excludes soft-removed supporters from a team's snapshot", async () => {
    seedMember("KT", { lastName: "Gone", memberRef: "KT-GONE", email: "gone@example.org", removed: true });

    const result = await provider.supporters({ teamCode: "KT" });
    const supporters = result.kind === "ok" ? result.supporters : [];

    expect(supporters.map((s) => s.lastName)).toEqual(["Kent"]);
  });

  it("does not match another team's supporter on an unsubscribe, even when ref and email collide", async () => {
    const result = await provider.unsubscribe({
      teamCode: "KT",
      request: { emailAddress: "shared@example.org", memberRef: "SHARED-REF" },
      appliedAt: new Date("2026-08-23T00:00:00.000Z"),
    });

    expect(result.kind).toBe("ok");
    expect(writebacks).toHaveLength(1);
    expect(writebacks[0]).toMatchObject({ tenantCode: "KT", resultingState: "recorded-no-scope-assumed" });
  });

  it("records a cross-team bounce attempt as not found under the requesting team", async () => {
    members.length = 0;
    seedMember("OT", { memberRef: "OT-ONLY", email: "otonly@example.org" });

    const result = await provider.bounce({
      teamCode: "KT",
      request: { emailAddress: "otonly@example.org", memberRef: "OT-ONLY", bounceType: "Hard" },
      appliedAt: new Date("2026-08-23T00:00:00.000Z"),
    });

    expect(result.kind).toBe("supporterNotFound");
    expect(writebacks[0]).toMatchObject({ tenantCode: "KT", resultingState: "supporter-not-found" });
  });
});
