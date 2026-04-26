/**
 * Tenant-scoped upsert. Writes parsed members into the `members`
 * collection under the given tenantCode, replacing the prior dataset.
 *
 * Per #248: "Idempotent: re-uploading the same spreadsheet replaces the
 * existing dataset for that scope." We implement that by soft-deleting
 * (removed=true, removalReason=other, updatedAt=now) any existing docs
 * for the tenant whose salesforceId isn't in the new batch, then
 * upserting the new rows.
 */
import { Member, Tenant } from "../db/models/index.js";
import type { ParsedMember } from "./xlsxParser.js";
import { logger } from "../logger.js";

export interface UpsertResult {
  upserted: number;
  updated: number;
  softRemoved: number;
  tenantCode: string;
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

export async function upsertMembers(
  tenantCode: string,
  parsed: ReadonlyArray<ParsedMember>,
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
    // `ingestedAt` goes in $setOnInsert only so the first-seen timestamp is
    // preserved across re-ingests. Every other field is in $set. Having any
    // field in both operators is a MongoDB conflict and throws.
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

  // Soft-remove members no longer present in the upload.
  const softRemoved = await Member.updateMany(
    {
      tenantCode: tenantCode.toUpperCase(),
      salesforceId: { $nin: Array.from(incomingIds) },
      removed: { $ne: true },
    },
    { $set: { removed: true, removalReason: "other", updatedAt: now } },
  );

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
