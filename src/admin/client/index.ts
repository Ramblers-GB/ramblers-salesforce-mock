/**
 * Admin UI client. 100% TypeScript; esbuild compiles to public/admin.js.
 * Vanilla DOM, no framework. Attaches on DOMContentLoaded and hydrates the
 * admin.html shell by fetching /admin/api/me and lists on demand.
 */

export const ADMIN_UI_VERSION = "0.1.0";

interface OperatorView {
  username: string;
  isRoot: boolean;
  label?: string;
  createdAt: string;
  lastLoginAt?: string;
}

interface TenantView {
  code: string;
  kind: "group" | "area";
  name?: string;
  ownerOperator: string;
  createdAt: string;
  lastIngestAt?: string;
  lastIngestCount?: number;
}

interface TokenView {
  id: string;
  prefix: string;
  tenantCode: string;
  label: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

interface GeneratedToken {
  token: string;
  prefix: string;
  tenantCode: string;
  warning: string;
}

interface SalesforceMember {
  membershipNumber?: string;
  firstName?: string;
  lastName: string;
  email?: string;
  emailMarketingConsent: boolean;
}

interface ApiError {
  error: { code: string; message: string };
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }
  return (await response.json()) as T;
}

async function extractErrorMessage(response: Response): Promise<string> {
  const statusText = response.statusText || "";
  const prefix = statusText ? `${response.status} ${statusText}` : String(response.status);
  try {
    const text = await response.text();
    if (!text) return prefix;
    try {
      const parsed = JSON.parse(text) as ApiError | Record<string, unknown>;
      if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
        const err = (parsed as ApiError).error;
        if (err?.message) return `${prefix} — ${err.message}`;
      }
    } catch {
      /* not JSON; fall through and return the raw body */
    }
    const trimmed = text.trim().slice(0, 500);
    return trimmed ? `${prefix} — ${trimmed}` : prefix;
  } catch {
    return prefix;
  }
}

function $<T extends HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

function $$<T extends HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

