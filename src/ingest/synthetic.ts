/**
 * Synthetic Insight Hub member generator.
 *
 * Produces plausibly-shaped member rows for a given tenant (groupCode or
 * areaCode) — usable both as a deterministic dev fixture and as the source
 * for ngx-ramblers#18 (Brevo unsubscribe) test scenarios.
 *
 * The output is shaped like `ParsedMember` (from xlsxParser) so it can be
 * fed straight into upsertMembers without an xlsx round-trip — that
 * matters because granular consent flags (groupMarketingConsent,
 * areaMarketingConsent, otherMarketingConsent) aren't in the 36 Insight
 * Hub columns and would be lost going through xlsx.
 */
import { randomInt } from "node:crypto";
import type { ParsedMember } from "./xlsx-parser.js";

const FIRST_NAMES = [
  "Alice", "Amelia", "Aoife", "Beatrice", "Benjamin", "Bethany", "Callum",
  "Cara", "Catherine", "Charlie", "Charlotte", "Clara", "Connor", "Daniel",
  "Diana", "Edward", "Eleanor", "Eliza", "Emma", "Euan", "Eve", "Finn",
  "Florence", "Frank", "Freya", "Gareth", "George", "Grace", "Hamish",
  "Harriet", "Henry", "Hugh", "Imogen", "Iona", "Isaac", "Isla", "James",
  "Jessica", "Joseph", "Katherine", "Kieran", "Liam", "Lucy", "Maeve",
  "Martha", "Megan", "Niall", "Noah", "Olivia", "Owen", "Peter", "Phoebe",
  "Rachel", "Reuben", "Rhys", "Rosa", "Samuel", "Sian", "Sophie", "Tessa",
  "Theo", "Thomas", "Uma", "Vincent", "Wendy", "William", "Xavier",
  "Yvonne", "Zachary", "Zoe",
] as const;

const LAST_NAMES = [
  "Adams", "Ahmed", "Anderson", "Bailey", "Brooks", "Campbell", "Carter",
  "Clark", "Cooper", "Davies", "Doyle", "Edwards", "Evans", "Fletcher",
  "Foster", "Gibson", "Gray", "Green", "Hall", "Harris", "Hughes", "Hunter",
  "Irving", "Jackson", "Jenkins", "Jones", "Kelly", "Khan", "King",
  "Lewis", "Lloyd", "MacDonald", "Marshall", "Mitchell", "Morris",
  "Murphy", "Nicholls", "OConnor", "Owen", "Patel", "Phillips", "Price",
  "Quincey", "Reid", "Reynolds", "Roberts", "Robinson", "Rogers", "Singh",
  "Smith", "Stewart", "Sullivan", "Taylor", "Thomas", "Thompson", "Turner",
  "Unwin", "Vincent", "Walker", "Watson", "White", "Williams", "Wilson",
  "Wright", "Young",
] as const;

const STREETS = [
  "High Street", "Church Lane", "Mill Road", "Park Avenue", "Station Road",
  "The Green", "Oak Drive", "Mill Lane", "Castle Street", "King's Road",
  "Queen's Avenue", "Bridge Street", "Rectory Lane", "School Road",
  "Manor Way", "Vicarage Close",
] as const;

const REGIONS = {
  kent: {
    towns: [
      "Canterbury", "Faversham", "Margate", "Maidstone", "Ashford", "Dover",
      "Folkestone", "Ramsgate", "Whitstable", "Tunbridge Wells", "Sevenoaks",
      "Tonbridge", "Gravesend", "Dartford", "Rochester", "Sittingbourne",
      "Sandwich", "Deal", "Hythe", "Cranbrook",
    ],
    postcodeAreas: ["CT", "ME", "TN", "BR", "DA"],
  },
  staffordshire: {
    towns: [
      "Stoke-on-Trent", "Newcastle-under-Lyme", "Stafford", "Lichfield",
      "Burton upon Trent", "Tamworth", "Cannock", "Leek", "Stone", "Burslem",
      "Tunstall", "Cheadle", "Uttoxeter", "Rugeley", "Kidsgrove", "Hanley",
      "Eccleshall", "Penkridge", "Biddulph", "Audley",
    ],
    postcodeAreas: ["ST", "DE", "WS"],
  },
  newcastle: {
    towns: [
      "Newcastle upon Tyne", "Gateshead", "Sunderland", "North Shields",
      "South Shields", "Wallsend", "Whitley Bay", "Tynemouth", "Jarrow",
      "Cramlington", "Hexham", "Morpeth", "Blyth", "Ashington", "Durham",
      "Chester-le-Street", "Bishop Auckland", "Stanley", "Consett", "Prudhoe",
    ],
    postcodeAreas: ["NE", "SR", "DH"],
  },
  hampshire: {
    towns: [
      "Winchester", "Southampton", "Portsmouth", "Basingstoke", "Andover",
      "Eastleigh", "Romsey", "Alton", "Petersfield", "Fareham", "Gosport",
      "Havant", "Lymington", "New Milton", "Ringwood", "Aldershot",
      "Farnborough", "Fleet", "Hayling Island", "Bishop's Waltham",
    ],
    postcodeAreas: ["SO", "PO", "RG", "GU", "SP"],
  },
} as const;

