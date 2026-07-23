import { Member, Scenario, Tenant } from "../db/models/index.js";
import type {
  MemberDoc,
  RemovalReason,
  ScenarioChangeType,
  TenantDoc,
} from "../db/models/index.js";
import { generateSyntheticMembers } from "../ingest/synthetic.js";
import type { ParsedMember } from "../ingest/xlsx-parser.js";
import { logger } from "../logger.js";

export const SCENARIO_AMEND_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "postcode",
  "mobileNumber",
  "landlineTelephone",
  "membershipExpiryDate",
  "emailMarketingConsent",
  "groupMarketingConsent",
] as const;

export type ScenarioAmendField = (typeof SCENARIO_AMEND_FIELDS)[number];

export interface ScenarioRequest {
  since: Date;
  removed: number;
  added: number;
  amended: number;
  amendFields?: ScenarioAmendField[];
  removalReason?: RemovalReason;
  seed?: number;
}

export interface ScenarioMemberSummary {
  membershipNumber: string;
  salesforceId: string;
  changeType: ScenarioChangeType;
  fields?: ScenarioAmendField[];
}

export interface ScenarioResult {
  tenantCode: string;
  since: string;
  nextSince: string;
  appliedAt: string;
  seed: number;
  counts: {
    removed: number;
    amended: number;
    added: number;
    requestedRemoved: number;
    requestedAmended: number;
    requestedAdded: number;
  };
  changes: ScenarioMemberSummary[];
  warnings: string[];
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

function nextMembershipNumberStart(existing: ReadonlyArray<MemberDoc>): number {
  let max = 3_000_000 - 1;
  for (const doc of existing) {
    if (!doc.membershipNumber) continue;
    const parsed = Number(doc.membershipNumber);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return max + 1;
}

function setOptional<K extends keyof MemberDoc>(
  member: MemberDoc,
  key: K,
  value: MemberDoc[K] | undefined,
): void {
  if (value === undefined) {
    member.set(key as string, undefined);
  } else {
    member[key] = value;
  }
}

function applyAmendField(
  member: MemberDoc,
  source: ParsedMember,
  field: ScenarioAmendField,
): void {
  switch (field) {
    case "firstName":
      setOptional(member, "firstName", source.firstName);
      break;
    case "lastName":
      member.lastName = source.lastName;
      break;
    case "email":
      setOptional(member, "email", source.email);
      break;
    case "postcode":
      setOptional(member, "postcode", source.postcode);
      break;
    case "mobileNumber":
      setOptional(member, "mobileNumber", source.mobileNumber);
      break;
    case "landlineTelephone":
      setOptional(member, "landlineTelephone", source.landlineTelephone);
      break;
    case "membershipExpiryDate":
      setOptional(member, "membershipExpiryDate", source.membershipExpiryDate);
      break;
    case "emailMarketingConsent":
      member.emailMarketingConsent = !member.emailMarketingConsent;
      member.emailPermissionLastUpdated = source.emailPermissionLastUpdated ?? new Date();
      break;
    case "groupMarketingConsent":
      member.groupMarketingConsent = !member.groupMarketingConsent;
      break;
  }
}

export async function applyScenario(
  tenant: TenantDoc,
  request: ScenarioRequest,
  appliedBy: string,
): Promise<ScenarioResult> {
  if (request.amended > 0 && (!request.amendFields || request.amendFields.length === 0)) {
    throw Object.assign(
      new Error("amendFields is required and must include at least one field when amended > 0"),
      { status: 400 },
    );
  }

  const seed = request.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const rng = mulberry32(seed);
  const since = request.since;
  const sinceMs = since.getTime();
  if (!Number.isFinite(sinceMs)) {
    throw Object.assign(new Error("since must be a valid ISO timestamp"), { status: 400 });
  }

  const appliedAt = new Date(Math.max(Date.now(), sinceMs + 1));
  const warnings: string[] = [];

  const existing = await Member.find({
    tenantCode: tenant.code,
    removed: { $ne: true },
  })
    .sort({ salesforceId: 1 })
    .exec();

  const shuffled = shuffle(rng, existing);

  const wantedRemoved = Math.min(request.removed, shuffled.length);
  if (wantedRemoved < request.removed) {
    warnings.push(
      `requested ${request.removed} removed, only ${wantedRemoved} active members available`,
    );
  }
  const toRemove = shuffled.slice(0, wantedRemoved);
  const remainingAfterRemove = shuffled.slice(wantedRemoved);

  const wantedAmended = Math.min(request.amended, remainingAfterRemove.length);
  if (wantedAmended < request.amended) {
    warnings.push(
      `requested ${request.amended} amended, only ${wantedAmended} members remain after removals`,
    );
  }
  const toAmend = remainingAfterRemove.slice(0, wantedAmended);

  const removalReason: RemovalReason = request.removalReason ?? "other";
  const changes: ScenarioMemberSummary[] = [];

  for (const doc of toRemove) {
    doc.removed = true;
    doc.removalReason = removalReason;
    doc.updatedAt = appliedAt;
    await doc.save();
    changes.push({
      membershipNumber: doc.membershipNumber ?? "",
      salesforceId: doc.salesforceId,
      changeType: "removed",
    });
  }

  if (toAmend.length > 0) {
    const amendFields = request.amendFields ?? [];
    const amendSource = generateSyntheticMembers({
      count: toAmend.length,
      tenantCode: tenant.code,
      tenantKind: tenant.kind,
      ...(tenant.name !== undefined ? { groupName: tenant.name } : {}),
      seed: seed ^ 0xa11ce,
      startMembershipNumber: 9_000_000,
    });
    for (let i = 0; i < toAmend.length; i += 1) {
      const doc = toAmend[i]!;
      const source = amendSource[i]!;
      for (const field of amendFields) {
        applyAmendField(doc, source, field);
      }
      doc.updatedAt = appliedAt;
      await doc.save();
      changes.push({
        membershipNumber: doc.membershipNumber ?? "",
        salesforceId: doc.salesforceId,
        changeType: "amended",
        fields: amendFields.slice(),
      });
    }
  }

  const wantedAdded = Math.max(0, request.added);
  if (wantedAdded > 0) {
    const allForTenant = await Member.find({ tenantCode: tenant.code })
      .select({ membershipNumber: 1 })
      .exec();
    const startMemNo = nextMembershipNumberStart(allForTenant);
    const newRows = generateSyntheticMembers({
      count: wantedAdded,
      tenantCode: tenant.code,
      tenantKind: tenant.kind,
      ...(tenant.name !== undefined ? { groupName: tenant.name } : {}),
      seed: seed ^ 0xadd,
      startMembershipNumber: startMemNo,
    });
    for (const row of newRows) {
      const doc = new Member({
        ...row,
        tenantCode: tenant.code,
        ingestedAt: appliedAt,
        updatedAt: appliedAt,
        removed: false,
      });
      await doc.save();
      changes.push({
        membershipNumber: doc.membershipNumber ?? "",
        salesforceId: doc.salesforceId,
        changeType: "added",
      });
    }
  }

  await Tenant.updateOne(
    { _id: tenant._id },
    { $set: { lastIngestAt: appliedAt } },
  );

  await Scenario.create({
    tenantCode: tenant.code,
    appliedBy,
    appliedAt,
    since,
    nextSince: appliedAt,
    seed,
    requestedRemoved: request.removed,
    requestedAmended: request.amended,
    requestedAdded: request.added,
    appliedRemoved: toRemove.length,
    appliedAmended: toAmend.length,
    appliedAdded: wantedAdded,
    ...(request.amendFields ? { amendFields: request.amendFields.slice() } : {}),
    ...(request.removalReason ? { removalReason: request.removalReason } : {}),
    changes,
    warnings,
  });

  logger.info(
    {
      tenantCode: tenant.code,
      seed,
      removed: toRemove.length,
      amended: toAmend.length,
      added: wantedAdded,
      since: since.toISOString(),
    },
    "scenario applied",
  );

  return {
    tenantCode: tenant.code,
    since: since.toISOString(),
    nextSince: appliedAt.toISOString(),
    appliedAt: appliedAt.toISOString(),
    seed,
    counts: {
      removed: toRemove.length,
      amended: toAmend.length,
      added: wantedAdded,
      requestedRemoved: request.removed,
      requestedAmended: request.amended,
      requestedAdded: request.added,
    },
    changes,
    warnings,
  };
}
