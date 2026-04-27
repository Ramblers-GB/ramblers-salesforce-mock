/**
 * Mongo → wire shape mapper for SalesforceMember.
 *
 * #209 stipulates that optional fields which are empty or not applicable are
 * omitted from the response rather than sent as `null`. This mapper enforces
 * that rule; it also converts `Date` fields into ISO-8601 strings.
 */
import type { MemberDoc } from "../db/models/index.js";
import type { SalesforceMember } from "../domain/types.js";

function iso(date: Date | undefined): string | undefined {
  return date ? date.toISOString() : undefined;
}

function setIfDefined<K extends keyof SalesforceMember>(
  out: Partial<SalesforceMember>,
  key: K,
  value: SalesforceMember[K] | undefined,
): void {
  if (value !== undefined && value !== null && value !== "") {
    out[key] = value;
  }
}

export function toSalesforceMember(doc: MemberDoc): SalesforceMember {
  const out: Partial<SalesforceMember> = {
    salesforceId: doc.salesforceId,
    lastName: doc.lastName,
    emailMarketingConsent: doc.emailMarketingConsent,
  };

  setIfDefined(out, "membershipNumber", doc.membershipNumber);
  setIfDefined(out, "firstName", doc.firstName);
  setIfDefined(out, "preferredName", doc.preferredName);
  setIfDefined(out, "initials", doc.initials);
  setIfDefined(out, "title", doc.title);
  setIfDefined(out, "email", doc.email);
  setIfDefined(out, "mobileNumber", doc.mobileNumber);
  setIfDefined(out, "landlineTelephone", doc.landlineTelephone);
  setIfDefined(out, "address1", doc.address1);
  setIfDefined(out, "address2", doc.address2);
  setIfDefined(out, "address3", doc.address3);
  setIfDefined(out, "town", doc.town);
  setIfDefined(out, "county", doc.county);
  setIfDefined(out, "country", doc.country);
  setIfDefined(out, "postcode", doc.postcode);
  setIfDefined(out, "groupName", doc.groupName);
  setIfDefined(out, "groupCode", doc.groupCode);
  setIfDefined(out, "groupJoinedDate", iso(doc.groupJoinedDate));
  setIfDefined(out, "memberType", doc.memberType);
  setIfDefined(out, "memberTerm", doc.memberTerm);
  setIfDefined(out, "memberStatus", doc.memberStatus);
  setIfDefined(out, "membershipType", doc.membershipType);
  setIfDefined(out, "jointWith", doc.jointWith);
  setIfDefined(out, "membershipExpiryDate", iso(doc.membershipExpiryDate));
  setIfDefined(out, "ramblersJoinDate", iso(doc.ramblersJoinDate));
  setIfDefined(out, "areaName", doc.areaName);
  setIfDefined(out, "areaJoinedDate", iso(doc.areaJoinedDate));

  if (doc.groupMemberships && doc.groupMemberships.length > 0) {
    out.groupMemberships = doc.groupMemberships.map((gm) => ({
      groupCode: gm.groupCode,
      primary: gm.primary,
      ...(gm.roles ? { roles: { ...gm.roles } } : {}),
    }));
  }
  if (doc.areaMemberships && doc.areaMemberships.length > 0) {
    out.areaMemberships = doc.areaMemberships.map((am) => ({
      areaCode: am.areaCode,
      ...(am.roles ? { roles: { ...am.roles } } : {}),
    }));
  }

  setIfDefined(out, "volunteer", doc.volunteer);
  setIfDefined(out, "affiliateMemberPrimaryGroup", doc.affiliateMemberPrimaryGroup);
  setIfDefined(out, "emailPermissionLastUpdated", iso(doc.emailPermissionLastUpdated));
  setIfDefined(out, "postDirectMarketing", doc.postDirectMarketing);
  setIfDefined(out, "postPermissionLastUpdated", iso(doc.postPermissionLastUpdated));
  setIfDefined(out, "telephoneDirectMarketing", doc.telephoneDirectMarketing);
  setIfDefined(out, "telephonePermissionLastUpdated", iso(doc.telephonePermissionLastUpdated));
  setIfDefined(out, "walkProgrammeOptOut", doc.walkProgrammeOptOut);
  setIfDefined(out, "groupMarketingConsent", doc.groupMarketingConsent);
  setIfDefined(out, "areaMarketingConsent", doc.areaMarketingConsent);
  setIfDefined(out, "otherMarketingConsent", doc.otherMarketingConsent);

  return out as SalesforceMember;
}
