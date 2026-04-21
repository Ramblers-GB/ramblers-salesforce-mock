/**
 * Synthetic Insight Hub ExportAll generator.
 *
 * Produces plausibly-shaped member rows for a given tenant (groupCode or
 * areaCode) — usable as a deterministic dev fixture. Feeds the same parser
 * as a real ExportAll, so uploading the generated xlsx exercises the whole
 * ingest path.
 */
import { randomInt } from "node:crypto";

const FIRST_NAMES = [
  "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry",
  "Isla", "James", "Katherine", "Liam", "Martha", "Noah", "Olivia", "Peter",
  "Quinn", "Rachel", "Samuel", "Tessa", "Uma", "Vincent", "Wendy", "Xavier",
  "Yvonne", "Zachary", "Amelia", "Benjamin", "Clara", "Daniel",
] as const;

const LAST_NAMES = [
  "Adams", "Brooks", "Clark", "Davies", "Evans", "Foster", "Green", "Hughes",
  "Irving", "Jones", "King", "Lewis", "Morris", "Nicholls", "Owen", "Price",
  "Quincey", "Roberts", "Smith", "Taylor", "Unwin", "Vincent", "Walker", "Young",
] as const;

const TOWNS = [
  "Canterbury", "Faversham", "Margate", "Maidstone", "Ashford", "Dover",
  "Folkestone", "Ramsgate", "Whitstable", "Tunbridge Wells",
] as const;

const MEMBER_STATUS = ["Active", "payment pending"] as const;
const MEMBERSHIP_TYPES = ["Individual", "Joint"] as const;
const MEMBER_TERMS = ["annual", "life"] as const;
const TITLES = ["Mr", "Mrs", "Miss", "Ms", "Dr"] as const;

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
  const index = Math.floor(rng() * arr.length);
  return arr[index] as T;
}

export interface SyntheticOptions {
  count: number;
  tenantCode: string;
  tenantKind: "group" | "area";
  groupName?: string;
  seed?: number;
}

export interface SyntheticRow {
  [apiKey: string]: string | number | boolean | Date | undefined;
}

/**
 * Generate `count` synthetic rows. `tenantCode` is the owning tenant —
 * every row is stamped with this groupCode (if group tenant) or uniformly
 * across groups within the area (if area tenant).
 */
export function generateSyntheticMembers(opts: SyntheticOptions): SyntheticRow[] {
  const count = Math.max(0, Math.min(50_000, opts.count));
  const seed = opts.seed ?? randomInt(0x7fffffff);
  const rng = mulberry32(seed);
  const startMemNo = 3_000_000;
  const now = Date.now();
  const tenantGroup = opts.tenantKind === "group" ? opts.tenantCode.toUpperCase() : undefined;
  const tenantArea = opts.tenantKind === "area" ? opts.tenantCode.toUpperCase() : undefined;
  const groupName = opts.groupName ?? `${tenantGroup ?? tenantArea ?? "Mock"} Walking Group`;

  const rows: SyntheticRow[] = [];
  for (let i = 0; i < count; i += 1) {
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const title = pick(rng, TITLES);
    const town = pick(rng, TOWNS);
    const membershipNumber = String(startMemNo + i);

    const joinedYearsAgo = 1 + Math.floor(rng() * 12);
    const ramblersJoin = new Date(now - joinedYearsAgo * 365 * 24 * 3600 * 1000);
    const groupJoin = new Date(
      ramblersJoin.getTime() + Math.floor(rng() * 365 * 24 * 3600 * 1000),
    );
    const areaJoin = new Date(groupJoin.getTime());
    const expiry = new Date(now + Math.floor(rng() * 365 * 24 * 3600 * 1000));

    const consented = rng() > 0.2;
    const groupCode = tenantGroup ?? `${tenantArea ?? "KT"}${String(10 + Math.floor(rng() * 80))}`;
    const areaName = tenantArea ? `${tenantArea} Area` : `${groupCode.slice(0, 2)} Area`;

    const row: SyntheticRow = {
      groupName,
      membershipNumber,
      memberType: "Member",
      memberTerm: pick(rng, MEMBER_TERMS),
      memberStatus: pick(rng, MEMBER_STATUS),
      membershipType: pick(rng, MEMBERSHIP_TYPES),
      title,
      initials: `${firstName[0] ?? ""}`,
      firstName,
      lastName,
      address1: `${1 + Math.floor(rng() * 250)} ${pick(rng, ["High Street", "Church Lane", "Mill Road", "Park Avenue"])}`,
      town,
      country: "United Kingdom",
      postcode: `CT${1 + Math.floor(rng() * 20)} ${Math.floor(rng() * 9)}${pick(rng, ["AA", "AB", "BC", "XY"])}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
      mobileNumber: `07700 ${String(900000 + Math.floor(rng() * 99999)).padStart(6, "0")}`,
      landlineTelephone: `01${String(Math.floor(rng() * 1_000_000_000)).padStart(9, "0")}`,
      membershipExpiryDate: expiry,
      ramblersJoinDate: ramblersJoin,
      areaName,
      areaJoinedDate: areaJoin,
      groupCode,
      groupJoinedDate: groupJoin,
      volunteer: rng() > 0.85,
      emailMarketingConsent: consented,
      emailPermissionLastUpdated: ramblersJoin,
      postDirectMarketing: rng() > 0.7,
      telephoneDirectMarketing: rng() > 0.8,
      walkProgrammeOptOut: rng() > 0.9,
    };

    rows.push(row);
  }

  return rows;
}
