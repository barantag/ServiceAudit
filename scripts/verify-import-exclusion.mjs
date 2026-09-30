import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import pg from "pg";
import { filterActiveAnalysisRecords } from "../src/lib/imports/active-analysis.ts";
import {
  MAX_EXCLUSION_REASON_LENGTH,
  validateImportAnalysisStateRequest,
} from "../src/lib/imports/import-analysis-state-contract.ts";
import { detectRepeatedFailureFindings } from "../src/lib/findings/repeated-failure.ts";
import { createManagerSummary } from "../src/lib/findings/manager-summary.ts";

const activeImport = { id: "active-import", excludedAt: null };
const excludedImport = { id: "excluded-import", excludedAt: new Date("2026-09-01T00:00:00Z") };
const previous = serviceRecord({ id: "service-previous", importId: null, serviceDate: "2026-01-01" });
const current = serviceRecord({ id: "service-current", importId: activeImport.id, serviceDate: "2026-01-10" });

const activeRecords = filterActiveAnalysisRecords([previous, current], [activeImport]);
const activeFindings = detectRepeatedFailureFindings(activeRecords);
assert.equal(activeFindings.length, 1);
assert.equal(activeFindings[0].currentRecordId, current.id);
console.log("PASS active imports participate and NULL importId legacy records remain active");

const excludedRecords = filterActiveAnalysisRecords(
  [previous, { ...current, importId: excludedImport.id }],
  [excludedImport],
);
assert.deepEqual(excludedRecords.map((record) => record.id), [previous.id]);
assert.equal(detectRepeatedFailureFindings(excludedRecords).length, 0);
console.log("PASS excluded service imports stop participating in analysis");

const restoredRecords = filterActiveAnalysisRecords(
  [previous, current],
  [{ ...activeImport, id: current.importId }],
);
const restoredFindings = detectRepeatedFailureFindings(restoredRecords);
assert.equal(restoredFindings[0].currentRecordId, current.id);
assert.equal(restoredFindings[0].findingKey, activeFindings[0].findingKey);
console.log("PASS restoration returns the same source record IDs and stable finding key");

const warranty = warrantyRecord({ importId: excludedImport.id });
assert.equal(filterActiveAnalysisRecords([warranty], [excludedImport]).length, 0);
assert.equal(
  filterActiveAnalysisRecords(
    [warranty],
    [{ id: excludedImport.id, excludedAt: null }],
  ).length,
  1,
);
console.log("PASS excluded warranty imports stop participating and restoration re-enables them");

const activeSummary = createManagerSummary(
  activeFindings.map((finding) => ({ type: "repeated-failure", finding })),
  new Map(),
);
const excludedSummary = createManagerSummary([], new Map());
assert.equal(activeSummary.totalFindingCount, 1);
assert.equal(excludedSummary.totalFindingCount, 0);
console.log("PASS manager summary recalculates from the active finding set");

assert.deepEqual(validateImportAnalysisStateRequest({ action: "exclude", reason: "  Test   verisi  " }), {
  ok: true,
  request: { action: "exclude", reason: "Test verisi" },
});
assert.equal(validateImportAnalysisStateRequest({ action: "exclude", reason: "   " }).ok, false);
assert.equal(validateImportAnalysisStateRequest({
  action: "exclude",
  reason: "x".repeat(MAX_EXCLUSION_REASON_LENGTH + 1),
}).ok, false);
assert.deepEqual(validateImportAnalysisStateRequest({ action: "restore", reason: "ignored" }), {
  ok: true,
  request: { action: "restore", reason: null },
});
console.log("PASS exclusion requires a bounded human-readable reason");