const ALL_TOWNS = [
  ...REGIONS.kent.towns,
  ...REGIONS.staffordshire.towns,
  ...REGIONS.newcastle.towns,
  ...REGIONS.hampshire.towns,
] as const;
const ALL_POSTCODE_AREAS = [
  ...REGIONS.kent.postcodeAreas,
  ...REGIONS.staffordshire.postcodeAreas,
  ...REGIONS.newcastle.postcodeAreas,
  ...REGIONS.hampshire.postcodeAreas,
] as const;

export const REGION_KEYS = ["mixed", "kent", "staffordshire", "newcastle", "hampshire"] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

function townsFor(region: RegionKey): readonly string[] {
  if (region === "kent") return REGIONS.kent.towns;
  if (region === "staffordshire") return REGIONS.staffordshire.towns;
  if (region === "newcastle") return REGIONS.newcastle.towns;
  if (region === "hampshire") return REGIONS.hampshire.towns;
  return ALL_TOWNS;
}

function postcodeAreasFor(region: RegionKey): readonly string[] {
  if (region === "kent") return REGIONS.kent.postcodeAreas;
  if (region === "staffordshire") return REGIONS.staffordshire.postcodeAreas;
  if (region === "newcastle") return REGIONS.newcastle.postcodeAreas;
  if (region === "hampshire") return REGIONS.hampshire.postcodeAreas;
  return ALL_POSTCODE_AREAS;
}

const TITLES = ["Mr", "Mrs", "Miss", "Ms", "Dr"] as const;
const MEMBER_TERMS = ["annual", "life"] as const;
const MEMBER_STATUS = ["Active", "payment pending"] as const;
const MEMBERSHIP_TYPES = ["Individual", "Joint"] as const;

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Default consent distribution — see issue #2 spec defaults. */
export const DEFAULT_CONSENT_DISTRIBUTION: ConsentDistribution = {
  mode: "independent",
  emailMarketingConsent: 0.7,
  groupMarketingConsent: 0.6,
  areaMarketingConsent: 0.5,
  otherMarketingConsent: 0.3,
  postDirectMarketing: 0.4,
  telephoneDirectMarketing: 0.2,
};

export const DEFAULT_ROLE_PROPORTIONS: RoleProportions = {
  walkLeader: 0.08,
  emailSender: 0.05,
  viewMembershipData: 0.03,
};

export const DEFAULT_EMAIL_TEMPLATE = "{firstname}.{surname}{nn}@{domain}";
export const DEFAULT_EMAIL_DOMAIN = "ngx-ramblers.org.uk";

export const CONSENT_FLAGS = [
  "emailMarketingConsent",
  "groupMarketingConsent",
  "areaMarketingConsent",
  "otherMarketingConsent",
  "postDirectMarketing",
  "telephoneDirectMarketing",
] as const;

export type ConsentFlag = (typeof CONSENT_FLAGS)[number];

export interface ConsentDistributionIndependent {
  mode: "independent";
  emailMarketingConsent: number;
  groupMarketingConsent: number;
  areaMarketingConsent: number;
  otherMarketingConsent: number;
  postDirectMarketing: number;
  telephoneDirectMarketing: number;
}

export interface ConsentCombination {
  emailMarketingConsent: boolean;
  groupMarketingConsent: boolean;
  areaMarketingConsent: boolean;
  otherMarketingConsent: boolean;
  postDirectMarketing: boolean;
  telephoneDirectMarketing: boolean;
  /** Probability weight (0..100). All combinations in a joint dist must sum to 100. */
  weight: number;
}

