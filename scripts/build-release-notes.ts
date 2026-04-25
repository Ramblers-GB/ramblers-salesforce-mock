/**
 * Build-time helper: snapshots git log + version into dist/build-info.json
 * so the deployed image can serve release notes without needing git or
 * .git available at runtime.
 *
 * Run as part of `npm run build`. Falls back to an empty entries array
 * if git is unavailable (e.g. CI builds without .git COPY'd in).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

interface ReleaseEntry {
  sha: string;
  author: string;
  date: string;
  subject: string;
  body: string;
}

interface BuildInfo {
  version: string;
  gitSha: string;
  generatedAt: string;
  entries: ReleaseEntry[];
}

async function readPackageVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(
      await readFile(path.resolve("package.json"), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function readGitLog(): Promise<{ entries: ReleaseEntry[]; head: string }> {
  const FS = "\x1f";
  const RS = "\x1e";
  try {
    const log = await execFileAsync(
      "git",
      [
        "-C", process.cwd(),
        "log", "-50",
        `--pretty=format:%H${FS}%an${FS}%aI${FS}%s${FS}%b${RS}`,
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    const entries = log.stdout
      .split(RS)
      .map((chunk) => chunk.replace(/^\n+/, "").trim())
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => {
        const [sha, author, date, subject, ...rest] = chunk.split(FS);
        return {
          sha: (sha ?? "").slice(0, 7),
          author: author ?? "",
          date: date ?? "",
          subject: subject ?? "",
          body: rest.join(FS).trim(),
        };
      });
    let head = "";
    try {
      const r = await execFileAsync("git", ["-C", process.cwd(), "rev-parse", "--short", "HEAD"]);
      head = r.stdout.trim();
    } catch {
      // Ignore — head stays empty.
    }
    return { entries, head };
  } catch (err) {
    process.stderr.write(`build-release-notes: git log failed (${err instanceof Error ? err.message : String(err)}). Writing empty entries.\n`);
    return { entries: [], head: "" };
  }
}

async function main(): Promise<void> {
  const version = await readPackageVersion();
  const { entries, head } = await readGitLog();
  const info: BuildInfo = {
    version,
    gitSha: head,
    generatedAt: new Date().toISOString(),
    entries,
  };
  const outPath = path.resolve("dist", "build-info.json");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(info, null, 2), "utf-8");
  process.stdout.write(`build-release-notes: wrote ${entries.length} entries (${version} @ ${head || "unknown"}) to ${outPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`build-release-notes failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