const sources = Object.fromEntries(await Promise.all([
  "src/db/schema.ts",
  "src/lib/imports/load-active-analysis-data.ts",
  "src/lib/imports/import-analysis-state.ts",
  "src/lib/imports/server-import.ts",
  "src/lib/warranties/server-import.ts",
  "src/lib/findings/load-current-findings.ts",
  "src/lib/findings/load-findings-operations.ts",
  "src/lib/findings/finding-reviews.ts",
  "src/app/page.tsx",
  "src/app/findings/detail/page.tsx",
  "src/app/api/findings/export/route.ts",
  "src/app/imports/page.tsx",
  "src/components/imports/import-analysis-state-action.tsx",
  "drizzle/0005_previous_wallow.sql",
].map(async (path) => [path, await readFile(path, "utf8")])));

const activeLoader = sources["src/lib/imports/load-active-analysis-data.ts"];
for (const tableName of ["imports", "serviceRecords", "warranties"]) {
  assert.match(activeLoader, new RegExp(`eq\\(${tableName}\\.organizationId, organizationId\\)`));
}
assert.match(activeLoader, /filterActiveAnalysisRecords\(serviceRows, importStates\)/);
assert.match(activeLoader, /filterActiveAnalysisRecords\(warrantyRows, importStates\)/);
assert.match(sources["src/lib/findings/load-current-findings.ts"], /loadActiveAnalysisData\(database, organizationId\)/);
console.log("PASS active-data loading is centralized and organization-scoped");

