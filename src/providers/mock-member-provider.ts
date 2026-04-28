import { ConsentEvent, Member, Tenant } from "../db/models/index.js";
import type { MemberDoc } from "../db/models/index.js";
import { toSalesforceMember } from "../api/member-mapper.js";
import type {
  ConsentUpdateResponse,
  MemberChange,
  MemberListResponse,
} from "@ramblers/sf-contract";
import type {
  ApplyConsentOptions,
  ApplyConsentResult,
  ListMembersOptions,
  ListMembersResult,
  MemberProvider,
} from "@ramblers/sf-contract";

export class MockMemberProvider implements MemberProvider {
  async listMembers({
    groupCode,
    since,
    includeExpired,
  }: ListMembersOptions): Promise<ListMembersResult> {
    const tenantCode = groupCode.toUpperCase();
    const tenant = await Tenant.findOne({ code: tenantCode }).exec();
    if (!tenant) {
      return { kind: "groupNotFound" };
    }

    const memberFilter: Record<string, unknown> = { tenantCode };
    if (!includeExpired) {
      memberFilter["$or"] = [
        { membershipExpiryDate: { $exists: false } },
        { membershipExpiryDate: { $gte: new Date() } },
      ];
    }
    if (!since) {
      memberFilter["removed"] = { $ne: true };
    }

    const docs = await Member.find(memberFilter).exec();
    const members = docs
      .filter((d: MemberDoc) => !d.removed)
      .map((d) => toSalesforceMember(d));

    const response: MemberListResponse = {
      groupCode: tenantCode,
      groupName: tenant.name ?? tenant.code,
      totalCount: members.length,
      members,
    };

    if (since) {
      const changed = docs.filter((d) => d.updatedAt >= since);
      const changes: MemberChange[] = changed.map((d) => {
        if (d.removed) {
          const change: MemberChange = {
            member: toSalesforceMember(d),
            changeType: "removed",
            changedAt: d.updatedAt.toISOString(),
          };
          if (d.removalReason) change.removalReason = d.removalReason;
          return change;
        }
        const isNew = d.ingestedAt >= since;
        return {
          member: toSalesforceMember(d),
          changeType: isNew ? "added" : "updated",
          changedAt: d.updatedAt.toISOString(),
        };
      });
      response.since = since.toISOString();
      response.changes = changes;
    }

    return { kind: "ok", response };
  }

  async applyConsent({
    tenantCode,
    membershipNumber,
    request,
    appliedAt,
  }: ApplyConsentOptions): Promise<ApplyConsentResult> {
    const member = await Member.findOne({
      tenantCode,
      membershipNumber,
    }).exec();
    if (!member) {
      return { kind: "memberNotFound" };
    }

    const updates: Partial<
      Pick<
        typeof member,
        | "emailMarketingConsent"
        | "groupMarketingConsent"
        | "areaMarketingConsent"
        | "otherMarketingConsent"
        | "emailPermissionLastUpdated"
        | "updatedAt"
      >
    > = { updatedAt: appliedAt };

    if (request.emailMarketingConsent !== undefined) {
      updates.emailMarketingConsent = request.emailMarketingConsent;
      updates.emailPermissionLastUpdated = appliedAt;
    }
    if (request.groupMarketingConsent !== undefined) {
      updates.groupMarketingConsent = request.groupMarketingConsent;
    }
    if (request.areaMarketingConsent !== undefined) {
      updates.areaMarketingConsent = request.areaMarketingConsent;
    }
    if (request.otherMarketingConsent !== undefined) {
      updates.otherMarketingConsent = request.otherMarketingConsent;
    }

    Object.assign(member, updates);
    await member.save();

    const eventDoc = {
      tenantCode,
      membershipNumber,
      source: request.source,
      submittedAt: new Date(request.timestamp),
      appliedAt,
      ...(request.reason !== undefined ? { reason: request.reason } : {}),
      ...(request.emailMarketingConsent !== undefined
        ? { emailMarketingConsent: request.emailMarketingConsent }
        : {}),
      ...(request.groupMarketingConsent !== undefined
        ? { groupMarketingConsent: request.groupMarketingConsent }
        : {}),
      ...(request.areaMarketingConsent !== undefined
        ? { areaMarketingConsent: request.areaMarketingConsent }
        : {}),
      ...(request.otherMarketingConsent !== undefined
        ? { otherMarketingConsent: request.otherMarketingConsent }
        : {}),
    };
    await ConsentEvent.create(eventDoc);

    const response: ConsentUpdateResponse = {
      membershipNumber,
      updatedAt: appliedAt.toISOString(),
      success: true,
    };
    if (member.emailMarketingConsent !== undefined) {
      response.emailMarketingConsent = member.emailMarketingConsent;
    }
    if (member.groupMarketingConsent !== undefined) {
      response.groupMarketingConsent = member.groupMarketingConsent;
    }
    if (member.areaMarketingConsent !== undefined) {
      response.areaMarketingConsent = member.areaMarketingConsent;
    }
    if (member.otherMarketingConsent !== undefined) {
      response.otherMarketingConsent = member.otherMarketingConsent;
    }

    return { kind: "ok", response };
  }
}