export interface ConsentDistributionJoint {
  mode: "joint";
  combinations: ConsentCombination[];
}

export type ConsentDistribution =
  | ConsentDistributionIndependent
  | ConsentDistributionJoint;

export interface RoleProportions {
  walkLeader: number;
  emailSender: number;
  viewMembershipData: number;
}

export interface SyntheticOptions {
  count: number;
  tenantCode: string;
  tenantKind: "group" | "area";
  groupName?: string;
  seed?: number;
  emailTemplate?: string;
  emailDomain?: string;
  /** Local-part for the `{base}` placeholder in plus-addressing presets. */
  emailBase?: string;
  consentDistribution?: ConsentDistribution;
  roleProportions?: RoleProportions;
  /** Geographic pool for towns + postcode prefixes. Default: "mixed" (all regions combined). */
  region?: RegionKey;
}

/** Deterministic PRNG (mulberry32) so a seed + count produces stable output. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

function bernoulli(rng: () => number, p: number): boolean {
  return rng() < p;
}

function nnWidth(count: number): number {
  return Math.max(2, String(count).length);
}

function recentDate(rng: () => number, now: number): Date {
  const minMs = 365 * 24 * 3600 * 1000;
  const maxMs = 3 * minMs;
  return new Date(now - Math.floor(minMs + rng() * (maxMs - minMs)));
}

interface RenderContext {
  firstname: string;
  surname: string;
  nn: string;
  membershipNumber: string;
  groupCode: string;
  domain: string;
  base: string;
}

/**
 * Render an email template against placeholder values. Unrecognised
 * placeholders are left in place so validation will reject them.
 */
function renderEmailTemplate(template: string, ctx: RenderContext): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (key in ctx) return (ctx as unknown as Record<string, string>)[key]!;
    return match;
  });
}

function pickConsentCombination(
  rng: () => number,
  dist: ConsentDistribution,
): Record<ConsentFlag, boolean> {
  if (dist.mode === "independent") {
    return {
      emailMarketingConsent: bernoulli(rng, dist.emailMarketingConsent),
      groupMarketingConsent: bernoulli(rng, dist.groupMarketingConsent),
      areaMarketingConsent: bernoulli(rng, dist.areaMarketingConsent),
      otherMarketingConsent: bernoulli(rng, dist.otherMarketingConsent),
      postDirectMarketing: bernoulli(rng, dist.postDirectMarketing),
      telephoneDirectMarketing: bernoulli(rng, dist.telephoneDirectMarketing),
    };
  }
  const totalWeight = dist.combinations.reduce((s, c) => s + c.weight, 0);
  const target = rng() * totalWeight;
  let acc = 0;
  for (const combo of dist.combinations) {
    acc += combo.weight;
    if (target < acc) {
      return {
        emailMarketingConsent: combo.emailMarketingConsent,
        groupMarketingConsent: combo.groupMarketingConsent,
        areaMarketingConsent: combo.areaMarketingConsent,
        otherMarketingConsent: combo.otherMarketingConsent,
        postDirectMarketing: combo.postDirectMarketing,
        telephoneDirectMarketing: combo.telephoneDirectMarketing,
      };
    }
  }
  const last = dist.combinations[dist.combinations.length - 1]!;
  return {
    emailMarketingConsent: last.emailMarketingConsent,
    groupMarketingConsent: last.groupMarketingConsent,
    areaMarketingConsent: last.areaMarketingConsent,
    otherMarketingConsent: last.otherMarketingConsent,
    postDirectMarketing: last.postDirectMarketing,
    telephoneDirectMarketing: last.telephoneDirectMarketing,
  };
}

function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  if (/\{|\}/.test(email)) return false;
  return EMAIL_REGEX.test(email);
}

/**
 * Validate a template by rendering against representative contexts and
 * checking the output is a syntactically valid email. Throws a clear
 * error on failure.
 */
export function validateEmailTemplate(
  template: string,
  domain: string,
  base: string,
): void {
  if (!template.includes("@")) {
    throw new Error("Email template must contain '@'");
  }
  const sample: RenderContext = {
    firstname: "alice",
    surname: "smith",
    nn: "01",
    membershipNumber: "3000001",
    groupCode: "TEST",
    domain,
    base,
  };
  const rendered = renderEmailTemplate(template, sample);
  if (!isValidEmail(rendered)) {
    throw new Error(
      `Email template renders to an invalid address: "${rendered}"`,
    );
  }
}

