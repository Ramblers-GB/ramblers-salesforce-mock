import { Schema, model } from "mongoose";
import type { HydratedDocument, Model } from "mongoose";
import type { ConsentSource } from "../../domain/types.js";

export interface ConsentEventAttrs {
  tenantCode: string;
  membershipNumber: string;
  source: ConsentSource;
  reason?: string;
  emailMarketingConsent?: boolean;
  groupMarketingConsent?: boolean;
  areaMarketingConsent?: boolean;
  otherMarketingConsent?: boolean;
  submittedAt: Date;
  appliedAt: Date;
}

const consentEventSchema = new Schema<ConsentEventAttrs>(
  {
    tenantCode: { type: String, required: true, index: true },
    membershipNumber: { type: String, required: true, index: true },
    source: { type: String, enum: ["ngx-ramblers", "mailman"], required: true },
    reason: { type: String, required: false },
    emailMarketingConsent: Boolean,
    groupMarketingConsent: Boolean,
    areaMarketingConsent: Boolean,
    otherMarketingConsent: Boolean,
    submittedAt: { type: Date, required: true },
    appliedAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "consentEvents", versionKey: false },
);

consentEventSchema.index({ tenantCode: 1, membershipNumber: 1, appliedAt: -1 });

export type ConsentEventDoc = HydratedDocument<ConsentEventAttrs>;
export type ConsentEventModel = Model<ConsentEventAttrs>;

export const ConsentEvent: ConsentEventModel = model<ConsentEventAttrs>(
  "ConsentEvent",
  consentEventSchema,
);
