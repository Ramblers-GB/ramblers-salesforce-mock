import { Member, Tenant } from "../db/models/index.js";
import type { ParsedMember } from "./xlsx-parser.js";
import { logger } from "../logger.js";

export interface UpsertResult {
  upserted: number;
  updated: number;
  softRemoved: number;
  tenantCode: string;
}

export interface UpsertOptions {
  additive?: boolean;
}

function pairConsentWithDate(m: ParsedMember, fallback: Date): ParsedMember {
  return {
    ...m,
    ...(m.emailMarketingConsent && !m.emailPermissionLastUpdated
      ? { emailPermissionLastUpdated: fallback } : {}),
    ...(m.postDirectMarketing && !m.postPermissionLastUpdated
      ? { postPermissionLastUpdated: fallback } : {}),
    ...(m.telephoneDirectMarketing && !m.telephonePermissionLastUpdated
      ? { telephonePermissionLastUpdated: fallback } : {}),
  };
}

async function softRemoveMembersOutsideBatch(
  tenantCode: string,
  retainedSalesforceIds: ReadonlySet<string>,
  removedAt: Date,
): Promise<{ modifiedCount: number }> {
  return Member.updateMany(
    {
      tenantCode: tenantCode.toUpperCase(),
      salesforceId: { $nin: Array.from(retainedSalesforceIds) },
      removed: { $ne: true },
    },
    { $set: { removed: true, removalReason: "other", updatedAt: removedAt } },
  );
}

export async function upsertMembers(
  tenantCode: string,
  parsed: ReadonlyArray<ParsedMember>,
  options: UpsertOptions = {},
): Promise<UpsertResult> {
  const tenant = await Tenant.findOne({ code: tenantCode.toUpperCase() }).exec();
  if (!tenant) {
    throw new Error(`tenant ${tenantCode} not found; create it before ingesting`);
  }

  const now = new Date();
  const incomingIds = new Set(parsed.map((m) => m.salesforceId));

  let upserted = 0;
  let updated = 0;

  for (const raw of parsed) {
    const m = pairConsentWithDate(raw, now);
    const { salesforceId } = m;
    const setDoc = {
      ...m,
      tenantCode: tenantCode.toUpperCase(),
      updatedAt: now,
      removed: false,
    };
    const res = await Member.updateOne(
      { tenantCode: tenantCode.toUpperCase(), salesforceId },
      { $set: setDoc, $setOnInsert: { ingestedAt: now } },
      { upsert: true },
    );
    if (res.upsertedCount > 0) upserted += 1;
    else if (res.modifiedCount > 0) updated += 1;
  }

  const softRemoved = options.additive
    ? { modifiedCount: 0 }
    : await softRemoveMembersOutsideBatch(tenantCode, incomingIds, now);

  await Tenant.updateOne(
    { _id: tenant._id },
    { $set: { lastIngestAt: now, lastIngestCount: parsed.length } },
  );

  logger.info(
    {
      tenantCode,
      upserted,
      updated,
      softRemoved: softRemoved.modifiedCount,
      additive: options.additive === true,
    },
    "ingest complete",
  );

  return {
    upserted,
    updated,
    softRemoved: softRemoved.modifiedCount,
    tenantCode: tenantCode.toUpperCase(),
  };
}
