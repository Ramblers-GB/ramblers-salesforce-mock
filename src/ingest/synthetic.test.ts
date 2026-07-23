import { describe, expect, it } from "vitest";
import { generateSyntheticMembers } from "./synthetic.js";

describe("generateSyntheticMembers", () => {
  const baseOpts = {
    tenantCode: "TEST",
    tenantKind: "group" as const,
    groupName: "Test Group",
  };

  it("is deterministic across runs with the same seed", () => {
    const first = generateSyntheticMembers({ ...baseOpts, count: 5, seed: 42 });
    const second = generateSyntheticMembers({ ...baseOpts, count: 5, seed: 42 });
    expect(first.map((m) => m.salesforceId)).toEqual(
      second.map((m) => m.salesforceId),
    );
    expect(first.map((m) => m.email)).toEqual(second.map((m) => m.email));
  });

  it("honours startMembershipNumber so generated batches do not collide", () => {
    const first = generateSyntheticMembers({
      ...baseOpts,
      count: 3,
      seed: 7,
      startMembershipNumber: 3_000_000,
    });
    const second = generateSyntheticMembers({
      ...baseOpts,
      count: 3,
      seed: 7,
      startMembershipNumber: 4_000_000,
    });
    expect(first.map((m) => m.memberRef)).toEqual([
      "SUP-3000000",
      "SUP-3000001",
      "SUP-3000002",
    ]);
    expect(first.map((m) => m.membershipNumber)).toEqual([
      "3000000",
      "3000001",
      undefined,
    ]);
    expect(second.map((m) => m.memberRef)).toEqual([
      "SUP-4000000",
      "SUP-4000001",
      "SUP-4000002",
    ]);
    expect(second.map((m) => m.membershipNumber)).toEqual([
      "4000000",
      "4000001",
      undefined,
    ]);
    expect(new Set([...first, ...second].map((m) => m.memberRef)).size).toBe(6);
  });

  it("covers every published team status and non-member supporter", () => {
    const supporters = generateSyntheticMembers({ ...baseOpts, count: 4, seed: 11 });

    expect(supporters.map((member) => member.teamStatus)).toEqual([
      "Member",
      "Affiliated",
      "Volunteer",
      "Wellbeing Walker",
    ]);
    expect(supporters.slice(2).every((member) => member.membershipNumber === undefined)).toBe(true);
  });
});