function validateConsentDistribution(dist: ConsentDistribution): void {
  if (dist.mode === "independent") {
    for (const flag of CONSENT_FLAGS) {
      const p = dist[flag];
      if (typeof p !== "number" || p < 0 || p > 1 || Number.isNaN(p)) {
        throw new Error(
          `Consent distribution for ${flag} must be a number 0..1, got ${String(p)}`,
        );
      }
    }
    return;
  }
  if (dist.combinations.length === 0) {
    throw new Error("Joint consent distribution must have at least one combination");
  }
  const total = dist.combinations.reduce((s, c) => s + c.weight, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(
      `Joint consent combination weights must sum to 100, got ${total.toFixed(2)}`,
    );
  }
}

function validateRoleProportions(roles: RoleProportions): void {
  for (const [key, value] of Object.entries(roles)) {
    if (typeof value !== "number" || value < 0 || value > 1 || Number.isNaN(value)) {
      throw new Error(
        `Role proportion ${key} must be a number 0..1, got ${String(value)}`,
      );
    }
  }
}

/**
 * Generate `count` synthetic members for a tenant. Output is shaped like
 * `ParsedMember` so it can be passed directly to upsertMembers without
 * an xlsx round-trip (preserving granular consent + roles, neither of
 * which exist as Insight Hub columns).
 */
