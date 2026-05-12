import { Schema, model } from "mongoose";
import type { HydratedDocument, Model } from "mongoose";
import type { RemovalReason } from "@ramblers/sf-contract";

export const SCENARIO_CHANGE_TYPES = ["removed", "amended", "added"] as const;
export type ScenarioChangeType = (typeof SCENARIO_CHANGE_TYPES)[number];

export const REMOVAL_REASONS = [
  "expired",
  "transferred",
  "deceased",
  "other",
] as const satisfies readonly RemovalReason[];

export interface ScenarioChangeSummary {
  membershipNumber: string;
  salesforceId: string;
  changeType: ScenarioChangeType;
  fields?: string[];
}

export interface ScenarioAttrs {
  tenantCode: string;
  appliedBy: string;
  appliedAt: Date;
  since: Date;
  nextSince: Date;
  seed: number;
  requestedRemoved: number;
  requestedAmended: number;
  requestedAdded: number;
  appliedRemoved: number;
  appliedAmended: number;
  appliedAdded: number;
  amendFields?: string[];
  removalReason?: RemovalReason;
  changes: ScenarioChangeSummary[];
  warnings: string[];
}

const changeSchema = new Schema<ScenarioChangeSummary>(
  {
    membershipNumber: { type: String, required: true },
    salesforceId: { type: String, required: true },
    changeType: { type: String, enum: SCENARIO_CHANGE_TYPES, required: true },
    fields: { type: [String], default: undefined },
  },
  { _id: false },
);

const scenarioSchema = new Schema<ScenarioAttrs>(
  {
    tenantCode: { type: String, required: true, index: true },
    appliedBy: { type: String, required: true },
    appliedAt: { type: Date, required: true, default: () => new Date() },
    since: { type: Date, required: true },
    nextSince: { type: Date, required: true },
    seed: { type: Number, required: true },
    requestedRemoved: { type: Number, required: true },
    requestedAmended: { type: Number, required: true },
    requestedAdded: { type: Number, required: true },
    appliedRemoved: { type: Number, required: true },
    appliedAmended: { type: Number, required: true },
    appliedAdded: { type: Number, required: true },
    amendFields: { type: [String], default: undefined },
    removalReason: { type: String, enum: REMOVAL_REASONS, required: false },
    changes: { type: [changeSchema], default: [] },
    warnings: { type: [String], default: [] },
  },
  { collection: "scenarios", versionKey: false },
);

scenarioSchema.index({ tenantCode: 1, appliedAt: -1 });

export type ScenarioDoc = HydratedDocument<ScenarioAttrs>;
export type ScenarioModel = Model<ScenarioAttrs>;

export const Scenario: ScenarioModel = model<ScenarioAttrs>("Scenario", scenarioSchema);
