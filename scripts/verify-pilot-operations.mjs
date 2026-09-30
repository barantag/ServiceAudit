import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const repositoryRoot = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, repositoryRoot), "utf8");
const containerCli = process.env.SERVICEAUDIT_CONTAINER_CLI ?? "podman";
const sourceContainer = process.env.SERVICEAUDIT_RESTORE_DRILL_SOURCE_CONTAINER ?? "serviceaudit-postgres";

if (containerCli !== "docker" && containerCli !== "podman") {
  throw new Error("SERVICEAUDIT_CONTAINER_CLI must be docker or podman.");
}

const [backupScript, restoreScript, operationsDocument, deploymentDocument] =
  await Promise.all([
    read("scripts/backup-production.sh"),
    read("scripts/restore-drill.mjs"),
    read("docs/OPERATIONS.md"),
    read("docs/DEPLOYMENT.md"),
  ]);

assert.match(backupScript, /pg_dump/);
assert.match(backupScript, /--format=custom/);
assert.match(backupScript, /pg_restore --list/);
assert.match(backupScript, /SERVICEAUDIT_BACKUP_DIR/);
assert.match(backupScript, /sha256sum/);
assert.doesNotMatch(backupScript, /POSTGRES_PASSWORD=/);
assert.doesNotMatch(backupScript, /down\s+(?:--volumes|-v)|dropdb|DROP DATABASE/i);

assert.match(restoreScript, /serviceaudit-restore-drill-/);
assert.match(restoreScript, /--tmpfs/);
assert.match(restoreScript, /--exit-on-error/);
assert.match(restoreScript, /--force", "--volumes", containerName/);
assert.doesNotMatch(restoreScript, /serviceaudit-postgres/);

for (const phrase of [
  "24 hours",
  "4 hours",
  "7 daily",
  "4 weekly",
  "encrypted off-host",
  "/api/health",
  "npm audit",
]) {
  assert.ok(operationsDocument.includes(phrase), `Operations documentation must include: ${phrase}`);
}
assert.match(deploymentDocument, /OPERATIONS\.md/);

if (!process.argv.includes("--restore-drill")) {
  console.log("Pilot operations static verification passed. Use --restore-drill for the isolated database drill.");
  process.exit(0);
}

const inspection = JSON.parse(
  (await run(containerCli, ["inspect", sourceContainer])).stdout,
);
const container = inspection[0];
assert.equal(container?.State?.Running, true, `${sourceContainer} must be running.`);
const environment = new Map(
  (container.Config?.Env ?? []).map((entry) => {
    const separator = entry.indexOf("=");
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }),
);
const databaseUser = environment.get("POSTGRES_USER");
const databaseName = environment.get("POSTGRES_DB");
const postgresImage = container.ImageName ?? container.Config?.Image;
assert.ok(databaseUser && databaseName && postgresImage);

const temporaryDirectory = await mkdtemp(join(tmpdir(), "serviceaudit-restore-drill-"));
const backupFile = join(temporaryDirectory, "serviceaudit-verification.dump");

try {
  await runToFile(
    containerCli,
    [
      "exec",
      sourceContainer,
      "pg_dump",
      `--username=${databaseUser}`,
      `--dbname=${databaseName}`,
      "--format=custom",
      "--compress=6",
      "--no-owner",
      "--no-privileges",
    ],
    backupFile,
  );
  assert.ok((await stat(backupFile)).size > 0, "Verification backup must not be empty.");

  const drillResult = await run(
    process.execPath,
    [fileURLToPath(new URL("restore-drill.mjs", import.meta.url)), backupFile],
    {
      ...process.env,
      SERVICEAUDIT_CONTAINER_CLI: containerCli,
      SERVICEAUDIT_POSTGRES_IMAGE: postgresImage,
    },
  );
  assert.match(drillResult.stdout, /ServiceAudit isolated restore drill passed/);
  assert.match(drillResult.stdout, /Removed isolated restore container/);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log("Pilot backup/restore operations verification passed.");

function run(command, args, environmentVariables = process.env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      env: environmentVariables,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (exitCode) => {
      const result = {
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      };
      if (result.exitCode !== 0) {
        rejectPromise(new Error(`${command} failed: ${result.stderr || result.stdout}`));
      } else {
        resolvePromise(result);
      }
    });
  });
}

async function runToFile(command, args, outputFile) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stderrChunks = [];
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
  const exitPromise = new Promise((resolvePromise, rejectPromise) => {
    child.on("error", rejectPromise);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`${command} failed: ${Buffer.concat(stderrChunks).toString("utf8")}`));
      }
    });
  });
  await Promise.all([pipeline(child.stdout, createWriteStream(outputFile)), exitPromise]);
}
