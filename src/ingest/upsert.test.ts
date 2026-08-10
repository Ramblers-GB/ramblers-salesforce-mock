import { beforeEach, describe, expect, it, vi } from "vitest";

const memberUpdateOne = vi.fn();
const memberUpdateMany = vi.fn();
const tenantFindOne = vi.fn();
const tenantUpdateOne = vi.fn();

vi.mock("../db/models/index.js", () => ({
  Member: {
    updateOne: (...args: unknown[]) => memberUpdateOne(...args),
    updateMany: (...args: unknown[]) => memberUpdateMany(...args),
  },
  Tenant: {
    findOne: (...args: unknown[]) => tenantFindOne(...args),
    updateOne: (...args: unknown[]) => tenantUpdateOne(...args),
  },
}));

vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { upsertMembers } = await import("./upsert.js");

const supplied = [
  { salesforceId: "003KRV_143", memberRef: "KRV-143", lastName: "Lovelace" },
  { salesforceId: "003KRV_136", memberRef: "KRV-136", lastName: "Turing" },
] as never;

describe("tenant-scoped upsert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantFindOne.mockReturnValue({ exec: () => Promise.resolve({ _id: "tenant-1", code: "KT" }) });
    memberUpdateOne.mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 });
    memberUpdateMany.mockResolvedValue({ modifiedCount: 7 });
    tenantUpdateOne.mockResolvedValue({});
  });

  it("clears records outside the batch by default, so a reload replaces the dataset", async () => {
    const result = await upsertMembers("KT", supplied);

    expect(memberUpdateMany).toHaveBeenCalledTimes(1);
    const criteria = memberUpdateMany.mock.calls[0]![0] as Record<string, unknown>;
    expect(criteria["salesforceId"]).toEqual({ $nin: ["003KRV_143", "003KRV_136"] });
    expect(result.softRemoved).toEqual(7);
    expect(result.upserted).toEqual(2);
  });

  it("leaves records outside the batch alone when merging, so a tenant can hold several sets", async () => {
    const result = await upsertMembers("KT", supplied, { additive: true });

    expect(memberUpdateMany).not.toHaveBeenCalled();
    expect(result.softRemoved).toEqual(0);
    expect(result.upserted).toEqual(2);
  });

  it("writes every supplied record under the upper-cased tenant regardless of mode", async () => {
    await upsertMembers("kt", supplied, { additive: true });

    expect(memberUpdateOne).toHaveBeenCalledTimes(2);
    const firstCriteria = memberUpdateOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(firstCriteria["tenantCode"]).toEqual("KT");
    expect(firstCriteria["salesforceId"]).toEqual("003KRV_143");
  });
});
