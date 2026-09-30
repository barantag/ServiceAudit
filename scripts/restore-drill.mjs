import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const POSTGRES_IMAGE = process.env.SERVICEAUDIT_POSTGRES_IMAGE ?? "postgres:17-alpine";
const containerCli = process.env.SERVICEAUDIT_CONTAINER_CLI ?? "docker";
const backupArgument = process.argv[2];
const expectedTables = [
  "finding_reviews",
  "imports",
  "organizations",
  "service_records",
  "warranties",
];

if (!backupArgument) {
  fail("Usage: node scripts/restore-drill.mjs <backup-file>");
}
if (containerCli !== "docker" && containerCli !== "podman") {
  fail("SERVICEAUDIT_CONTAINER_CLI must be docker or podman.");
}

const backupFile = resolve(backupArgument);
const backupStats = await stat(backupFile).catch(() => null);
if (!backupStats?.isFile() || backupStats.size === 0) {
  fail(`Backup file is missing or empty: ${backupFile}`);
}

const drillId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const containerName = `serviceaudit-restore-drill-${drillId}`;
const databaseName = "serviceaudit_restore_drill";
const databaseUser = "serviceaudit_restore";
const temporaryPassword = randomBytes(24).toString("base64url");
let containerCreated = false;
let drillFailure = null;

try {
  console.log("Validating PostgreSQL backup archive...");
  await runWithFileInput(
    containerCli,
    ["run", "--rm", "--interactive", "--entrypoint", "pg_restore", POSTGRES_IMAGE, "--list"],
    backupFile,
  );

  console.log(`Starting isolated restore container: ${containerName}`);
  await run(containerCli, [
    "run",
    "--detach",
    "--name",
    containerName,
    "--label",
    `com.serviceaudit.restore-drill=${drillId}`,
    "--tmpfs",
    "/var/lib/postgresql/data:rw,noexec,nosuid,size=512m",
    "--env",
    `POSTGRES_DB=${databaseName}`,
    "--env",
    `POSTGRES_USER=${databaseUser}`,
    "--env",
    `POSTGRES_PASSWORD=${temporaryPassword}`,
    POSTGRES_IMAGE,
  ]);
  containerCreated = true;

  await waitForPostgres();

  console.log("Restoring into the isolated disposable database...");
  await runWithFileInput(
    containerCli,
    [
      "exec",
      "--interactive",
      containerName,
      "pg_restore",
      `--username=${databaseUser}`,
      `--dbname=${databaseName}`,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
    ],
    backupFile,
  );

  const tableOutput = await run(containerCli, [
    "exec",
    containerName,
    "psql",
    `--username=${databaseUser}`,
    `--dbname=${databaseName}`,
    "--tuples-only",
    "--no-align",
    "--command",
    "select tablename from pg_catalog.pg_tables where schemaname = 'public' order by tablename;",
  ]);
  const restoredTables = new Set(
    tableOutput.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
  );
  const missingTables = expectedTables.filter((table) => !restoredTables.has(table));
  if (missingTables.length > 0) {
    throw new Error(`Restored database is missing expected tables: ${missingTables.join(", ")}`);
  }

  console.log(`Restore verified. Expected tables: ${expectedTables.join(", ")}`);
} catch (error) {
  drillFailure = error;
} finally {
  if (containerCreated) {
    if (!containerName.startsWith("serviceaudit-restore-drill-")) {
      drillFailure ??= new Error("Refusing to remove an unexpected container name.");
    } else {
      try {
        await run(containerCli, ["rm", "--force", "--volumes", containerName]);
        console.log(`Removed isolated restore container: ${containerName}`);
      } catch (cleanupError) {
        drillFailure ??= cleanupError;
      }
    }
  }
}

if (drillFailure) {
  fail(drillFailure instanceof Error ? drillFailure.message : "Restore drill failed.");
}

console.log("ServiceAudit isolated restore drill passed.");

async function waitForPostgres() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = await run(
      containerCli,
      [
        "exec",
        containerName,
        "pg_isready",
        `--username=${databaseUser}`,
        `--dbname=${databaseName}`,
      ],
      { allowFailure: true },
    );
    if (result.exitCode === 0) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
}

async function run(command, args, options = {}) {
  const result = await spawnAndCollect(command, args);
  if (result.exitCode !== 0 && !options.allowFailure) {
    throw new Error(formatCommandFailure(command, args, result));
  }
  return result;
}

async function runWithFileInput(command, args, inputFile) {
  const result = await spawnAndCollect(command, args, inputFile);
  if (result.exitCode !== 0) {
    throw new Error(formatCommandFailure(command, args, result));
  }
  return result;
}

function spawnAndCollect(command, args, inputFile) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: [inputFile ? "pipe" : "ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (exitCode) => {
      resolvePromise({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });

    if (inputFile && child.stdin) {
      const input = createReadStream(inputFile);
      input.on("error", rejectPromise);
      child.stdin.on("error", (error) => {
        if (error.code !== "EPIPE") {
          rejectPromise(error);
        }
      });
      input.pipe(child.stdin);
    }
  });
}

function formatCommandFailure(command, args, result) {
  const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
  return `${command} ${args.join(" ")} failed: ${detail}`;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
