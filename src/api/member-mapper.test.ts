import { describe, expect, it } from "vitest";
import { toSupporter } from "./member-mapper.js";
import type { MemberDoc } from "../db/models/index.js";

describe("toSupporter consent defaults", () => {
  it("defaults emailConsent to false when neither consent field is set", () => {
    const doc = { salesforceId: "003SUPPLIED_1", lastName: "Walker" } as unknown as MemberDoc;
    const supporter = toSupporter(doc);
    expect(supporter.emailConsent).toBe(false);
    expect(typeof supporter.emailConsent).toBe("boolean");
  });

  it("uses emailMarketingConsent when emailConsent is absent", () => {
    const doc = { salesforceId: "003SUPPLIED_2", lastName: "Walker", emailMarketingConsent: true } as unknown as MemberDoc;
    expect(toSupporter(doc).emailConsent).toBe(true);
  });
});
