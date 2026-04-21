import { Schema, model } from "mongoose";
import type { HydratedDocument, Model } from "mongoose";

export type TenantKind = "group" | "area";

export interface TenantAttrs {
  code: string;
  kind: TenantKind;
  name?: string;
  ownerOperator: string;
  createdAt: Date;
  lastIngestAt?: Date;
  lastIngestCount?: number;
}

const tenantSchema = new Schema<TenantAttrs>(
  {
    code: { type: String, required: true, trim: true },
    kind: { type: String, required: true, enum: ["group", "area"] },
    name: { type: String, required: false },
    ownerOperator: { type: String, required: true, lowercase: true, trim: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    lastIngestAt: { type: Date, required: false },
    lastIngestCount: { type: Number, required: false },
  },
  { collection: "tenants", versionKey: false },
);

tenantSchema.index({ code: 1 }, { unique: true });
tenantSchema.index({ ownerOperator: 1 });

export type TenantDoc = HydratedDocument<TenantAttrs>;
export type TenantModel = Model<TenantAttrs>;

export const Tenant: TenantModel = model<TenantAttrs>("Tenant", tenantSchema);
