/**
 * Shared domain types. The Salesforce-facing record shapes here mirror
 * `schema/salesforce-api.schema.json` (which in turn mirrors nbarrett/ngx-ramblers#209).
 * CI enforces drift with scripts/check-schema-drift.ts.
 */

export type MemberTerm = "life" | "annual";
export type ChangeType = "added" | "updated" | "removed";
export type RemovalReason = "expired" | "transferred" | "deceased" | "other";
export type ConsentSource = "ngx-ramblers" | "mailman";

export interface GroupMembershipRoles {
  walkLeader?: boolean;
  emailSender?: boolean;
  viewMembershipData?: boolean;
}

export interface GroupMembership {
  groupCode: string;
  primary: boolean;
  roles?: GroupMembershipRoles;
}

export interface AreaMembershipRoles {
  emailSender?: boolean;
}

export interface AreaMembership {
  areaCode: string;
  roles?: AreaMembershipRoles;
}

/**
 * Single member record. All 36 Insight Hub fields plus granular consent.
 * Optional fields are omitted from responses rather than sent as null,
 * per #209 "Example: Member List Response".
 */
export interface SalesforceMember {
  salesforceId: string;
  membershipNumber?: string;
  firstName?: string;
  preferredName?: string;
  initials?: string;
  lastName: string;
  title?: string;

  email?: string;
  mobileNumber?: string;
  landlineTelephone?: string;

  address1?: string;
  address2?: string;
  address3?: string;
  town?: string;
  county?: string;
  country?: string;
  postcode?: string;

  groupName?: string;
  groupCode?: string;
  groupJoinedDate?: string;
  memberType?: string;
  memberTerm?: MemberTerm;
  memberStatus?: string;
  membershipType?: string;
  jointWith?: string;
  membershipExpiryDate?: string;
  ramblersJoinDate?: string;

  areaName?: string;
  areaJoinedDate?: string;

  groupMemberships?: GroupMembership[];
  areaMemberships?: AreaMembership[];

  volunteer?: boolean;
  affiliateMemberPrimaryGroup?: string;

  emailMarketingConsent: boolean;
  emailPermissionLastUpdated?: string;
  postDirectMarketing?: boolean;
  postPermissionLastUpdated?: string;
  telephoneDirectMarketing?: boolean;
  telephonePermissionLastUpdated?: string;
  walkProgrammeOptOut?: boolean;

  groupMarketingConsent?: boolean;
  areaMarketingConsent?: boolean;
  otherMarketingConsent?: boolean;
}

export interface MemberChange {
  member: SalesforceMember;
  changeType: ChangeType;
  changedAt: string;
  removalReason?: RemovalReason;
}

export interface MemberListResponse {
  groupCode: string;
  groupName: string;
  totalCount: number;
  since?: string;
  members: SalesforceMember[];
  changes?: MemberChange[];
}

export interface ConsentUpdateRequest {
  emailMarketingConsent?: boolean;
  groupMarketingConsent?: boolean;
  areaMarketingConsent?: boolean;
  otherMarketingConsent?: boolean;
  source: ConsentSource;
  timestamp: string;
  reason?: string;
}

export interface ConsentUpdateResponse {
  membershipNumber: string;
  emailMarketingConsent?: boolean;
  groupMarketingConsent?: boolean;
  areaMarketingConsent?: boolean;
  otherMarketingConsent?: boolean;
  updatedAt: string;
  success: boolean;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "GROUP_NOT_FOUND"
  | "MEMBER_NOT_FOUND"
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** Internal: a tenant is a `groupCode` (4 chars) or `areaCode` (2+ chars). */
export type TenantCode = string;

/** Internal: operator accounts own tenants and generate tokens for them. */
export interface OperatorRef {
  username: string;
}
