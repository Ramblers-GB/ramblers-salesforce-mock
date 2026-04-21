import { Schema, model } from "mongoose";
import type { HydratedDocument, Model } from "mongoose";

export interface OperatorAttrs {
  username: string;
  passwordHash: string;
  isRoot: boolean;
  label?: string;
  createdAt: Date;
  lastLoginAt?: Date;
}

const operatorSchema = new Schema<OperatorAttrs>(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    isRoot: { type: Boolean, required: true, default: false },
    label: { type: String, required: false },
    createdAt: { type: Date, required: true, default: () => new Date() },
    lastLoginAt: { type: Date, required: false },
  },
  { collection: "operators", versionKey: false },
);

operatorSchema.index({ username: 1 }, { unique: true });

export type OperatorDoc = HydratedDocument<OperatorAttrs>;
export type OperatorModel = Model<OperatorAttrs>;

export const Operator: OperatorModel = model<OperatorAttrs>("Operator", operatorSchema);
