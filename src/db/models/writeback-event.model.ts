import { Schema, model } from "mongoose";
import type { HydratedDocument, Model } from "mongoose";
import type { BounceType } from "@ramblers/sf-contract";

export type WritebackKind = "unsubscribe" | "bounce";

export interface WritebackEventAttrs {
  tenantCode: string;
  kind: WritebackKind;
  emailAddress: string;
  memberRef: string;
  bounceType?: BounceType;
  requestedAt: Date;
  supporterMatched: boolean;
  resultingState: "recorded-no-scope-assumed" | "bounce-recorded" | "supporter-not-found";
}

const writebackEventSchema = new Schema<WritebackEventAttrs>(
  {
    tenantCode: { type: String, required: true, index: true },
    kind: { type: String, enum: ["unsubscribe", "bounce"], required: true, index: true },
    emailAddress: { type: String, required: true, lowercase: true, trim: true },
    memberRef: { type: String, required: true, index: true },
    bounceType: { type: String, enum: ["Hard", "Soft"], required: false },
    requestedAt: { type: Date, required: true, index: true },
    supporterMatched: { type: Boolean, required: true },
    resultingState: {
      type: String,
      enum: ["recorded-no-scope-assumed", "bounce-recorded", "supporter-not-found"],
      required: true,
    },
  },
  { collection: "writebackEvents", versionKey: false },
);

writebackEventSchema.index({ tenantCode: 1, requestedAt: -1 });
writebackEventSchema.index({ tenantCode: 1, memberRef: 1, requestedAt: -1 });

export type WritebackEventDoc = HydratedDocument<WritebackEventAttrs>;
export type WritebackEventModel = Model<WritebackEventAttrs>;

export const WritebackEvent: WritebackEventModel = model<WritebackEventAttrs>(
  "WritebackEvent",
  writebackEventSchema,
);