export function generateSyntheticMembers(
  opts: SyntheticOptions,
): ParsedMember[] {
  const count = Math.max(0, Math.min(10_000, opts.count));
  if (count === 0) return [];

  const seed = opts.seed ?? randomInt(0x7fffffff);
  const rng = mulberry32(seed);
  const consent = opts.consentDistribution ?? DEFAULT_CONSENT_DISTRIBUTION;
  const roles = opts.roleProportions ?? DEFAULT_ROLE_PROPORTIONS;
  const template = opts.emailTemplate ?? DEFAULT_EMAIL_TEMPLATE;
  const domain = opts.emailDomain ?? DEFAULT_EMAIL_DOMAIN;
  const base = opts.emailBase ?? "test";
  const region = opts.region ?? "mixed";
  const towns = townsFor(region);
  const postcodeAreas = postcodeAreasFor(region);

  validateEmailTemplate(template, domain, base);
  validateConsentDistribution(consent);
  validateRoleProportions(roles);

  const tenantGroupCode =
    opts.tenantKind === "group" ? opts.tenantCode.toUpperCase() : undefined;
  const tenantAreaCode =
    opts.tenantKind === "area" ? opts.tenantCode.toUpperCase() : undefined;
  const groupName =
    opts.groupName ??
    `${tenantGroupCode ?? tenantAreaCode ?? "Mock"} Walking Group`;

  const startMemNo = 3_000_000;
  const now = Date.now();
  const width = nnWidth(count);
  const seenEmails = new Set<string>();
  const seenNamePairs = new Set<string>();
  const namePairKey = (f: string, l: string): string =>
    `${f.toLowerCase()}|${l.toLowerCase()}`;

  const members: ParsedMember[] = [];
  for (let i = 0; i < count; i += 1) {
    const firstName = pick(rng, FIRST_NAMES);
    const baseLastName = pick(rng, LAST_NAMES);
    let lastName: string = baseLastName;
    if (seenNamePairs.has(namePairKey(firstName, lastName))) {
      let attempts = 0;
      do {
        const extra = pick(rng, LAST_NAMES);
        if (extra !== baseLastName) {
          lastName = `${baseLastName}-${extra}`;
        }
        attempts += 1;
      } while (
        seenNamePairs.has(namePairKey(firstName, lastName)) && attempts < 256
      );
      if (seenNamePairs.has(namePairKey(firstName, lastName))) {
        let n = 2;
        while (seenNamePairs.has(namePairKey(firstName, `${baseLastName}-${n}`))) {
          n += 1;
        }
        lastName = `${baseLastName}-${n}`;
      }
    }
    seenNamePairs.add(namePairKey(firstName, lastName));
    const title = pick(rng, TITLES);
    const town = pick(rng, towns);
    const membershipNumber = String(startMemNo + i);

    const groupCode =
      tenantGroupCode ??
      `${(tenantAreaCode ?? "KT").slice(0, 2)}${String(10 + Math.floor(rng() * 80))}`;
    const areaCode = (tenantAreaCode ?? groupCode.slice(0, 2)).toUpperCase();
    const areaName = `${areaCode} Area`;

    const renderCtx: RenderContext = {
      firstname: firstName.toLowerCase(),
      surname: lastName.toLowerCase(),
      nn: String(i + 1).padStart(width, "0"),
      membershipNumber,
      groupCode,
      domain,
      base,
    };
    const email = renderEmailTemplate(template, renderCtx);
    if (!isValidEmail(email)) {
      throw new Error(
        `Generated invalid email at row ${i + 1}: "${email}". Check template placeholders.`,
      );
    }
    if (seenEmails.has(email)) {
      throw new Error(
        `Duplicate email generated at row ${i + 1}: "${email}". The template does not yield unique addresses for ${count} rows — include {nn} or {membershipNumber}.`,
      );
    }
    seenEmails.add(email);

    const joinedYearsAgo = 1 + Math.floor(rng() * 30);
    const ramblersJoin = new Date(now - joinedYearsAgo * 365 * 24 * 3600 * 1000);
    const groupJoin = new Date(
      ramblersJoin.getTime() + Math.floor(rng() * 365 * 24 * 3600 * 1000),
    );
    const areaJoin = new Date(groupJoin.getTime());
    const expiry = new Date(now + Math.floor((1 + rng() * 2) * 365 * 24 * 3600 * 1000));

    const flags = pickConsentCombination(rng, consent);
    const updatedFor = (set: boolean): Date | undefined =>
      set ? recentDate(rng, now) : undefined;

    const walkLeader = bernoulli(rng, roles.walkLeader);
    const emailSender = bernoulli(rng, roles.emailSender);
    const viewMembershipData = bernoulli(rng, roles.viewMembershipData);
    const memberRoles =
      walkLeader || emailSender || viewMembershipData
        ? {
            ...(walkLeader ? { walkLeader: true } : {}),
            ...(emailSender ? { emailSender: true } : {}),
            ...(viewMembershipData ? { viewMembershipData: true } : {}),
          }
        : undefined;

    const member: ParsedMember = {
      salesforceId: `003MOCK_${membershipNumber}`,
      membershipNumber,
      firstName,
      initials: firstName[0] ?? "",
      lastName,
      title,
      email,
      mobileNumber: `07700 ${String(900000 + Math.floor(rng() * 99999)).padStart(6, "0")}`,
      landlineTelephone: `01${String(Math.floor(rng() * 1_000_000_000)).padStart(9, "0")}`,
      address1: `${1 + Math.floor(rng() * 250)} ${pick(rng, STREETS)}`,
      town,
      country: "United Kingdom",
      postcode: `${pick(rng, postcodeAreas)}${1 + Math.floor(rng() * 20)} ${Math.floor(rng() * 9)}${pick(rng, ["AA", "AB", "BC", "XY", "RT", "QP"])}`,

      groupName,
      groupCode,
      groupJoinedDate: groupJoin,
      memberType: "Member",
      memberTerm: pick(rng, MEMBER_TERMS),
      memberStatus: pick(rng, MEMBER_STATUS),
      membershipType: pick(rng, MEMBERSHIP_TYPES),
      membershipExpiryDate: expiry,
      ramblersJoinDate: ramblersJoin,

      areaName,
      areaJoinedDate: areaJoin,

      groupMemberships: [
        {
          groupCode,
          primary: true,
          ...(memberRoles ? { roles: memberRoles } : {}),
        },
      ],

      volunteer: bernoulli(rng, 0.15),

      emailMarketingConsent: flags.emailMarketingConsent,
      ...(flags.emailMarketingConsent
        ? { emailPermissionLastUpdated: updatedFor(true) }
        : {}),
      postDirectMarketing: flags.postDirectMarketing,
      ...(flags.postDirectMarketing
        ? { postPermissionLastUpdated: updatedFor(true) }
        : {}),
      telephoneDirectMarketing: flags.telephoneDirectMarketing,
      ...(flags.telephoneDirectMarketing
        ? { telephonePermissionLastUpdated: updatedFor(true) }
        : {}),
      walkProgrammeOptOut: bernoulli(rng, 0.1),

      groupMarketingConsent: flags.groupMarketingConsent,
      areaMarketingConsent: flags.areaMarketingConsent,
      otherMarketingConsent: flags.otherMarketingConsent,
    } as ParsedMember;

    members.push(member);
  }

  return members;
}
