import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, renameSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  GUIDE_LANGUAGES, formatGuideMarkdown, parseGuideMarkdown, parseGuideSnapshot,
  validateGuide, sameGuide, normalizeGuideText
} from "../lib/concept-guide-files.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function mergeGuideMarkdown(repository, base, site) {
  if (repository === site || site === base) return { text: repository, conflict: false };
  if (repository === base) return { text: site, conflict: false };
  const temporary = mkdtempSync(join(tmpdir(), "mathwoods-guide-merge-"));
  try {
    const paths = ["repository", "base", "site"].map((name) => join(temporary, name));
    [repository, base, site].forEach((text, index) => writeFileSync(paths[index], text, "utf8"));
    const result = spawnSync("git", [
      "merge-file", "--stdout", "--diff3", "-L", "repository", "-L", "last deployment", "-L", "site", ...paths
    ], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    if (result.error) throw result.error;
    if (result.status === null || result.status < 0 || result.status > 127) {
      throw new Error(`git merge-file failed: ${result.stderr}`);
    }
    return { text: result.stdout, conflict: result.status !== 0 };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function readProductionGuides() {
  const source = readFileSync(join(projectRoot, "scripts", "read-concept-guides.mjs"), "utf8");
  const result = spawnSync("ssh", [
    "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "ubuntu@37.156.45.153",
    "cd /opt/math-woods && docker compose --env-file .env.production -f docker-compose.infomaniak.yml exec -T app node --input-type=module"
  ], { input: source, encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 60_000, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Guide export failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  let created = false;
  try {
    writeFileSync(temporary, text, { encoding: "utf8", flag: "wx" });
    created = true;
    renameSync(temporary, path);
  } finally {
    if (created && existsSync(temporary)) rmSync(temporary);
  }
}

export function pullGuides({ root = projectRoot, remote, check = false, resolved = [] }) {
  if (remote?.version !== 1 || !remote.guides) throw new Error("Invalid production guide export.");
  if (resolved.some((language) => !GUIDE_LANGUAGES.includes(language))) throw new Error("Unsupported resolution language.");
  const directory = join(root, "content", "guides", "concepts");
  const snapshotPath = join(directory, "site-snapshot.json");
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const previous = parseGuideSnapshot(snapshot);
  const previousDeployment = snapshot.deployed
    ? parseGuideSnapshot({ version: 1, site: snapshot.deployed })
    : null;
  const conflictDirectory = join(root, "runtime", "guide-sync-conflicts");
  const site = {};
  const deployment = {};
  const writes = [];
  const conflicts = [];

  // Compute and validate BOTH languages before changing any tracked file.
  for (const language of GUIDE_LANGUAGES) {
    const record = remote.guides[language];
    if (!record || (record.deployedMarkdown !== null && typeof record.deployedMarkdown !== "string")) {
      throw new Error(`Missing deployed guide information for ${language}.`);
    }
    site[language] = record.stored === null ? null : validateGuide(record.stored, language);
    const path = join(directory, `${language}.md`);
    const original = readFileSync(path, "utf8");
    const repository = parseGuideMarkdown(original, language);
    const deployed = record.deployedMarkdown === null ? null : parseGuideMarkdown(record.deployedMarkdown, language);
    deployment[language] = deployed;
    // Use the last incorporated site version for repeated pulls on the same
    // deployment. Once the running image changes, its immutable file becomes
    // the new common ancestor. This also preserves manual conflict resolutions.
    const sameDeployment = previousDeployment
      ? sameGuide(previousDeployment[language], deployed)
      : deployed === null;
    const base = sameDeployment
      ? previous[language] ?? deployed ?? repository
      : deployed ?? previous[language] ?? repository;
    const effectiveSite = site[language] ?? deployed ?? base;
    const repositoryText = formatGuideMarkdown(repository);
    const baseText = formatGuideMarkdown(base);
    const siteText = formatGuideMarkdown(effectiveSite);
    let merged;
    if (resolved.includes(language)) {
      const receipt = JSON.parse(readFileSync(join(conflictDirectory, `${language}.json`), "utf8"));
      if (!sameGuide(receipt.site, site[language]) || receipt.effectiveMarkdown !== siteText) {
        throw new Error(`The ${language} site guide changed again. Pull without --resolve and review the new conflict.`);
      }
      merged = { text: repositoryText, conflict: false };
    } else {
      merged = mergeGuideMarkdown(repositoryText, baseText, siteText);
    }
    if (merged.conflict) {
      conflicts.push({ language, repositoryText, baseText, siteText, merged: merged.text });
    } else {
      const text = formatGuideMarkdown(parseGuideMarkdown(merged.text, language));
      if (normalizeGuideText(original) !== text) writes.push({ path, text });
    }
  }

  if (conflicts.length) {
    if (!check) {
      for (const conflict of conflicts) {
        const { language } = conflict;
        for (const [suffix, text] of [
          ["repository", conflict.repositoryText], ["base", conflict.baseText],
          ["site", conflict.siteText], ["merge", conflict.merged]
        ]) writeAtomic(join(conflictDirectory, `${language}.${suffix}.md`), text);
        writeAtomic(join(conflictDirectory, `${language}.json`), JSON.stringify({
          site: site[language], effectiveMarkdown: conflict.siteText
        }, null, 2) + "\n");
      }
    }
    throw new Error(`Guide conflict: ${conflicts.map(({ language }) => language).join(", ")}. Tracked files were left unchanged. Review runtime/guide-sync-conflicts, edit the Markdown file, then run guides:pull -- --resolve=LANGUAGE.`);
  }

  const snapshotText = JSON.stringify({ version: 1, site, deployed: deployment }, null, 2) + "\n";
  if (normalizeGuideText(readFileSync(snapshotPath, "utf8")) !== snapshotText) {
    writes.push({ path: snapshotPath, text: snapshotText });
  }
  if (!check) for (const { path, text } of writes) writeAtomic(path, text);
  return writes.map(({ path }) => path);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--check" && !arg.startsWith("--input=") && !arg.startsWith("--resolve="))) {
      throw new Error("Usage: guides:pull [--check] [--input=export.json] [--resolve=en] [--resolve=fr]");
    }
    const input = args.find((arg) => arg.startsWith("--input="))?.slice(8);
    const changed = pullGuides({
      remote: input ? JSON.parse(readFileSync(input, "utf8")) : readProductionGuides(),
      check: args.includes("--check"),
      resolved: args.filter((arg) => arg.startsWith("--resolve=")).map((arg) => arg.slice(10))
    });
    if (changed.length) {
      console.log(`Guide synchronization: ${changed.length} file(s) ${args.includes("--check") ? "need updating" : "updated"}. Review the diff before committing.`);
      if (args.includes("--check")) process.exitCode = 1;
    } else console.log("Guides are synchronized; no file changes.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
