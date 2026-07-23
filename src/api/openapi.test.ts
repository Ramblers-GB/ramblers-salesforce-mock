import { describe, expect, it } from "vitest";
import { buildMockOpenApiDocument } from "./openapi.js";

describe("mock OpenAPI documentation", () => {
  it("preserves the published identity and adds mock navigation", () => {
    const document = buildMockOpenApiDocument("https://mock.example.test");
    const info = document["info"] as Record<string, unknown>;
    const contact = info["contact"] as Record<string, unknown>;

    expect(info["title"]).toBe("Ramblers Team Emails");
    expect(info["version"]).toBe("1.0.0");
    expect(info["description"]).toContain("Open the operator console");
    expect(info["description"]).toContain("Ramblers Team Emails 1.0.0 on SwaggerHub");
    expect(contact["name"]).toBe("Ramblers Salesforce Mock");
    expect(contact["url"]).toBe("https://github.com/nbarrett/ramblers-salesforce-mock");
  });
});
