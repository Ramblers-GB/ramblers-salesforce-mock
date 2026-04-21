/**
 * Admin UI entry point. Compiled by esbuild to `public/admin.js`.
 *
 * Follow-up commits will add: login form handler, tenant create/select,
 * token mint/copy/revoke, xlsx upload progress, and synthetic-data generator
 * controls. For now this is a placeholder so the build pipeline has a file
 * to bundle.
 */
export const ADMIN_UI_VERSION = "0.0.1";

function bootstrap(): void {
  const root = document.getElementById("rsm-admin-root");
  if (!root) return;
  // Dashboard attachment will go here in a follow-up commit.
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
}
