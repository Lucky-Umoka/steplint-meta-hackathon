// Read-only check. Never print credential values, file contents or matching lines.
import nextEnv from "@next/env";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
nextEnv.loadEnvConfig(process.cwd());
const secret = process.env.MODEL_API_KEY?.trim();
if (!secret)
  throw Error(
    "Configure MODEL_API_KEY privately to scan for its actual value.",
  );
const needle = Buffer.from(secret);
const build = process.argv[2] ?? ".next-production";
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
  .toString()
  .split("\0")
  .filter(Boolean);
let files = 0,
  bundles = 0,
  history = 0;
const failures = [];
async function check(path, client = false) {
  const bytes = await readFile(path);
  files++;
  if (bytes.includes(needle))
    failures.push(`Credential value detected in ${path}`);
  if (client && bytes.includes(Buffer.from("MODEL_API_KEY")))
    failures.push(`Server credential name detected in client artifact ${path}`);
}
for (const path of tracked) {
  if (/(^|\/)\.env(?:\.|$)/.test(path) && path !== ".env.example")
    failures.push(`Environment file tracked: ${path}`);
  try {
    await check(path);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
async function scanDirectory(path, client = false) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const child = join(path, item.name);
    if (item.isDirectory()) await scanDirectory(child, client);
    else if (item.isFile()) {
      await check(child, client);
      if (client) bundles++;
    }
  }
}
await scanDirectory(join(build, "static"), true);
// Include new Phase 6 files that have not been committed yet.
await scanDirectory("scripts");
for (const file of process.argv.slice(3)) await check(file);
// Scan every reachable Git blob, including earlier commits, without placing the
// credential in command arguments or printing contents. Size bounded per blob.
const objects = execFileSync("git", ["rev-list", "--objects", "--all"], {
  maxBuffer: 32 * 1024 * 1024,
})
  .toString()
  .trim()
  .split("\n")
  .map((line) => line.split(" ")[0]);
const metadata = spawnSync(
  "git",
  ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
  {
    input: objects.join("\n") + "\n",
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  },
);
if (metadata.status !== 0) throw Error("Git history inspection failed.");
for (const line of metadata.stdout.trim().split("\n")) {
  const [id, type, size] = line.split(" ");
  if (type !== "blob") continue;
  if (Number(size) > 32 * 1024 * 1024)
    throw Error("History contains an oversized blob; manual scan required.");
  const bytes = execFileSync("git", ["cat-file", "blob", id], {
    maxBuffer: 33 * 1024 * 1024,
  });
  history++;
  if (bytes.includes(needle))
    failures.push(`Credential value detected in Git blob ${id}`);
}
console.log(
  JSON.stringify(
    {
      scannedFiles: files,
      clientArtifacts: bundles,
      historicalBlobs: history,
      findings: failures,
      scope: "Configured MODEL_API_KEY value; not a universal secret detector",
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
