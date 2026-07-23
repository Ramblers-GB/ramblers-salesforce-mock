import { Schema, model } from "mongoose";
import type { HydratedDocument, Model } from "mongoose";

export type MemberTerm = "Annual" | "Life";
export type RemovalReason = "expired" | "transferred" | "deceased" | "other";

export interface GroupMembership {
  groupCode: string;
  primary: boolean;
  roles?: {
    walkLeader?: boolean;
    emailSender?: boolean;
    viewMembershipData?: boolean;
  };
}

export interface AreaMembership {
  areaCode: string;
  roles?: {
    emailSender?: boolean;
  };
}

export interface StoredVolunteerRole {
  roleName: string;
  startDate: Date;
  displayName?: string;
  walkLeaderStatus?: string;
  wellbeingWalksRole: boolean;
}

export interface MemberAttrs {
  tenantCode: string;

  salesforceId: string;
  memberRef?: string;
  contactId?: string;
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
  groupJoinedDate?: Date;
  memberType?: string;
  memberTerm?: MemberTerm;
  memberStatus?: string;
  membershipArrangement?: string;
  jointWith?: string;
  membershipExpiryDate?: Date;
  membershipEndDate?: Date;
  ramblersJoinedDate?: Date;

  areaName?: string;
  areaJoinedDate?: Date;

  groupMemberships?: GroupMembership[];
  areaMemberships?: AreaMembership[];

  volunteer?: boolean;
  teamStatus?: "Member" | "Affiliated" | "Volunteer" | "Wellbeing Walker";
  teamRelationshipFrom?: Date;
  wellbeingWalker?: boolean;
  walkLeader?: boolean;
  volunteerRoles?: StoredVolunteerRole[];
  affiliateMemberPrimaryGroup?: string;

  doNotEmail?: boolean;
  noWalkProgram?: boolean;
  noCampaigning?: boolean;
  noSurveys?: boolean;
  canEmailVolunteers?: boolean;
  canEmailMembers?: boolean;
  canEmailWellbeingWalkers?: boolean;
  canViewMemberData?: boolean;
  canViewMemberDate?: boolean;
  emailConsent?: boolean;
  postConsent?: boolean;
  phoneConsent?: boolean;
  emailConsentWellbeingWalks?: boolean;

  emailMarketingConsent: boolean;
  emailPermissionLastUpdated?: Date;
  postDirectMarketing?: boolean;
  postPermissionLastUpdated?: Date;
  telephoneDirectMarketing?: boolean;
  telephonePermissionLastUpdated?: Date;
  walkProgrammeOptOut?: boolean;

  groupMarketingConsent?: boolean;
  areaMarketingConsent?: boolean;
  otherMarketingConsent?: boolean;

  removed?: boolean;
  removalReason?: RemovalReason;

  ingestedAt: Date;
  updatedAt: Date;
}

const groupMembershipSubSchema = new Schema<GroupMembership>(
  {
    groupCode: { type: String, required: true, minlength: 4, maxlength: 4 },
    primary: { type: Boolean, required: true },
    roles: {
      type: new Schema(
        {
          walkLeader: { type: Boolean, required: false },
          emailSender: { type: Boolean, required: false },
          viewMembershipData: { type: Boolean, required: false },
        },
        { _id: false },
      ),
      required: false,
    },
  },
  { _id: false },
);

const areaMembershipSubSchema = new Schema<AreaMembership>(
  {
    areaCode: { type: String, required: true, minlength: 2 },
    roles: {
      type: new Schema(
        {
          emailSender: { type: Boolean, required: false },
        },
        { _id: false },
      ),
      required: false,
    },
  },
  { _id: false },
);

const volunteerRoleSubSchema = new Schema<StoredVolunteerRole>(
  {
    roleName: { type: String, required: true },
    startDate: { type: Date, required: true },
    displayName: { type: String, required: false },
    walkLeaderStatus: { type: String, required: false },
    wellbeingWalksRole: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const memberSchema = new Schema<MemberAttrs>(
  {
    tenantCode: { type: String, required: true, index: true },

    salesforceId: { type: String, required: true },
    memberRef: { type: String, required: false, index: true },
    contactId: { type: String, required: false, index: true },
    membershipNumber: { type: String, required: false, index: true },
    firstName: String,
    preferredName: String,
    initials: String,
    lastName: { type: String, required: true },
    title: String,

    email: String,
    mobileNumber: String,
    landlineTelephone: String,

    address1: String,
    address2: String,
    address3: String,
    town: String,
    county: String,
    country: String,
    postcode: String,

    groupName: String,
    groupCode: String,
    groupJoinedDate: Date,
    memberType: String,
    memberTerm: { type: String, enum: ["Annual", "Life"], required: false },
    memberStatus: String,
    membershipArrangement: String,
    jointWith: String,
    membershipExpiryDate: Date,
    membershipEndDate: Date,
    ramblersJoinedDate: Date,

    areaName: String,
    areaJoinedDate: Date,

    groupMemberships: { type: [groupMembershipSubSchema], default: undefined },
    areaMemberships: { type: [areaMembershipSubSchema], default: undefined },

    volunteer: Boolean,
    teamStatus: {
      type: String,
      enum: ["Member", "Affiliated", "Volunteer", "Wellbeing Walker"],
      required: false,
    },
    teamRelationshipFrom: Date,
    wellbeingWalker: Boolean,
    walkLeader: Boolean,
    volunteerRoles: { type: [volunteerRoleSubSchema], default: undefined },
    affiliateMemberPrimaryGroup: String,

    doNotEmail: Boolean,
    noWalkProgram: Boolean,
    noCampaigning: Boolean,
    noSurveys: Boolean,
    canEmailVolunteers: Boolean,
    canEmailMembers: Boolean,
    canEmailWellbeingWalkers: Boolean,
    canViewMemberData: Boolean,
    canViewMemberDate: Boolean,
    emailConsent: Boolean,
    postConsent: Boolean,
    phoneConsent: Boolean,
    emailConsentWellbeingWalks: Boolean,

    emailMarketingConsent: { type: Boolean, required: true },
    emailPermissionLastUpdated: Date,
    postDirectMarketing: Boolean,
    postPermissionLastUpdated: Date,
    telephoneDirectMarketing: Boolean,
    telephonePermissionLastUpdated: Date,
    walkProgrammeOptOut: Boolean,

    groupMarketingConsent: Boolean,
    areaMarketingConsent: Boolean,
    otherMarketingConsent: Boolean,

    removed: { type: Boolean, default: false },
    removalReason: { type: String, enum: ["expired", "transferred", "deceased", "other"], required: false },

    ingestedAt: { type: Date, required: true, default: () => new Date() },
    updatedAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "members", versionKey: false },
);

memberSchema.index({ tenantCode: 1, salesforceId: 1 }, { unique: true });
memberSchema.index({ tenantCode: 1, membershipNumber: 1 });
memberSchema.index({ tenantCode: 1, memberRef: 1 });
memberSchema.index({ tenantCode: 1, updatedAt: 1 });

export type MemberDoc = HydratedDocument<MemberAttrs>;
export type MemberModel = Model<MemberAttrs>;

export const Member: MemberModel = model<MemberAttrs>("Member", memberSchema);
