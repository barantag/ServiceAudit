import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "src/app/page.tsx",
  "src/app/findings/page.tsx",
  "src/app/findings/detail/page.tsx",
  "src/app/findings/detail/not-found.tsx",
  "src/app/imports/page.tsx",
  "src/app/error.tsx",
  "src/app/not-found.tsx",
  "src/components/imports/csv-import-preview.tsx",
  "src/components/imports/import-action-section.tsx",
  "src/components/imports/data-validation-section.tsx",
  "src/components/warranties/warranty-csv-import.tsx",
  "src/components/warranties/warranty-import-action-section.tsx",
  "src/components/warranties/warranty-validation-section.tsx",
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await readFile(path, "utf8")])));

const summary = files["src/app/page.tsx"];
assert.match(summary, /summary\.totalFindingCount === 0/);
assert.match(summary, /<ManagerSummaryContent summary=\{summary\}/);
for (const href of ["/imports/new", "/warranties/new", "/imports"]) {
  assert.match(summary, new RegExp(`href: "${escapeRegex(href)}"`));
}
console.log("PASS manager normal-data and distinct no-findings paths remain available");

const findings = files["src/app/findings/page.tsx"];
assert.match(findings, /visibleFindingCount === 0/);
assert.match(findings, /filtersActive \? "Filtrelerle eşleşen bulgu yok" : "Güncel inceleme bulgusu yok"/);
assert.match(findings, /Kuruluşta bulgular mevcut olabilir/);
assert.match(findings, /href: "\/findings", label: "Filtreleri Temizle"/);
console.log("PASS findings no-data and filtered-empty states are distinguishable");

const importHistory = files["src/app/imports/page.tsx"];
assert.match(importHistory, /<ImportHistoryEmptyState hasImports=\{history\.totalImportCount > 0\}/);
assert.match(importHistory, /hasImports \? "Filtrelerle eşleşen içe aktarım yok" : "Henüz içe aktarım yok"/);
assert.match(importHistory, /href: "\/imports", label: "Filtreleri Temizle"/);
console.log("PASS import history preserves no-data and filtered-empty recovery paths");

for (const path of [
  "src/components/imports/import-action-section.tsx",
  "src/components/warranties/warranty-import-action-section.tsx",
]) {
  const source = files[path];
  assert.match(source, /state\.code === "DUPLICATE_IMPORT"/);
  assert.match(source, /Bu dosya daha önce içe aktarılmış/);
  assert.match(source, /href="\/imports"/);
  assert.match(source, /href="\/findings"/);
}
for (const path of [
  "src/components/imports/csv-import-preview.tsx",
  "src/components/warranties/warranty-csv-import.tsx",
]) {
  assert.match(files[path], /code: responseBody\.code/);
}
console.log("PASS duplicate import semantics lead to history and findings without a fake retry");

assert.match(files["src/components/imports/csv-import-preview.tsx"], /validateMappedRows/);
assert.match(files["src/components/warranties/warranty-csv-import.tsx"], /validateWarrantyRows/);
assert.match(files["src/components/imports/data-validation-section.tsx"], /result\.issues\.slice\(0, ISSUE_DISPLAY_LIMIT\)/);
assert.match(files["src/components/warranties/warranty-validation-section.tsx"], /result\.issues\.slice\(0, ISSUE_DISPLAY_LIMIT\)/);
console.log("PASS service and warranty validation paths and detailed issue limits remain intact");

assert.match(files["src/app/findings/detail/not-found.tsx"], /Bulgu bulunamadı/);
assert.match(files["src/app/findings/detail/page.tsx"], /resolveCurrentFinding\(current\.all, key\)/);
assert.match(files["src/app/not-found.tsx"], /Sayfa bulunamadı/);
console.log("PASS finding-detail and general not-found experiences remain distinct");

const errorBoundary = files["src/app/error.tsx"];
assert.match(errorBoundary, /onClick=\{reset\}/);
assert.match(errorBoundary, /console\.error\("ServiceAudit route error", error\)/);
assert.doesNotMatch(errorBoundary, /\{error\.(?:message|stack|digest)\}/);
assert.match(errorBoundary, /href="\/"/);
console.log("PASS route error boundary retries safely, logs diagnostics, and exposes no exception text");

for (const invariant of [
  /parseFindingFilters/,
  /createFindingFilterSearchParams/,
  /\/api\/findings\/export/,
  /FindingReviewAction/,
]) {
  assert.match(findings, invariant);
}
console.log("PASS findings filters, Excel export, and review workflow remain intact");

console.log("Completed 8 Pilot Reliability verification groups.");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
