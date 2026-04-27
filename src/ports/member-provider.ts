import type {
  ConsentUpdateRequest,
  ConsentUpdateResponse,
  MemberListResponse,
} from "../domain/types.js";

export interface ListMembersOptions {
  groupCode: string;
  since?: Date;
  includeExpired?: boolean;
}

export interface ApplyConsentOptions {
  tenantCode: string;
  membershipNumber: string;
  request: ConsentUpdateRequest;
  appliedAt: Date;
}

export type ListMembersResult =
  | { kind: "ok"; response: MemberListResponse }
  | { kind: "groupNotFound" };

export type ApplyConsentResult =
  | { kind: "ok"; response: ConsentUpdateResponse }
  | { kind: "memberNotFound" };

export interface MemberProvider {
  listMembers(options: ListMembersOptions): Promise<ListMembersResult>;
  applyConsent(options: ApplyConsentOptions): Promise<ApplyConsentResult>;
}