function showView(name: "login" | "dashboard"): void {
  for (const v of $$<HTMLElement>('[data-rsm-view]')) {
    v.hidden = v.dataset["rsmView"] !== name;
  }
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

class AdminApp {
  private operator: OperatorView | null = null;
  private tenants: TenantView[] = [];
  private selectedTenant: TenantView | null = null;

  public async start(): Promise<void> {
    this.bindLoginUI();
    try {
      const { operator } = await jsonFetch<{ operator: OperatorView }>("/admin/api/me");
      this.operator = operator;
      await this.enterDashboard();
    } catch {
      showView("login");
    }
  }

  private bindLoginUI(): void {
    for (const tab of $$<HTMLButtonElement>("[data-rsm-tab]")) {
      tab.addEventListener("click", () => {
        const which = tab.dataset["rsmTab"];
        for (const t of $$<HTMLButtonElement>("[data-rsm-tab]")) {
          t.setAttribute("aria-selected", t === tab ? "true" : "false");
        }
        $<HTMLFormElement>('[data-rsm-form="login-password"]')!.hidden = which !== "password";
        $<HTMLFormElement>('[data-rsm-form="login-bootstrap"]')!.hidden = which !== "bootstrap";
      });
    }

    const pwForm = $<HTMLFormElement>('[data-rsm-form="login-password"]');
    pwForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.submitLogin({
        username: (pwForm.elements.namedItem("username") as HTMLInputElement).value,
        password: (pwForm.elements.namedItem("password") as HTMLInputElement).value,
      });
    });

    const bootstrapForm = $<HTMLFormElement>('[data-rsm-form="login-bootstrap"]');
    bootstrapForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.submitLogin({
        bootstrapToken: (bootstrapForm.elements.namedItem("bootstrapToken") as HTMLInputElement).value,
      });
    });
  }

  private async submitLogin(body: Record<string, string>): Promise<void> {
    const errorEl = $<HTMLElement>("[data-rsm-login-error]");
    if (errorEl) errorEl.hidden = true;
    try {
      const { operator } = await jsonFetch<{ operator: OperatorView }>("/admin/api/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      this.operator = operator;
      await this.enterDashboard();
    } catch (err: unknown) {
      if (errorEl) {
        errorEl.textContent = err instanceof Error ? err.message : String(err);
        errorEl.hidden = false;
      }
    }
  }

  private async enterDashboard(): Promise<void> {
    showView("dashboard");
    const sess = $<HTMLElement>("[data-rsm-session]");
    if (sess && this.operator) {
      sess.innerHTML = `Signed in as <strong>${this.operator.username}</strong>${this.operator.isRoot ? " (root)" : ""} · <a href="#" data-rsm-signout>sign out</a>`;
      const signOut = $<HTMLAnchorElement>("[data-rsm-signout]", sess);
      signOut?.addEventListener("click", (e) => {
        e.preventDefault();
        void this.signOut();
      });
    }
    this.bindDashboardUI();
    await this.refreshTenants();
  }

  private async signOut(): Promise<void> {
    await fetch("/admin/api/logout", { method: "POST", credentials: "same-origin" });
    window.location.reload();
  }

  private bindDashboardUI(): void {
    $<HTMLButtonElement>('[data-rsm-btn="new-tenant"]')?.addEventListener("click", () => {
      $<HTMLFormElement>('[data-rsm-form="new-tenant"]')!.hidden = false;
    });
    $<HTMLButtonElement>('[data-rsm-btn="cancel-tenant"]')?.addEventListener("click", () => {
      $<HTMLFormElement>('[data-rsm-form="new-tenant"]')!.hidden = true;
    });

    const newTenantForm = $<HTMLFormElement>('[data-rsm-form="new-tenant"]');
    newTenantForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = (newTenantForm.elements.namedItem("code") as HTMLInputElement).value;
      const kind = (newTenantForm.elements.namedItem("kind") as HTMLSelectElement).value as "group" | "area";
      const name = (newTenantForm.elements.namedItem("name") as HTMLInputElement).value;
      void this.createTenant(code, kind, name || undefined);
    });
  }

  private async refreshTenants(): Promise<void> {
    const { tenants } = await jsonFetch<{ tenants: TenantView[] }>("/admin/api/tenants");
    this.tenants = tenants;
    this.renderTenantList();
    if (this.selectedTenant) {
      const refreshed = tenants.find((t) => t.code === this.selectedTenant?.code);
      if (refreshed) await this.selectTenant(refreshed);
      else this.clearSelection();
    }
  }

  private renderTenantList(): void {
    const list = $<HTMLUListElement>("[data-rsm-tenant-list]");
    if (!list) return;
    list.innerHTML = "";
    if (this.tenants.length === 0) {
      list.innerHTML = '<li class="rsm-muted" style="cursor:default">No tenants yet.</li>';
      return;
    }
    for (const t of this.tenants) {
      const li = document.createElement("li");
      li.dataset["code"] = t.code;
      if (this.selectedTenant?.code === t.code) li.setAttribute("aria-selected", "true");
      li.innerHTML = `<span class="rsm-tenant-code">${t.code}</span><span class="rsm-tenant-kind">${t.kind}</span>`;
      li.addEventListener("click", () => void this.selectTenant(t));
      list.appendChild(li);
    }
  }

  private async createTenant(code: string, kind: "group" | "area", name?: string): Promise<void> {
    try {
      await jsonFetch<{ tenant: TenantView }>("/admin/api/tenants", {
        method: "POST",
        body: JSON.stringify({ code, kind, name }),
      });
      $<HTMLFormElement>('[data-rsm-form="new-tenant"]')!.reset();
      $<HTMLFormElement>('[data-rsm-form="new-tenant"]')!.hidden = true;
      await this.refreshTenants();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  private clearSelection(): void {
    this.selectedTenant = null;
    $<HTMLElement>("[data-rsm-detail]")!.hidden = true;
    $<HTMLElement>("[data-rsm-detail-empty]")!.hidden = false;
  }

  private async selectTenant(tenant: TenantView): Promise<void> {
    this.selectedTenant = tenant;
    this.renderTenantList();
    $<HTMLElement>("[data-rsm-detail-empty]")!.hidden = true;
    $<HTMLElement>("[data-rsm-detail]")!.hidden = false;
    $<HTMLElement>("[data-rsm-detail-title]")!.textContent = `${tenant.code} — ${tenant.name ?? "(no name)"}`;
    $<HTMLElement>("[data-rsm-detail-meta]")!.textContent =
      `${tenant.kind}, owned by ${tenant.ownerOperator}, created ${formatDate(tenant.createdAt)}, last ingest ${formatDate(tenant.lastIngestAt)} (${tenant.lastIngestCount ?? 0} rows)`;

    this.bindDetailForms(tenant);
    $<HTMLElement>("[data-rsm-token-reveal]")!.hidden = true;
    $<HTMLElement>("[data-rsm-ingest-result]")!.hidden = true;
    $<HTMLElement>("[data-rsm-ingest-error]")!.hidden = true;

    await Promise.all([this.refreshTokens(tenant), this.refreshMembers(tenant)]);
  }

  private bindDetailForms(tenant: TenantView): void {
    const generateForm = $<HTMLFormElement>('[data-rsm-form="generate-token"]');
    if (generateForm) {
      generateForm.onsubmit = (e): void => {
        e.preventDefault();
        const label = (generateForm.elements.namedItem("label") as HTMLInputElement).value;
        void this.generateTokenFor(tenant, label);
      };
    }

    const uploadForm = $<HTMLFormElement>('[data-rsm-form="upload"]');
    if (uploadForm) {
      uploadForm.onsubmit = (e): void => {
        e.preventDefault();
        const fileInput = uploadForm.elements.namedItem("file") as HTMLInputElement;
        const file = fileInput.files?.[0];
        if (!file) return;
        void this.uploadXlsx(tenant, file);
      };
    }

    const genForm = $<HTMLFormElement>('[data-rsm-form="generate"]');
    if (genForm) {
      let downloadOnly = false;
      for (const btn of $$<HTMLButtonElement>("button[data-rsm-btn]", genForm)) {
        btn.addEventListener("click", () => {
          downloadOnly = btn.dataset["rsmBtn"] === "download-only";
        });
      }
      genForm.onsubmit = (e): void => {
        e.preventDefault();
        const count = Number((genForm.elements.namedItem("count") as HTMLInputElement).value);
        const seedRaw = (genForm.elements.namedItem("seed") as HTMLInputElement).value;
        const seed = seedRaw ? Number(seedRaw) : undefined;
        void this.generate(tenant, count, seed, downloadOnly);
        downloadOnly = false;
      };
    }
  }

  private async refreshTokens(tenant: TenantView): Promise<void> {
    const { tokens } = await jsonFetch<{ tokens: TokenView[] }>(
      `/admin/api/tenants/${encodeURIComponent(tenant.code)}/tokens`,
    );
    const tbody = $<HTMLTableSectionElement>("[data-rsm-token-table] tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    for (const t of tokens) {
      const tr = document.createElement("tr");
      if (t.revokedAt) tr.className = "rsm-revoked";
      tr.innerHTML = `
        <td><code>${t.prefix}…</code></td>
        <td>${escapeHtml(t.label)}</td>
        <td>${formatDate(t.createdAt)}</td>
        <td>${formatDate(t.lastUsedAt)}</td>
        <td></td>`;
      const actions = tr.lastElementChild!;
      if (!t.revokedAt) {
        const btn = document.createElement("button");
        btn.className = "rsm-btn rsm-btn-small rsm-btn-danger";
        btn.textContent = "Revoke";
        btn.addEventListener("click", () => void this.revokeToken(tenant, t));
        actions.appendChild(btn);
      }
      tbody.appendChild(tr);
    }
  }

  private async generateTokenFor(tenant: TenantView, label: string): Promise<void> {
    try {
      const body = await jsonFetch<GeneratedToken>(
        `/admin/api/tenants/${encodeURIComponent(tenant.code)}/tokens`,
        { method: "POST", body: JSON.stringify({ label }) },
      );
      const reveal = $<HTMLElement>("[data-rsm-token-reveal]");
      const warningEl = $<HTMLElement>("[data-rsm-token-reveal-warning]");
      const valueEl = $<HTMLElement>("[data-rsm-token-reveal-value]");
      const copyBtn = $<HTMLButtonElement>("[data-rsm-token-copy]");
      if (reveal && warningEl && valueEl && copyBtn) {
        warningEl.textContent = body.warning;
        valueEl.textContent = body.token;
        reveal.hidden = false;
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("rsm-btn-copied");
        copyBtn.onclick = (): void => {
          void this.copyToClipboard(body.token, copyBtn);
        };
      }
      const generateForm = $<HTMLFormElement>('[data-rsm-form="generate-token"]');
      generateForm?.reset();
      await this.refreshTokens(tenant);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  private async copyToClipboard(text: string, button: HTMLButtonElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
      button.classList.add("rsm-btn-copied");
      setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("rsm-btn-copied");
      }, 2000);
    } catch {
      button.textContent = "Copy failed";
      setTimeout(() => {
        button.textContent = "Copy";
      }, 2000);
    }
  }

  private async revokeToken(tenant: TenantView, token: TokenView): Promise<void> {
    if (!confirm(`Revoke token "${token.label}"? This cannot be undone.`)) return;
    await jsonFetch<{ revoked: boolean }>(
      `/admin/api/tenants/${encodeURIComponent(tenant.code)}/tokens/${token.id}/revoke`,
      { method: "POST" },
    );
    await this.refreshTokens(tenant);
  }

  private async uploadXlsx(tenant: TenantView, file: File): Promise<void> {
    this.clearIngestFeedback();
    this.setIngestProgress("Uploading…");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(
        `/admin/api/tenants/${encodeURIComponent(tenant.code)}/upload`,
        { method: "POST", body: formData, credentials: "same-origin" },
      );
      if (!response.ok) {
        const message = await extractErrorMessage(response);
        this.setIngestError(message);
        return;
      }
      const body = (await response.json()) as Record<string, unknown>;
      this.setIngestResult(JSON.stringify(body, null, 2));
      await this.refreshTenants();
      await this.refreshMembers(tenant);
    } catch (err: unknown) {
      this.setIngestError(err instanceof Error ? err.message : String(err));
    }
  }

  private async generate(
    tenant: TenantView,
    count: number,
    seed: number | undefined,
    downloadOnly: boolean,
  ): Promise<void> {
    this.clearIngestFeedback();

    if (downloadOnly) {
      const url = `/admin/api/tenants/${encodeURIComponent(tenant.code)}/generate`;
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, seed, downloadOnly: true }),
      });
      if (!response.ok) {
        const message = await extractErrorMessage(response);
        this.setIngestError(message);
        return;
      }
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ExportAll-${tenant.code}-${count}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      return;
    }

    this.setIngestProgress("Generating…");
    try {
      const body = await jsonFetch<Record<string, unknown>>(
        `/admin/api/tenants/${encodeURIComponent(tenant.code)}/generate`,
        { method: "POST", body: JSON.stringify({ count, seed }) },
      );
      this.setIngestResult(JSON.stringify(body, null, 2));
      await this.refreshTenants();
      await this.refreshMembers(tenant);
    } catch (err: unknown) {
      this.setIngestError(err instanceof Error ? err.message : String(err));
    }
  }

  private clearIngestFeedback(): void {
    const resultEl = $<HTMLElement>("[data-rsm-ingest-result]");
    const errorEl = $<HTMLElement>("[data-rsm-ingest-error]");
    if (resultEl) { resultEl.hidden = true; resultEl.textContent = ""; }
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ""; }
  }

  private setIngestProgress(message: string): void {
    const resultEl = $<HTMLElement>("[data-rsm-ingest-result]");
    if (resultEl) {
      resultEl.hidden = false;
      resultEl.textContent = message;
    }
  }

  private setIngestResult(text: string): void {
    const resultEl = $<HTMLElement>("[data-rsm-ingest-result]");
    const errorEl = $<HTMLElement>("[data-rsm-ingest-error]");
    if (errorEl) errorEl.hidden = true;
    if (resultEl) {
      resultEl.hidden = false;
      resultEl.textContent = text;
    }
  }

  private setIngestError(message: string): void {
    const resultEl = $<HTMLElement>("[data-rsm-ingest-result]");
    const errorEl = $<HTMLElement>("[data-rsm-ingest-error]");
    if (resultEl) resultEl.hidden = true;
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
  }

  private async refreshMembers(tenant: TenantView): Promise<void> {
    const body = await jsonFetch<{ members: SalesforceMember[] }>(
      `/admin/api/tenants/${encodeURIComponent(tenant.code)}/members?limit=20`,
    );
    const tbody = $<HTMLTableSectionElement>("[data-rsm-members-table] tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    for (const m of body.members) {
      const tr = document.createElement("tr");
      const name = [m.firstName, m.lastName].filter(Boolean).join(" ");
      tr.innerHTML = `
        <td><code>${escapeHtml(m.membershipNumber ?? "")}</code></td>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(m.email ?? "")}</td>
        <td>${m.emailMarketingConsent ? "yes" : "no"}</td>`;
      tbody.appendChild(tr);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bootstrap(): void {
  const app = new AdminApp();
  void app.start();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
}