const lifecycleSource = sources["src/lib/imports/import-analysis-state.ts"];
assert.match(lifecycleSource, /eq\(imports\.organizationId, organizationId\)/);
assert.match(lifecycleSource, /targetImport\.status !== "completed"/);
assert.match(lifecycleSource, /isNull\(imports\.excludedAt\)/);
assert.match(lifecycleSource, /isNotNull\(imports\.excludedAt\)/);
assert.match(lifecycleSource, /ACTIVE_DUPLICATE_EXISTS/);
assert.doesNotMatch(lifecycleSource, /\.delete\(/);
assert.doesNotMatch(lifecycleSource, /findingReviews/);
console.log("PASS lifecycle writes are scoped, completed-only, reversible, and do not delete evidence or reviews");

for (const path of ["src/lib/imports/server-import.ts", "src/lib/warranties/server-import.ts"]) {
  assert.match(sources[path], /eq\(imports\.fileHash, fileHash\)[\s\S]*isNull\(imports\.excludedAt\)/);
}
const migration = sources["drizzle/0005_previous_wallow.sql"];
assert.match(migration, /ADD COLUMN "excluded_at" timestamp with time zone/);
assert.match(migration, /ADD COLUMN "exclusion_reason" text/);
assert.match(migration, /CREATE UNIQUE INDEX "imports_org_file_hash_unique"[\s\S]*WHERE "imports"\."excluded_at" is null/);
console.log("PASS duplicate protection applies to active imports with a race-safe partial unique index");

for (const path of [
  "src/lib/findings/load-findings-operations.ts",
  "src/lib/findings/finding-reviews.ts",
  "src/app/page.tsx",
  "src/app/findings/detail/page.tsx",
  "src/app/api/findings/export/route.ts",
]) {
  assert.match(sources[path], /loadCurrentFindings|loadFindingsOperations/);
}
console.log("PASS manager, finding detail, review resolution, and export share current active findings");

const historyPage = sources["src/app/imports/page.tsx"];
const actionComponent = sources["src/components/imports/import-analysis-state-action.tsx"];
for (const label of ["Analizde", "Analiz Dışı", "Analizden Çıkar", "Analize Geri Al"]) {
  assert.match(`${historyPage}\n${actionComponent}`, new RegExp(label));
}
assert.match(actionComponent, /Kaynak kayıtlar, ham satır değerleri ve inceleme kararları silinmez/);
assert.match(actionComponent, /Güncel bulgular ve yönetici özeti/);
console.log("PASS history UI distinguishes analysis state and communicates evidence/recalculation effects");

if (process.argv.includes("--database")) {
  await verifyDatabaseMigrationAndConstraint();
}

console.log("Completed 10 import exclusion verification groups.");

function serviceRecord(overrides) {
  return {
    id: "service-id",
    organizationId: "organization-id",
    importId: null,
    locationCode: "L-1",
    locationName: "Merkez",
    assetCode: "A-1",
    assetType: "Kompresör",
    vendorName: "Servis A",
    serviceDate: "2026-01-01",
    failureType: "Basınç",
    description: null,
    amount: "100.00",
    currency: "TRY",
    invoiceNumber: null,
    sourceFileName: "servis.csv",
    sourceRowNumber: 2,
    rawData: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function warrantyRecord(overrides) {
  return {
    id: "warranty-id",
    organizationId: "organization-id",
    importId: null,
    assetCode: "A-1",
    locationCode: "L-1",
    warrantyStartDate: "2026-01-01",
    warrantyEndDate: "2026-12-31",
    providerName: "Garanti A",
    description: null,
    sourceFileName: "garanti.csv",
    sourceRowNumber: 2,
    rawData: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function verifyDatabaseMigrationAndConstraint() {
  dotenv.config({ path: ".env.local" });
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for --database verification");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const columns = await client.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'imports'
        and column_name in ('excluded_at', 'exclusion_reason')
      order by column_name
    `);
    assert.deepEqual(columns.rows.map((row) => row.column_name), ["excluded_at", "exclusion_reason"]);

    const index = await client.query(`
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'imports'
        and indexname = 'imports_org_file_hash_unique'
    `);
    assert.equal(index.rowCount, 1);
    assert.match(index.rows[0].indexdef, /UNIQUE/);
    assert.match(index.rows[0].indexdef, /WHERE \(excluded_at IS NULL\)/i);

    await client.query("begin");
    const firstOrganizationId = randomUUID();
    const secondOrganizationId = randomUUID();
    const hash = "a".repeat(64);
    await client.query(
      "insert into organizations (id, name, slug) values ($1, $2, $3), ($4, $5, $6)",
      [firstOrganizationId, "QA exclusion one", `qa-exclusion-${firstOrganizationId}`, secondOrganizationId, "QA exclusion two", `qa-exclusion-${secondOrganizationId}`],
    );
    await client.query(
      "insert into imports (organization_id, file_name, file_hash, row_count, status) values ($1, 'active.csv', $2, 1, 'completed')",
      [firstOrganizationId, hash],
    );
    await client.query(
      "insert into imports (organization_id, file_name, file_hash, row_count, status, excluded_at, exclusion_reason) values ($1, 'excluded.csv', $2, 1, 'completed', now(), 'QA rollback-only fixture')",
      [firstOrganizationId, hash],
    );
    await client.query(
      "insert into imports (organization_id, file_name, file_hash, row_count, status) values ($1, 'other-org.csv', $2, 1, 'completed')",
      [secondOrganizationId, hash],
    );

    await client.query("savepoint duplicate_check");
    let duplicateRejected = false;
    try {
      await client.query(
        "insert into imports (organization_id, file_name, file_hash, row_count, status) values ($1, 'duplicate.csv', $2, 1, 'completed')",
        [firstOrganizationId, hash],
      );
    } catch (error) {
      duplicateRejected = error?.code === "23505";
      await client.query("rollback to savepoint duplicate_check");
    }
    assert.equal(duplicateRejected, true);

    await client.query("savepoint restore_check");
    let restoreRejected = false;
    try {
      await client.query(
        "update imports set excluded_at = null, exclusion_reason = null where organization_id = $1 and file_name = 'excluded.csv'",
        [firstOrganizationId],
      );
    } catch (error) {
      restoreRejected = error?.code === "23505";
      await client.query("rollback to savepoint restore_check");
    }
    assert.equal(restoreRejected, true);

    await client.query("rollback");
    console.log("PASS migrated PostgreSQL schema allows excluded duplicates, isolates organizations, and rejects active/restore conflicts");
  } finally {
    try {
      await client.query("rollback");
    } catch {
      // The transaction may already be rolled back.
    }
    client.release();
    await pool.end();
  }
}
