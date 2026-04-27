/**
 * Member model. Mirrors SalesforceMember from the #209 schema, with the
 * addition of a `tenantCode` discriminator enforcing per-tenant isolation.
 * Every read path must filter by tenantCode.
 */
import { Schema, model } from "mongoose";
import type { HydratedDocument, Model } from "mongoose";
import type {
  AreaMembership,
  GroupMembership,
  MemberTerm,
  RemovalReason,
} from "@ramblers/sf-contract";

export interface MemberAttrs {
  tenantCode: string;

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
  groupJoinedDate?: Date;
  memberType?: string;
  memberTerm?: MemberTerm;
  memberStatus?: string;
  membershipType?: string;
  jointWith?: string;
  membershipExpiryDate?: Date;
  ramblersJoinDate?: Date;

  areaName?: string;
  areaJoinedDate?: Date;

  groupMemberships?: GroupMembership[];
  areaMemberships?: AreaMembership[];

  volunteer?: boolean;
  affiliateMemberPrimaryGroup?: string;

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

  /** Tombstone flag for incremental sync removals. */
  removed?: boolean;
  removalReason?: RemovalReason;

  /** Bookkeeping. */
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

const memberSchema = new Schema<MemberAttrs>(
  {
    tenantCode: { type: String, required: true, index: true },

    salesforceId: { type: String, required: true },
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
    memberTerm: { type: String, enum: ["life", "annual"], required: false },
    memberStatus: String,
    membershipType: String,
    jointWith: String,
    membershipExpiryDate: Date,
    ramblersJoinDate: Date,

    areaName: String,
    areaJoinedDate: Date,

    groupMemberships: { type: [groupMembershipSubSchema], default: undefined },
    areaMemberships: { type: [areaMembershipSubSchema], default: undefined },

    volunteer: Boolean,
    affiliateMemberPrimaryGroup: String,

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
memberSchema.index({ tenantCode: 1, updatedAt: 1 });

export type MemberDoc = HydratedDocument<MemberAttrs>;
export type MemberModel = Model<MemberAttrs>;

export const Member: MemberModel = model<MemberAttrs>("Member", memberSchema);
