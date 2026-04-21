/**
 * API token minting and verification.
 *
 * Token format: `rsm_<tenantCode>_<32-hex-random>`.
 * The full plaintext is only returned to the minting operator ONCE (at creation).
 * We persist a SHA-256 hash plus a non-secret prefix (first 12 chars) so operators
 * can recognise tokens in the admin UI without exposing the secret.
 */
import { createHash, randomBytes } from "node:crypto";

export interface NewToken {
  plaintext: string;
  hash: string;
  prefix: string;
}

const TOKEN_PREFIX = "rsm";

export function mintToken(tenantCode: string): NewToken {
  const random = randomBytes(24).toString("hex");
  const plaintext = `${TOKEN_PREFIX}_${tenantCode}_${random}`;
  const hash = hashToken(plaintext);
  const prefix = plaintext.slice(0, 16);
  return { plaintext, hash, prefix };
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf-8").digest("hex");
}

export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorizationHeader);
  return match ? (match[1] ?? null) : null;
}
