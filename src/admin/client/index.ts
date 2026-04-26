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

interface ReleaseEntry {
  sha: string;
  subject: string;
  body: string;
  author: string;
  date: string;
}

const CONSENT_FLAGS = [
  "emailMarketingConsent",
  "groupMarketingConsent",
  "areaMarketingConsent",
  "otherMarketingConsent",
  "postDirectMarketing",
  "telephoneDirectMarketing",
] as const;
type ConsentFlag = (typeof CONSENT_FLAGS)[number];

const EMAIL_PRESETS: Record<string, string> = {
  distinct: "{firstname}.{surname}{nn}@{domain}",
  plus: "{base}+m{membershipNumber}@{domain}",
  minimal: "member{membershipNumber}@{domain}",
};

interface JointRow extends Record<ConsentFlag, boolean> {
  weight: number;
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

type ViewName = "login" | "dashboard" | "release-notes";

function showView(name: ViewName): void {
  for (const v of $$<HTMLElement>('[data-rsm-view]')) {
    v.hidden = v.dataset["rsmView"] !== name;
  }
  for (const link of $$<HTMLAnchorElement>("[data-rsm-nav]")) {
    link.classList.toggle("rsm-nav-active", link.dataset["rsmNav"] === name);
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
  private busyDepth = 0;

  private setBusy(busy: boolean): void {
    if (busy) {
      this.busyDepth += 1;
    } else {
      this.busyDepth = Math.max(0, this.busyDepth - 1);
    }
    const isBusy = this.busyDepth > 0;
    document.body.classList.toggle("rsm-busy", isBusy);
    const interactives = $$<HTMLButtonElement | HTMLInputElement>(
      'button, input[type="submit"], input[type="reset"]',
    );
    for (const el of interactives) {
      if (isBusy) {
        if (!el.disabled) {
          el.disabled = true;
          el.dataset["rsmBusy"] = "1";
        }
      } else if (el.dataset["rsmBusy"] === "1") {
        el.disabled = false;
        delete el.dataset["rsmBusy"];
      }
    }
  }

  private async withBusy<T>(fn: () => Promise<T>): Promise<T> {
    this.setBusy(true);
    try {
      return await fn();
    } finally {
      this.setBusy(false);
    }
  }

  public async start(): Promise<void> {
    this.bindLoginUI();
    this.bindHeaderNav();
    void this.loadVersion();
    window.addEventListener("popstate", () => {
      void this.routeFromUrl();
    });
    try {
      const { operator } = await jsonFetch<{ operator: OperatorView }>("/admin/api/me");
      this.operator = operator;
      await this.enterDashboard();
      await this.routeFromUrl();
    } catch {
      this.applyAuthVisibility();
      await this.routeFromUrl();
    }
  }

  private applyAuthVisibility(): void {
    const dashLink = $<HTMLAnchorElement>('[data-rsm-nav="dashboard"]');
    if (dashLink) dashLink.hidden = !this.operator;
    const sess = $<HTMLElement>("[data-rsm-session]");
    if (sess && !this.operator) {
      sess.innerHTML = `<a href="/admin/login">Sign in</a>`;
    }
  }

  private bindHeaderNav(): void {
    for (const link of $$<HTMLAnchorElement>("[data-rsm-nav]")) {
      link.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        const target = link.dataset["rsmNav"] === "release-notes" ? "/admin/release-notes" : "/admin/dashboard";
        if (window.location.pathname !== target) {
          window.history.pushState({}, "", target);
        }
        void this.routeFromUrl();
      });
    }
  }

  private async routeFromUrl(): Promise<void> {
    if (window.location.pathname === "/admin/release-notes") {
      showView("release-notes");
      await this.loadReleaseNotes();
      return;
    }
    if (!this.operator) {
      showView("login");
      return;
    }
    showView("dashboard");
    await this.syncSelectionFromUrl();
  }

  private static readonly VALID_TABS = ["members", "generate", "tokens"] as const;
  private static readonly DEFAULT_TAB = "members";
  private currentTab: string = AdminApp.DEFAULT_TAB;

  private getTenantFromUrl(): string | null {
    const code = new URLSearchParams(window.location.search).get("tenant");
    return code ? code.toUpperCase() : null;
  }

