/**
 * On bootstrap, ensure there is exactly one root operator seeded from the
 * ADMIN_USERNAME / ADMIN_PASSWORD env vars. Idempotent: re-runs are no-ops
 * (the password hash is only overwritten if ADMIN_PASSWORD has changed
 * since the last seed, which helps after a secrets rotation).
 */
import { Operator } from "../db/models/index.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";

export async function seedRootOperator(): Promise<void> {
  const config = loadConfig();
  const existing = await Operator.findOne({ username: config.ADMIN_USERNAME }).exec();
  if (!existing) {
    const passwordHash = await hashPassword(config.ADMIN_PASSWORD);
    await Operator.create({
      username: config.ADMIN_USERNAME,
      passwordHash,
      isRoot: true,
      label: "Root operator (seeded from ADMIN_PASSWORD)",
      createdAt: new Date(),
    });
    logger.info({ username: config.ADMIN_USERNAME }, "seeded root operator");
    return;
  }

  const same = await verifyPassword(config.ADMIN_PASSWORD, existing.passwordHash);
  if (!same) {
    existing.passwordHash = await hashPassword(config.ADMIN_PASSWORD);
    await existing.save();
    logger.info({ username: config.ADMIN_USERNAME }, "updated root operator password (rotation)");
  }
}
