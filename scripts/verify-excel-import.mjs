import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createImportFingerprint } from "../src/lib/imports/import-fingerprint.ts";

const paths = [
  "src/components/imports/csv-import-preview.tsx",
  "src/components/warranties/warranty-csv-import.tsx",
  "src/components/imports/worksheet-selection-section.tsx",
  "src/lib/imports/parse-import-file.ts",
  "src/lib/imports/parse-xlsx.ts",
  "src/lib/imports/server-import.ts",
  "src/lib/warranties/server-import.ts",
  "src/app/api/imports/route.ts",
  "src/app/api/warranty-imports/route.ts",
  "src/db/schema.ts",
  "src/lib/imports/import-limits.ts",
  "src/lib/security/request-boundaries.ts",
];
const files = Object.fromEntries(
  await Promise.all(
    paths.map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);

for (const path of [
  "src/components/imports/csv-import-preview.tsx",
  "src/components/warranties/warranty-csv-import.tsx",
]) {
  const source = files[path];
  assert.match(source, /accept="\.xlsx,\.csv"/);
  assert.match(source, /parseImportFile\(file\)/);
  assert.match(source, /<WorksheetSelectionSection/);
  assert.match(source, /formData\.set\("worksheet", viewState\.preview\.worksheetName\)/);
}
console.log("PASS both native file inputs and UI flows support Excel and CSV");

const selector = files["src/components/imports/worksheet-selection-section.tsx"];
assert.match(selector, /Çalışma sayfası/);
assert.match(selector, /worksheetNames\.map/);
console.log("PASS multi-sheet selection is shared by Service and Warranty");

const parser = files["src/lib/imports/parse-xlsx.ts"];
assert.match(parser, /await import\("exceljs"\)/);
assert.match(parser, /"formula" in value \|\| "sharedFormula" in value/);
assert.match(parser, /readFormulaResult\(value\.result\)/);
assert.doesNotMatch(parser, /calc|calculate|evaluate/i);
assert.match(parser, /sourceRowNumber: rowNumber/);
console.log("PASS ExcelJS is lazy-loaded, formulas use only cached results, and worksheet row numbers are preserved");

for (const path of [
  "src/lib/imports/server-import.ts",
  "src/lib/warranties/server-import.ts",
]) {
  const source = files[path];
  assert.match(source, /await parseImportFileBytes\(/);
  assert.match(source, /createImportFingerprint\(/);
  assert.match(source, /validateImportFileSize\(input\.fileBytes\.byteLength\)/);
  assert.match(source, /validateImportRowCount\(/);
}
for (const path of [
  "src/app/api/imports/route.ts",
  "src/app/api/warranty-imports/route.ts",
]) {
  assert.match(files[path], /formData\.get\("worksheet"\)/);
  assert.match(files[path], /selectedWorksheetName: worksheetValue/);
}
console.log("PASS both servers independently parse, limit, fingerprint, and receive selected worksheet identity");
assert.match(files["src/db/schema.ts"], /imports_org_file_hash_unique/);
assert.match(files["src/db/schema.ts"], /table\.organizationId,\s*table\.fileHash/);
console.log("PASS the race-safe organization and fingerprint unique index remains authoritative");

const clientLimits = files["src/lib/imports/import-limits.ts"];
const serverLimits = files["src/lib/security/request-boundaries.ts"];
for (const declaration of [
  "MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024",
  "MAX_IMPORT_REQUEST_BYTES = 11 * 1024 * 1024",
  "MAX_IMPORT_ROW_COUNT = 25_000",
]) {
  assert.ok(clientLimits.includes(declaration));
  assert.ok(serverLimits.includes(declaration));
}
console.log("PASS client early checks and authoritative server limits stay aligned");

const workbookBytes = new TextEncoder().encode("synthetic-workbook");
const csvHash = createImportFingerprint(workbookBytes, null);
const firstSheetHash = createImportFingerprint(workbookBytes, "Servis");
assert.match(csvHash, /^[a-f0-9]{64}$/);
assert.match(firstSheetHash, /^[a-f0-9]{64}$/);
assert.equal(createImportFingerprint(workbookBytes, "Servis"), firstSheetHash);
assert.notEqual(createImportFingerprint(workbookBytes, "Garanti"), firstSheetHash);
console.log("PASS fingerprints are deterministic, 64-character SHA-256 values, and worksheet-specific");

console.log("Completed Excel import focused verification.");
