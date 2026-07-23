import type {
  MemberType,
  MembershipStatus,
  Supporter,
  TeamStatus,
  VolunteerRole,
} from "@ramblers/sf-contract";
import type { MemberDoc } from "../db/models/index.js";

const membershipStatuses: MembershipStatus[] = [
  "Active",
  "Payment pending",
  "Suspended",
  "Lapsed",
  "Inactive",
  "Resigned",
];

const memberTypes: MemberType[] = [
  "Corporate Membership",
  "Individual Life Membership",
  "Individual Membership",
  "Joint Life Membership",
  "Joint Membership",
  "Membership",
];

function dateOnly(value: Date | undefined): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function membershipStatus(value: string | undefined): MembershipStatus | null {
  return membershipStatuses.find((candidate) => candidate === value) ?? null;
}

function memberType(value: string | undefined): MemberType | null {
  return memberTypes.find((candidate) => candidate === value) ?? null;
}

function teamStatus(doc: MemberDoc): TeamStatus {
  if (doc.teamStatus) {
    return doc.teamStatus;
  } else if (doc.affiliateMemberPrimaryGroup) {
    return "Affiliated";
  } else if (doc.volunteer) {
    return "Volunteer";
  } else {
    return "Member";
  }
}

function volunteerRoles(doc: MemberDoc): VolunteerRole[] {
  return (doc.volunteerRoles ?? []).map((role) => ({
    roleName: role.roleName,
    startDate: dateOnly(role.startDate) ?? "1970-01-01",
    displayName: role.displayName ?? null,
    walkLeaderStatus: role.walkLeaderStatus ?? null,
    wellbeingWalksRole: role.wellbeingWalksRole,
  }));
}

export function toSupporter(doc: MemberDoc): Supporter {
  const primaryRoles = doc.groupMemberships?.find((membership) => membership.primary)?.roles;
  const firstName = doc.firstName ?? null;
  const friendlyName = doc.preferredName ?? firstName ?? doc.lastName;
  return {
    membershipNo: doc.membershipNumber ?? null,
    memberRef: doc.memberRef ?? doc.salesforceId,
    contactId: doc.contactId ?? doc.salesforceId,
    title: doc.title ?? null,
    firstName,
    lastName: doc.lastName,
    email: doc.email ?? null,
    doNotEmail: doc.doNotEmail ?? false,
    landline: doc.landlineTelephone ?? null,
    mobile: doc.mobileNumber ?? null,
    friendlyName,
    membershipStatus: membershipStatus(doc.memberStatus),
    memberType: memberType(doc.memberType ?? doc.membershipArrangement),
    membershipJoinDate: dateOnly(doc.ramblersJoinedDate),
    membershipExpiry: dateOnly(doc.membershipExpiryDate),
    membershipEndDate: dateOnly(doc.membershipEndDate),
    teamStatus: teamStatus(doc),
    teamRelationshipFrom: dateOnly(doc.teamRelationshipFrom ?? doc.groupJoinedDate),
    wellbeingWalker: doc.wellbeingWalker ?? false,
    walkLeader: doc.walkLeader ?? primaryRoles?.walkLeader ?? false,
    volunteerRoles: volunteerRoles(doc),
    noWalkProgram: doc.noWalkProgram ?? doc.walkProgrammeOptOut ?? false,
    noCampaigning: doc.noCampaigning ?? false,
    noSurveys: doc.noSurveys ?? false,
    canEmailVolunteers: doc.canEmailVolunteers ?? false,
    canEmailMembers: doc.canEmailMembers ?? primaryRoles?.emailSender ?? false,
    canEmailWellbeingWalkers: doc.canEmailWellbeingWalkers ?? false,
    canViewMemberData: doc.canViewMemberData ?? primaryRoles?.viewMembershipData ?? false,
    canViewMemberDate: doc.canViewMemberDate ?? primaryRoles?.viewMembershipData ?? false,
    emailConsent: doc.emailConsent ?? doc.emailMarketingConsent,
    emailConsentLastUpdated: dateOnly(doc.emailPermissionLastUpdated),
    postConsent: doc.postConsent ?? doc.postDirectMarketing ?? false,
    postConsentLastUpdated: dateOnly(doc.postPermissionLastUpdated),
    phoneConsent: doc.phoneConsent ?? doc.telephoneDirectMarketing ?? false,
    phoneConsentLastUpdated: dateOnly(doc.telephonePermissionLastUpdated),
    emailConsentWellbeingWalks: doc.emailConsentWellbeingWalks ?? false,
  };
}

export const toSalesforceMember = toSupporter;
