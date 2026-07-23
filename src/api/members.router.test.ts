import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BounceOptions,
  Supporter,
  SupporterProvider,
  SupportersOptions,
  SupportersResult,
  SupporterUpdateResult,
  UnsubscribeOptions,
} from "@ramblers/sf-contract";
import { createApiRouter } from "./members.router.js";
import { authenticateTeam } from "../auth/bearer-auth.js";

vi.mock("../auth/bearer-auth.js", () => ({
  authenticateTeam: vi.fn(),
}));

const supporter: Supporter = {
  membershipNo: "1234567",
  memberRef: "SUP-1234567",
  contactId: "003TEST",
  title: "Mx",
  firstName: "Alex",
  lastName: "Walker",
  email: "alex@example.org",
  doNotEmail: false,
  landline: null,
  mobile: null,
  friendlyName: "Alex",
  membershipStatus: "Active",
  memberType: "Individual Membership",
  membershipJoinDate: "2024-03-01",
  membershipExpiry: "2027-04-01",
  membershipEndDate: null,
  teamStatus: "Member",
  teamRelationshipFrom: "2024-03-01",
  wellbeingWalker: false,
  walkLeader: false,
  volunteerRoles: [],
  noWalkProgram: false,
  noCampaigning: false,
  noSurveys: false,
  canEmailVolunteers: false,
  canEmailMembers: true,
  canEmailWellbeingWalkers: false,
  canViewMemberData: true,
  canViewMemberDate: true,
  emailConsent: true,
  emailConsentLastUpdated: "2024-03-01",
  postConsent: true,
  postConsentLastUpdated: "2024-03-01",
  phoneConsent: false,
  phoneConsentLastUpdated: null,
  emailConsentWellbeingWalks: false,
};

class TestProvider implements SupporterProvider {
  supportersResult: SupportersResult = { kind: "ok", supporters: [supporter] };
  updateResult: SupporterUpdateResult = { kind: "ok" };

  async supporters(_options: SupportersOptions): Promise<SupportersResult> {
    return this.supportersResult;
  }

  async unsubscribe(_options: UnsubscribeOptions): Promise<SupporterUpdateResult> {
    return this.updateResult;
  }

  async bounce(_options: BounceOptions): Promise<SupporterUpdateResult> {
    return this.updateResult;
  }
}

function application(provider: SupporterProvider): express.Express {
  const app = express();
  app.use(express.json());
  app.use(createApiRouter(provider));
  return app;
}

describe("Ramblers Team Emails routes", () => {
  const provider = new TestProvider();

  beforeEach(() => {
    provider.supportersResult = { kind: "ok", supporters: [supporter] };
    provider.updateResult = { kind: "ok" };
    vi.mocked(authenticateTeam).mockResolvedValue({
      kind: "ok",
      teamCode: "KT50",
      token: {} as never,
    });
  });

  it("returns supporters for an authorised team", async () => {
    const response = await request(application(provider))
      .get("/get_supporters?api_key=valid&team_code=KT50")
      .expect(200);

    expect(response.body).toEqual([supporter]);
  });

  it("rejects an incorrect API key and team combination", async () => {
    vi.mocked(authenticateTeam).mockResolvedValue({ kind: "unauthorised" });

    const response = await request(application(provider))
      .get("/get_supporters?api_key=wrong&team_code=KT50")
      .expect(401);

    expect(response.body).toEqual({
      errorType: "Unauthorised",
      errorDescription: "Unauthorised api_key and team_code combination",
    });
  });

  it("rejects missing credentials", async () => {
    const response = await request(application(provider)).get("/get_supporters").expect(400);

    expect(response.body.errorType).toBe("Bad request");
  });

  it("records a valid unsubscribe request", async () => {
    const response = await request(application(provider))
      .post("/unsubscribe?api_key=valid&team_code=KT50")
      .send({ emailAddress: "alex@example.org", memberRef: "SUP-1234567" })
      .expect(200);

    expect(response.body).toEqual({ responseText: "Update processed" });
  });

  it("records hard and soft bounce requests", async () => {
    for (const bounceType of ["Hard", "Soft"]) {
      const response = await request(application(provider))
        .post("/bounced_email?api_key=valid&team_code=KT50")
        .send({ emailAddress: "alex@example.org", memberRef: "SUP-1234567", bounceType })
        .expect(200);

      expect(response.body).toEqual({ responseText: "Bounce logged" });
    }
  });

  it("returns the published not-found response for an unknown supporter", async () => {
    provider.updateResult = { kind: "supporterNotFound" };

    const response = await request(application(provider))
      .post("/unsubscribe?api_key=valid&team_code=KT50")
      .send({ emailAddress: "unknown@example.org", memberRef: "missing" })
      .expect(404);

    expect(response.body.errorType).toBe("Email not recognised for this group");
  });

  it("does not expose the superseded routes", async () => {
    await request(application(provider)).get("/api/groups/KT50/members").expect(404);
    await request(application(provider)).post("/api/members/1234567/consent").expect(404);
  });
});