  private getTabFromUrl(): string {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && (AdminApp.VALID_TABS as readonly string[]).includes(tab)) return tab;
    return AdminApp.DEFAULT_TAB;
  }

  private updateUrl(code: string | null, tab: string): void {
    const params = new URLSearchParams();
    if (code) params.set("tenant", code);
    if (tab !== AdminApp.DEFAULT_TAB) params.set("tab", tab);
    const qs = params.toString();
    const url = qs ? `/admin/dashboard?${qs}` : `/admin/dashboard`;
    if (window.location.pathname + window.location.search !== url) {
      window.history.replaceState({ tenant: code, tab }, "", url);
    }
  }

  private updateUrlForTenant(code: string | null): void {
    this.updateUrl(code, this.currentTab);
  }

  private async syncSelectionFromUrl(): Promise<void> {
    const wanted = this.getTenantFromUrl();
    const tab = this.getTabFromUrl();
    this.activateTab(tab);
    if (!wanted) {
      if (this.selectedTenant) this.clearSelection();
      return;
    }
    if (this.selectedTenant?.code === wanted) return;
    const target = this.tenants.find((t) => t.code === wanted);
    if (target) await this.selectTenant(target);
  }

  private activateTab(name: string): void {
    if (!(AdminApp.VALID_TABS as readonly string[]).includes(name)) name = AdminApp.DEFAULT_TAB;
    this.currentTab = name;
    for (const btn of $$<HTMLButtonElement>("[data-rsm-detail-tab]")) {
      btn.setAttribute("aria-selected", btn.dataset["rsmDetailTab"] === name ? "true" : "false");
    }
    for (const panel of $$<HTMLElement>("[data-rsm-detail-panel]")) {
      panel.hidden = panel.dataset["rsmDetailPanel"] !== name;
    }
  }

  private bindDetailTabs(): void {
    for (const btn of $$<HTMLButtonElement>("[data-rsm-detail-tab]")) {
      btn.addEventListener("click", () => {
        const which = btn.dataset["rsmDetailTab"] ?? AdminApp.DEFAULT_TAB;
        this.activateTab(which);
        this.updateUrl(this.selectedTenant?.code ?? null, which);
      });
    }
    // Generic sub-tab handler (e.g. Upload/Download under Members).
    for (const btn of $$<HTMLButtonElement>("[data-rsm-sub-tab]")) {
      btn.addEventListener("click", () => {
        const which = btn.dataset["rsmSubTab"];
        if (!which) return;
        const group = btn.closest("[data-rsm-sub-tabs]");
        const scope = group?.parentElement ?? document;
        for (const sibling of Array.from(scope.querySelectorAll<HTMLElement>("[data-rsm-sub-tab]"))) {
          sibling.setAttribute("aria-selected", sibling.dataset["rsmSubTab"] === which ? "true" : "false");
        }
        for (const panel of Array.from(scope.querySelectorAll<HTMLElement>("[data-rsm-sub-panel]"))) {
          panel.hidden = panel.dataset["rsmSubPanel"] !== which;
        }
      });
    }
  }

  private releaseNotesLoaded = false;

  private async loadReleaseNotes(): Promise<void> {
    if (this.releaseNotesLoaded) return;
    const list = $<HTMLOListElement>("[data-rsm-release-list]");
    if (!list) return;
    try {
      const { entries } = await jsonFetch<{ entries: ReleaseEntry[] }>("/admin/api/release-notes");
      list.innerHTML = "";
      if (entries.length === 0) {
        list.innerHTML = '<li class="rsm-muted">No release notes available.</li>';
      } else {
        for (const e of entries) {
          const li = document.createElement("li");
          li.innerHTML = `
            <div class="rsm-release-meta">
              <span class="rsm-release-sha">${escapeHtml(e.sha)}</span>
              <span class="rsm-release-date">${formatDate(e.date)}</span>
            </div>
            <strong class="rsm-release-subject">${renderInlineCode(escapeHtml(e.subject))}</strong>
            ${e.body ? `<div class="rsm-release-body">${renderCommitBody(e.body)}</div>` : ""}
          `;
          list.appendChild(li);
        }
      }
      this.releaseNotesLoaded = true;
    } catch (err: unknown) {
      list.innerHTML = `<li class="rsm-ingest-error">${escapeHtml(err instanceof Error ? err.message : String(err))}</li>`;
    }
  }

  private async loadVersion(): Promise<void> {
    const el = $<HTMLElement>("[data-rsm-version]");
    if (!el) return;
    try {
      const { version, gitSha } = await jsonFetch<{ version: string; gitSha: string }>("/admin/api/version");
      el.textContent = gitSha
        ? `v${version} · ${gitSha}`
        : `v${version}`;
    } catch {
      // Silent — version display is decorative.
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
    await this.withBusy(async () => {
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
    });
  }

  private async enterDashboard(): Promise<void> {
    this.applyAuthVisibility();
    showView("dashboard");
    const sess = $<HTMLElement>("[data-rsm-session]");
    if (sess && this.operator) {
      sess.innerHTML = `Signed in as <strong>${escapeHtml(this.operator.username)}</strong>${this.operator.isRoot ? " (root)" : ""} · <a href="#" data-rsm-signout>sign out</a>`;
      const signOut = $<HTMLAnchorElement>("[data-rsm-signout]", sess);
      signOut?.addEventListener("click", (e) => {
        e.preventDefault();
        void this.signOut();
      });
    }
    this.bindDashboardUI();
    this.bindDetailTabs();
    if (this.operator?.isRoot) {
      this.bindOperatorsUI();
      const panel = $<HTMLElement>("[data-rsm-operators-panel]");
      if (panel) panel.hidden = false;
    }
    await this.refreshTenants();
    await this.syncSelectionFromUrl();
  }

  private bindOperatorsUI(): void {
    const toggle = $<HTMLButtonElement>('[data-rsm-btn="toggle-operators"]');
    const body = $<HTMLElement>("[data-rsm-operators-body]");
    toggle?.addEventListener("click", () => {
      if (!body) return;
      const isHidden = body.hidden;
      body.hidden = !isHidden;
      toggle.textContent = isHidden ? "Hide" : "Show";
      if (isHidden) void this.refreshOperators();
    });

    $<HTMLButtonElement>('[data-rsm-btn="generate-password"]')?.addEventListener("click", () => {
      const input = $<HTMLInputElement>('[data-rsm-form="new-operator"] input[name="password"]');
      if (input) input.value = randomPassword(20);
    });

    const form = $<HTMLFormElement>('[data-rsm-form="new-operator"]');
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = (form.elements.namedItem("username") as HTMLInputElement).value.trim();
      const password = (form.elements.namedItem("password") as HTMLInputElement).value;
      const labelField = (form.elements.namedItem("label") as HTMLInputElement).value.trim();
      void this.createOperator(username, password, labelField || undefined);
    });
  }

  private async refreshOperators(): Promise<void> {
    try {
      const { operators } = await jsonFetch<{ operators: OperatorView[] }>(
        "/admin/api/operators",
      );
      const tbody = $<HTMLTableSectionElement>("[data-rsm-operators-table] tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      for (const op of operators) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><code>${escapeHtml(op.username)}</code></td>
          <td>${escapeHtml(op.label ?? "")}</td>
          <td>${op.isRoot ? "root" : "operator"}</td>
          <td>${formatDate(op.createdAt)}</td>
          <td>${formatDate(op.lastLoginAt)}</td>
          <td></td>`;
        const actions = tr.lastElementChild!;
        const resetBtn = document.createElement("button");
        resetBtn.className = "rsm-btn rsm-btn-small rsm-btn-ghost";
        resetBtn.textContent = "Reset password";
        resetBtn.addEventListener("click", () => void this.resetOperatorPassword(op.username));
        actions.appendChild(resetBtn);
        tbody.appendChild(tr);
      }
    } catch (err: unknown) {
      this.setOperatorError(err instanceof Error ? err.message : String(err));
    }
  }

  private async resetOperatorPassword(username: string): Promise<void> {
    if (!confirm(`Reset password for "${username}"? A new random password will be generated and shown once.`)) return;
    this.setOperatorError(null);
    await this.withBusy(async () => {
      try {
        const result = await jsonFetch<{ username: string; password: string; warning: string }>(
          `/admin/api/operators/${encodeURIComponent(username)}/password`,
          { method: "POST", body: JSON.stringify({}) },
        );
        this.revealOperatorCredentials(`${result.username} / ${result.password}`, result.warning);
      } catch (err: unknown) {
        this.setOperatorError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  private revealOperatorCredentials(plaintext: string, warningText: string): void {
    const reveal = $<HTMLElement>("[data-rsm-operator-reveal]");
    const warning = $<HTMLElement>("[data-rsm-operator-reveal-warning]");
    const value = $<HTMLElement>("[data-rsm-operator-reveal-value]");
    const copyBtn = $<HTMLButtonElement>("[data-rsm-operator-copy]");
    if (!reveal || !warning || !value || !copyBtn) return;
    warning.textContent = warningText;
    value.textContent = plaintext;
    reveal.hidden = false;
    copyBtn.textContent = "Copy";
    copyBtn.classList.remove("rsm-btn-copied");
    copyBtn.onclick = (): void => {
      void this.copyToClipboard(plaintext, copyBtn);
    };
  }

  private async createOperator(
    username: string,
    password: string,
    label: string | undefined,
  ): Promise<void> {
    this.setOperatorError(null);
    await this.withBusy(async () => {
      try {
        await jsonFetch<{ operator: OperatorView }>("/admin/api/operators", {
          method: "POST",
          body: JSON.stringify({ username, password, ...(label ? { label } : {}) }),
        });
        this.revealOperatorCredentials(
          `${username} / ${password}`,
          "Operator created. Copy the credentials now and share them privately — the password is not shown again.",
        );
        const form = $<HTMLFormElement>('[data-rsm-form="new-operator"]');
        form?.reset();
        await this.refreshOperators();
      } catch (err: unknown) {
        this.setOperatorError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  private setOperatorError(message: string | null): void {
    const el = $<HTMLElement>("[data-rsm-operator-error]");
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
    } else {
      el.hidden = false;
      el.textContent = message;
    }
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
    await this.withBusy(async () => {
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
    });
  }

  private clearSelection(): void {
    this.selectedTenant = null;
    this.updateUrlForTenant(null);
    $<HTMLElement>("[data-rsm-detail]")!.hidden = true;
    $<HTMLElement>("[data-rsm-detail-empty]")!.hidden = false;
  }

  private async selectTenant(tenant: TenantView): Promise<void> {
    this.selectedTenant = tenant;
    this.updateUrlForTenant(tenant.code);
    this.renderTenantList();
    $<HTMLElement>("[data-rsm-detail-empty]")!.hidden = true;
    $<HTMLElement>("[data-rsm-detail]")!.hidden = false;
    $<HTMLElement>("[data-rsm-detail-title]")!.textContent = `${tenant.code} — ${tenant.name ?? "(no name)"}`;
    $<HTMLElement>("[data-rsm-detail-meta]")!.textContent =
      `${tenant.kind}, owned by ${tenant.ownerOperator}, created ${formatDate(tenant.createdAt)}, last import ${formatDate(tenant.lastIngestAt)} (${tenant.lastIngestCount ?? 0} rows)`;

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
      this.bindGenerateForm(genForm, tenant);
    }

    const exportBtn = $<HTMLButtonElement>('[data-rsm-btn="export-insight-hub"]');
    if (exportBtn) {
      exportBtn.onclick = (): void => {
        void this.exportInsightHub(tenant);
      };
    }
  }

  private bindGenerateForm(genForm: HTMLFormElement, tenant: TenantView): void {
    // Sliders mirror their adjacent number input, both directions, and
    // paint their filled portion in sunrise yellow via --rsm-pct.
    const paintSlider = (slider: HTMLInputElement): void => {
      const min = Number(slider.min) || 0;
      const max = Number(slider.max) || 100;
      const value = Number(slider.value) || 0;
      const range = max - min;
      const pct = range > 0 ? ((value - min) / range) * 100 : 0;
      slider.style.setProperty("--rsm-pct", `${pct.toFixed(2)}%`);
    };
    for (const slider of $$<HTMLInputElement>("[data-rsm-slider]", genForm)) {
      const name = slider.dataset["rsmSlider"]!;
      const numberInput = genForm.querySelector<HTMLInputElement>(
        `input[type="number"][name="${CSS.escape(name)}"]`,
      );
      paintSlider(slider);
      slider.addEventListener("input", () => {
        if (numberInput) numberInput.value = slider.value;
        paintSlider(slider);
      });
      numberInput?.addEventListener("input", () => {
        slider.value = numberInput.value;
        paintSlider(slider);
      });
    }

    // Email preset radios swap the custom-template input.
    const customInput = genForm.querySelector<HTMLInputElement>('input[name="emailTemplate"]');
    const updatePresetUI = (): void => {
      const preset = (genForm.querySelector<HTMLInputElement>(
        'input[name="emailPreset"]:checked',
      ))?.value ?? "distinct";
      if (customInput) {
        customInput.disabled = preset !== "custom";
        if (preset !== "custom") customInput.value = "";
      }
    };
    for (const radio of $$<HTMLInputElement>('input[name="emailPreset"]', genForm)) {
      radio.addEventListener("change", updatePresetUI);
    }
    updatePresetUI();

    // Consent mode toggle.
    const indepBlock = genForm.querySelector<HTMLElement>("[data-rsm-consent-independent]");
    const jointBlock = genForm.querySelector<HTMLElement>("[data-rsm-consent-joint]");
    const updateConsentMode = (): void => {
      const mode = genForm.querySelector<HTMLInputElement>(
        'input[name="consentMode"]:checked',
      )?.value ?? "independent";
      if (indepBlock) indepBlock.hidden = mode !== "independent";
      if (jointBlock) jointBlock.hidden = mode !== "joint";
    };
    for (const radio of $$<HTMLInputElement>('input[name="consentMode"]', genForm)) {
      radio.addEventListener("change", updateConsentMode);
    }
    updateConsentMode();

    // Joint table seed: one default row (all false, weight 100).
    this.renderJointRow(genForm, {
      emailMarketingConsent: false,
      groupMarketingConsent: false,
      areaMarketingConsent: false,
      otherMarketingConsent: false,
      postDirectMarketing: false,
      telephoneDirectMarketing: false,
      weight: 100,
    });
    this.refreshJointSum(genForm);
    const addRowBtn = genForm.querySelector<HTMLButtonElement>("[data-rsm-joint-add]");
    if (addRowBtn) {
      addRowBtn.onclick = (): void => {
        this.renderJointRow(genForm, {
          emailMarketingConsent: false,
          groupMarketingConsent: false,
          areaMarketingConsent: false,
          otherMarketingConsent: false,
          postDirectMarketing: false,
          telephoneDirectMarketing: false,
          weight: 0,
        });
        this.refreshJointSum(genForm);
      };
    }

    let downloadOnly = false;
    for (const btn of $$<HTMLButtonElement>("button[data-rsm-btn]", genForm)) {
      btn.addEventListener("click", () => {
        downloadOnly = btn.dataset["rsmBtn"] === "download-only";
      });
    }
    genForm.onsubmit = (e): void => {
      e.preventDefault();
      try {
        const body = this.collectGenerateBody(genForm);
        void this.generate(tenant, body, downloadOnly);
      } catch (err: unknown) {
        this.setIngestError(err instanceof Error ? err.message : String(err));
      }
      downloadOnly = false;
    };
  }

  private renderJointRow(genForm: HTMLFormElement, row: JointRow): void {
    const tbody = genForm.querySelector<HTMLTableSectionElement>("[data-rsm-joint-body]");
    if (!tbody) return;
    const tr = document.createElement("tr");
    tr.dataset["rsmJointRow"] = "1";
    const cells: string[] = CONSENT_FLAGS.map(
      (flag) => `<td><input type="checkbox" data-rsm-joint-flag="${flag}"${row[flag] ? " checked" : ""} /></td>`,
    );
    cells.push(
      `<td><input type="number" min="0" max="100" step="0.1" data-rsm-joint-weight value="${row.weight}" /></td>`,
    );
    cells.push(
      `<td><button type="button" class="rsm-btn rsm-btn-small rsm-btn-ghost" data-rsm-joint-remove>×</button></td>`,
    );
    tr.innerHTML = cells.join("");
    tbody.appendChild(tr);
    const weightInput = tr.querySelector<HTMLInputElement>("[data-rsm-joint-weight]");
    weightInput?.addEventListener("input", () => this.refreshJointSum(genForm));
    const removeBtn = tr.querySelector<HTMLButtonElement>("[data-rsm-joint-remove]");
    if (removeBtn) {
      removeBtn.onclick = (): void => {
        tr.remove();
        this.refreshJointSum(genForm);
      };
    }
  }

  private refreshJointSum(genForm: HTMLFormElement): void {
    const indicator = genForm.querySelector<HTMLElement>("[data-rsm-joint-sum]");
    if (!indicator) return;
    let sum = 0;
    for (const w of $$<HTMLInputElement>("[data-rsm-joint-weight]", genForm)) {
      const v = Number(w.value);
      if (!Number.isNaN(v)) sum += v;
    }
    indicator.textContent = `Sum: ${sum.toFixed(sum % 1 === 0 ? 0 : 1)} ${sum === 100 ? "✓" : "(must equal 100)"}`;
    indicator.classList.toggle("rsm-joint-sum-ok", sum === 100);
    indicator.classList.toggle("rsm-joint-sum-bad", sum !== 100);
  }

  private collectGenerateBody(genForm: HTMLFormElement): Record<string, unknown> {
    const count = Number((genForm.elements.namedItem("count") as HTMLInputElement).value);
    const seedRaw = (genForm.elements.namedItem("seed") as HTMLInputElement).value;
    const seed = seedRaw ? Number(seedRaw) : undefined;

    const preset = genForm.querySelector<HTMLInputElement>(
      'input[name="emailPreset"]:checked',
    )?.value ?? "distinct";
    let emailTemplate: string | undefined;
    if (preset === "custom") {
      const custom = (genForm.elements.namedItem("emailTemplate") as HTMLInputElement).value.trim();
      if (!custom) throw new Error("Custom email template is empty");
      emailTemplate = custom;
    } else {
      emailTemplate = EMAIL_PRESETS[preset];
    }
    const emailDomain = (genForm.elements.namedItem("emailDomain") as HTMLInputElement).value.trim();
    const emailBase = (genForm.elements.namedItem("emailBase") as HTMLInputElement).value.trim();

    const consentMode = genForm.querySelector<HTMLInputElement>(
      'input[name="consentMode"]:checked',
    )?.value ?? "independent";

    let consentDistribution: Record<string, unknown>;
    if (consentMode === "joint") {
      const rows = $$<HTMLTableRowElement>('tr[data-rsm-joint-row="1"]', genForm);
      const combinations = rows.map((tr) => {
        const flags: Record<string, unknown> = {};
        for (const flag of CONSENT_FLAGS) {
          flags[flag] = tr.querySelector<HTMLInputElement>(
            `input[data-rsm-joint-flag="${flag}"]`,
          )?.checked ?? false;
        }
        const weight = Number(tr.querySelector<HTMLInputElement>("[data-rsm-joint-weight]")?.value ?? "0");
        return { ...flags, weight };
      });
      const sum = combinations.reduce((s, c) => s + (c["weight"] as number), 0);
      if (Math.abs(sum - 100) > 0.01) {
        throw new Error(`Joint combination weights must sum to 100 (currently ${sum.toFixed(1)})`);
      }
      consentDistribution = { mode: "joint", combinations };
    } else {
      const dist: Record<string, unknown> = { mode: "independent" };
      for (const flag of CONSENT_FLAGS) {
        const pct = Number((genForm.elements.namedItem(flag) as HTMLInputElement).value);
        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
          throw new Error(`${flag} must be 0..100`);
        }
        dist[flag] = pct / 100;
      }
      consentDistribution = dist;
    }

    const roleProportions: Record<string, number> = {};
    for (const role of ["walkLeader", "emailSender", "viewMembershipData"] as const) {
      const pct = Number((genForm.elements.namedItem(`role-${role}`) as HTMLInputElement).value);
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        throw new Error(`${role} must be 0..100`);
      }
      roleProportions[role] = pct / 100;
    }

    const region = (genForm.elements.namedItem("region") as HTMLSelectElement | null)?.value;

    return {
      count,
      ...(seed !== undefined && !Number.isNaN(seed) ? { seed } : {}),
      ...(emailTemplate ? { emailTemplate } : {}),
      ...(emailDomain ? { emailDomain } : {}),
      ...(emailBase ? { emailBase } : {}),
      consentDistribution,
      roleProportions,
      ...(region ? { region } : {}),
    };
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
    await this.withBusy(async () => {
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
    });
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
    await this.withBusy(async () => {
      await jsonFetch<{ revoked: boolean }>(
        `/admin/api/tenants/${encodeURIComponent(tenant.code)}/tokens/${token.id}/revoke`,
        { method: "POST" },
      );
      await this.refreshTokens(tenant);
    });
  }

  private async uploadXlsx(tenant: TenantView, file: File): Promise<void> {
    this.clearIngestFeedback();
    this.setIngestProgress("Uploading…");
    await this.withBusy(async () => {
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
    });
  }

  private async generate(
    tenant: TenantView,
    body: Record<string, unknown>,
    downloadOnly: boolean,
  ): Promise<void> {
    this.clearIngestFeedback();
    this.setIngestProgress(downloadOnly ? "Generating download…" : "Generating…");
    const url = `/admin/api/tenants/${encodeURIComponent(tenant.code)}/generate`;

    await this.withBusy(async () => {
      if (downloadOnly) {
        const response = await fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, downloadOnly: true }),
        });
        if (!response.ok) {
          const message = await extractErrorMessage(response);
          this.setIngestError(message);
          return;
        }
        const blob = await response.blob();
        const count = body["count"] as number;
        this.downloadBlob(blob, `ExportAll-${tenant.code}-${count}.xlsx`);
        this.clearIngestFeedback();
        return;
      }

      try {
        const result = await jsonFetch<Record<string, unknown>>(url, {
          method: "POST",
          body: JSON.stringify(body),
        });
        this.setIngestResult(JSON.stringify(result, null, 2));
        await this.refreshTenants();
        await this.refreshMembers(tenant);
      } catch (err: unknown) {
        this.setIngestError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  private async exportInsightHub(tenant: TenantView): Promise<void> {
    this.clearIngestFeedback();
    await this.withBusy(async () => {
      const url = `/admin/api/tenants/${encodeURIComponent(tenant.code)}/export-insight-hub`;
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) {
        const message = await extractErrorMessage(response);
        this.setIngestError(message);
        return;
      }
      const blob = await response.blob();
      this.downloadBlob(blob, `InsightHub-${tenant.code}.xlsx`);
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
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

function randomPassword(length: number): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[array[i]! % alphabet.length];
  }
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Backtick-wrapped inline `code` -> <code>code</code>. Caller must pre-escape HTML. */
function renderInlineCode(escapedText: string): string {
  return escapedText.replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Render a git commit body as paragraphs + bulleted lists with inline code.
 *
 * - Splits on blank lines into blocks.
 * - A block containing any line that starts with `- ` becomes a <ul>; lines
 *   without a leading dash are treated as continuation of the previous item
 *   (so 72-char-wrapped commit bullets render as a single list item).
 * - Other blocks join soft line breaks into spaces and render as <p>.
 */
function renderCommitBody(body: string): string {
  if (!body.trim()) return "";
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const hasBullets = lines.some((l) => /^-\s/.test(l));
      if (hasBullets) {
        const items: string[] = [];
        let current: string | null = null;
        for (const line of lines) {
          if (/^-\s/.test(line)) {
            if (current !== null) items.push(current);
            current = line.replace(/^-\s+/, "");
          } else if (current !== null) {
            current += " " + line.trim();
          }
        }
        if (current !== null) items.push(current);
        const html = items
          .map((i) => `<li>${renderInlineCode(escapeHtml(i))}</li>`)
          .join("");
        return `<ul>${html}</ul>`;
      }
      const collapsed = block.replace(/\n/g, " ");
      return `<p>${renderInlineCode(escapeHtml(collapsed))}</p>`;
    })
    .join("");
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
