import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classifyImportType,
  createImportHistory,
  hasActiveImportHistoryFilters,
} from "../src/lib/imports/import-history.ts";

const records = [
  createRecord({ id: "service-new", fileName: "Servis Eylül.csv", status: "completed", createdAt: "2026-09-05T09:00:00Z", serviceRecordCount: 4 }),
  createRecord({ id: "warranty", fileName: "Garanti Kayıtları.csv", status: "completed", createdAt: "2026-09-03T09:00:00Z", warrantyRecordCount: 2 }),
  createRecord({ id: "service-old", fileName: "SERVİS   Ağustos.csv", status: "pending", createdAt: "2026-08-01T09:00:00Z", serviceRecordCount: 3 }),
  createRecord({ id: "unknown", fileName: "eski.csv", status: "completed", createdAt: "2026-07-01T09:00:00Z" }),
];

assert.equal(classifyImportType(2, 0), "service");
assert.equal(classifyImportType(0, 2), "warranty");
assert.equal(classifyImportType(0, 0), "unknown");
assert.equal(classifyImportType(1, 1), "unknown");
console.log("PASS service, warranty, and ambiguous imports are classified conservatively");

const all = createImportHistory(records, {});
assert.deepEqual(all.items.map((item) => item.id), ["service-new", "warranty", "service-old", "unknown"]);
assert.equal(all.totalImportCount, 4);
assert.equal(hasActiveImportHistoryFilters(all.filters), false);
console.log("PASS history is newest-first and unfiltered totals remain accurate");

assert.deepEqual(createImportHistory(records, { type: "service" }).items.map((item) => item.id), ["service-new", "service-old"]);
assert.deepEqual(createImportHistory(records, { type: "warranty" }).items.map((item) => item.id), ["warranty"]);
assert.deepEqual(createImportHistory(records, { status: "pending" }).items.map((item) => item.id), ["service-old"]);
assert.deepEqual(createImportHistory(records, { type: "service", status: "completed" }).items.map((item) => item.id), ["service-new"]);
console.log("PASS type, status, and combined filters intersect correctly");

assert.deepEqual(createImportHistory(records, { query: "  servis   agustos " }).items.map((item) => item.id), ["service-old"]);
assert.equal(hasActiveImportHistoryFilters(createImportHistory(records, { query: "servis" }).filters), true);
console.log("PASS filename search tolerates case, whitespace, and Turkish characters");

const invalid = createImportHistory(records, { type: "other", status: "failed" });
assert.equal(invalid.filters.type, "all");
assert.equal(invalid.filters.status, "all");
assert.equal(invalid.items.length, 4);
console.log("PASS invalid query values safely fall back to all");

const empty = createImportHistory([], {});
assert.equal(empty.totalImportCount, 0);
assert.equal(empty.items.length, 0);
const filteredEmpty = createImportHistory(records, { query: "bulunmayan-dosya" });
assert.equal(filteredEmpty.totalImportCount, 4);
assert.equal(filteredEmpty.items.length, 0);
console.log("PASS no-import and filtered-empty states are distinguishable");

const loaderSource = await readFile("src/lib/imports/load-import-history.ts", "utf8");
assert.match(loaderSource, /eq\(imports\.organizationId, organizationId\)/);
assert.match(loaderSource, /eq\(serviceRecords\.organizationId, organizationId\)/);
assert.match(loaderSource, /eq\(warranties\.organizationId, organizationId\)/);
console.log("PASS import, service, and warranty reads are organization-scoped");

const headerSource = await readFile("src/components/app-header.tsx", "utf8");
assert.match(headerSource, /label: "İçe Aktarımlar", href: "\/imports"/);
const historyPageSource = await readFile("src/app/imports/page.tsx", "utf8");
assert.match(historyPageSource, /<AppHeader activeItem="imports"/);
assert.match(historyPageSource, /action="\/imports"/);
assert.doesNotMatch(historyPageSource, />\{item\.id\}</);
assert.match(historyPageSource, /key=\{item\.id\}/);
console.log("PASS shared navigation and URL-based history controls target /imports");

for (const [path, invariant] of [
  ["src/components/imports/csv-import-preview.tsx", /fetch\("\/api\/imports"/],
  ["src/components/warranties/warranty-csv-import.tsx", /fetch\("\/api\/warranty-imports"/],
]) {
  assert.match(await readFile(path, "utf8"), invariant);
}
console.log("PASS existing service and warranty import routes remain intact");

console.log("Completed 8 import history verification groups.");

function createRecord(overrides) {
  const { createdAt = "2026-01-01T00:00:00Z", ...values } = overrides;

  return {
    id: "import-id",
    fileName: "veri.csv",
    rowCount: 1,
    status: "completed",
    excludedAt: null,
    exclusionReason: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    serviceRecordCount: 0,
    warrantyRecordCount: 0,
    ...values,
    createdAt: new Date(createdAt),
  };
}
