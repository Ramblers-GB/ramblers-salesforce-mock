import { Schema, model } from "mongoose";
import type { HydratedDocument, Model } from "mongoose";

export interface TokenAttrs {
  tokenHash: string;
  tokenPrefix: string;
  tenantCode: string;
  ownerOperator: string;
  label: string;
  createdAt: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
}

const tokenSchema = new Schema<TokenAttrs>(
  {
    tokenHash: { type: String, required: true, unique: true },
    tokenPrefix: { type: String, required: true },
    tenantCode: { type: String, required: true },
    ownerOperator: { type: String, required: true, lowercase: true, trim: true },
    label: { type: String, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    lastUsedAt: { type: Date, required: false },
    revokedAt: { type: Date, required: false },
  },
  { collection: "tokens", versionKey: false },
);

tokenSchema.index({ tokenHash: 1 }, { unique: true });
tokenSchema.index({ tenantCode: 1 });
tokenSchema.index({ ownerOperator: 1 });

export type TokenDoc = HydratedDocument<TokenAttrs>;
export type TokenModel = Model<TokenAttrs>;

export const ApiToken: TokenModel = model<TokenAttrs>("ApiToken", tokenSchema);
