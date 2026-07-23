import type {
  BounceOptions,
  SupporterProvider,
  SupportersOptions,
  SupportersResult,
  SupporterUpdateResult,
  UnsubscribeOptions,
} from "@ramblers/sf-contract";
import { Member, Tenant, WritebackEvent } from "../db/models/index.js";
import { toSupporter } from "../api/member-mapper.js";

function supporterFilter(teamCode: string, memberRef: string, emailAddress: string): Record<string, unknown> {
  return {
    tenantCode: teamCode,
    removed: { $ne: true },
    email: { $regex: `^${emailAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    $or: [
      { memberRef },
      { salesforceId: memberRef },
      { membershipNumber: memberRef },
    ],
  };
}

export class MockMemberProvider implements SupporterProvider {
  async supporters({ teamCode }: SupportersOptions): Promise<SupportersResult> {
    const tenantCode = teamCode.toUpperCase();
    const tenant = await Tenant.findOne({ code: tenantCode }).exec();
    if (!tenant) {
      return { kind: "teamNotFound" };
    }

    const docs = await Member.find({ tenantCode, removed: { $ne: true } }).exec();
    return { kind: "ok", supporters: docs.map((doc) => toSupporter(doc)) };
  }

  async unsubscribe({ teamCode, request, appliedAt }: UnsubscribeOptions): Promise<SupporterUpdateResult> {
    const tenantCode = teamCode.toUpperCase();
    const supporter = await Member.findOne(
      supporterFilter(tenantCode, request.memberRef, request.emailAddress),
    ).exec();
    await WritebackEvent.create({
      tenantCode,
      kind: "unsubscribe",
      emailAddress: request.emailAddress,
      memberRef: request.memberRef,
      requestedAt: appliedAt,
      supporterMatched: Boolean(supporter),
      resultingState: supporter ? "recorded-no-scope-assumed" : "supporter-not-found",
    });
    return supporter ? { kind: "ok" } : { kind: "supporterNotFound" };
  }

  async bounce({ teamCode, request, appliedAt }: BounceOptions): Promise<SupporterUpdateResult> {
    const tenantCode = teamCode.toUpperCase();
    const supporter = await Member.findOne(
      supporterFilter(tenantCode, request.memberRef, request.emailAddress),
    ).exec();
    await WritebackEvent.create({
      tenantCode,
      kind: "bounce",
      emailAddress: request.emailAddress,
      memberRef: request.memberRef,
      bounceType: request.bounceType,
      requestedAt: appliedAt,
      supporterMatched: Boolean(supporter),
      resultingState: supporter ? "bounce-recorded" : "supporter-not-found",
    });
    return supporter ? { kind: "ok" } : { kind: "supporterNotFound" };
  }
}
