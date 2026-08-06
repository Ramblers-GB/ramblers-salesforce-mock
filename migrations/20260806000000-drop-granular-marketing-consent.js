const GRANULAR_CONSENT_FIELDS = [
  "groupMarketingConsent",
  "areaMarketingConsent",
  "otherMarketingConsent",
];

const unsetSpec = Object.fromEntries(GRANULAR_CONSENT_FIELDS.map((field) => [field, ""]));
const existsFilter = { $or: GRANULAR_CONSENT_FIELDS.map((field) => ({ [field]: { $exists: true } })) };

export const up = async (db) => {
  await db.collection("members").updateMany(existsFilter, { $unset: unsetSpec });
  await db.collection("consentEvents").updateMany(existsFilter, { $unset: unsetSpec });
};

export const down = async () => {
  // The values were dropped from the wire contract, so there is nothing to restore.
};
