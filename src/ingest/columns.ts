/**
 * Insight Hub "Export All" column mapping — the 36 columns per the #209
 * field table. Column names match the actual Insight Hub header text; the
 * parser matches them case-insensitively with whitespace trimmed.
 *
 * Each entry declares:
 *   header  — the Insight Hub header cell text
 *   apiKey  — the matching SalesforceMember field name
 *   parse   — how to coerce the cell value for storage
 */

export type ParseKind =
  | "string"
  | "date"
  | "boolean"
  | "memberTerm"
  | "membershipType";

export interface ColumnDef {
  header: string;
  apiKey: string;
  parse: ParseKind;
}

export const INSIGHT_HUB_COLUMNS: readonly ColumnDef[] = [
  { header: "Group",                             apiKey: "groupName",                      parse: "string" },
  { header: "Mem No.",                           apiKey: "membershipNumber",               parse: "string" },
  { header: "Member Type",                       apiKey: "memberType",                     parse: "string" },
  { header: "Member Term",                       apiKey: "memberTerm",                     parse: "memberTerm" },
  { header: "Member Status",                     apiKey: "memberStatus",                   parse: "string" },
  { header: "Type",                              apiKey: "membershipType",                 parse: "string" },
  { header: "Joint With",                        apiKey: "jointWith",                      parse: "string" },
  { header: "Title",                             apiKey: "title",                          parse: "string" },
  { header: "Initials",                          apiKey: "initials",                       parse: "string" },
  { header: "Forenames",                         apiKey: "firstName",                      parse: "string" },
  { header: "Last Name",                         apiKey: "lastName",                       parse: "string" },
  { header: "Address1",                          apiKey: "address1",                       parse: "string" },
  { header: "Address2",                          apiKey: "address2",                       parse: "string" },
  { header: "Address3",                          apiKey: "address3",                       parse: "string" },
  { header: "Town",                              apiKey: "town",                           parse: "string" },
  { header: "County",                            apiKey: "county",                         parse: "string" },
  { header: "Country",                           apiKey: "country",                        parse: "string" },
  { header: "Postcode",                          apiKey: "postcode",                       parse: "string" },
  { header: "Email Address",                     apiKey: "email",                          parse: "string" },
  { header: "Landline Telephone",                apiKey: "landlineTelephone",              parse: "string" },
  { header: "Mobile Telephone",                  apiKey: "mobileNumber",                   parse: "string" },
  { header: "Expiry date",                       apiKey: "membershipExpiryDate",           parse: "date" },
  { header: "Ramblers Join Date",                apiKey: "ramblersJoinDate",               parse: "date" },
  { header: "Area",                              apiKey: "areaName",                       parse: "string" },
  { header: "Area Joined Date",                  apiKey: "areaJoinedDate",                 parse: "date" },
  { header: "Group Code",                        apiKey: "groupCode",                      parse: "string" },
  { header: "Group Joined Date",                 apiKey: "groupJoinedDate",                parse: "date" },
  { header: "Volunteer",                         apiKey: "volunteer",                      parse: "boolean" },
  { header: "Email Marketing Consent",           apiKey: "emailMarketingConsent",          parse: "boolean" },
  { header: "Email Permission Last Updated",     apiKey: "emailPermissionLastUpdated",     parse: "date" },
  { header: "Post Direct Marketing",             apiKey: "postDirectMarketing",            parse: "boolean" },
  { header: "Post Permission Last Updated",      apiKey: "postPermissionLastUpdated",      parse: "date" },
  { header: "Telephone Direct Marketing",        apiKey: "telephoneDirectMarketing",       parse: "boolean" },
  { header: "Telephone Permission Last Updated", apiKey: "telephonePermissionLastUpdated", parse: "date" },
  { header: "Walk Programme Opt-Out",            apiKey: "walkProgrammeOptOut",            parse: "boolean" },
  { header: "Affiliate Member Primary Group",    apiKey: "affiliateMemberPrimaryGroup",    parse: "string" },
] as const;

/** Normalise a header cell for tolerant matching (trim, lowercase, collapse spaces). */
export function normaliseHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

const HEADER_LOOKUP: Record<string, ColumnDef> = Object.fromEntries(
  INSIGHT_HUB_COLUMNS.map((c) => [normaliseHeader(c.header), c]),
);

export function findColumn(headerText: string): ColumnDef | undefined {
  return HEADER_LOOKUP[normaliseHeader(headerText)];
}
