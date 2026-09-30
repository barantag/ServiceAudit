import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(await Promise.all([
  "src/components/app-header.tsx",
  "src/app/page.tsx",
  "src/app/findings/page.tsx",
  "src/app/findings/detail/page.tsx",
  "src/app/imports/page.tsx",
  "src/components/imports/csv-import-preview.tsx",
  "src/components/warranties/warranty-csv-import.tsx",
].map(async (path) => [path, await readFile(path, "utf8")])))

const header = files["src/components/app-header.tsx"];
const expectedNavigation = [
  ["summary", "Yönetici Özeti", "/"],
  ["findings", "Bulgular", "/findings"],
  ["imports", "İçe Aktarımlar", "/imports"],
  ["service-import", "Servis Verisi Yükle", "/imports/new"],
  ["warranty-import", "Garanti Verisi Yükle", "/warranties/new"],
];

for (const [key, label, href] of expectedNavigation) {
  assert.match(header, new RegExp(`key: "${key}", label: "${label}", href: "${href.replace("/", "\\/")}"`));
}
assert.match(header, /aria-current=\{isCurrent \? "page" : undefined\}/);
console.log("PASS shared navigation exposes the required routes and current-page state");

const activePageChecks = [
  ["src/app/page.tsx", "summary"],
  ["src/app/findings/page.tsx", "findings"],
  ["src/app/findings/detail/page.tsx", "findings"],
  ["src/app/imports/page.tsx", "imports"],
  ["src/components/imports/csv-import-preview.tsx", "service-import"],
  ["src/components/warranties/warranty-csv-import.tsx", "warranty-import"],
];
for (const [path, activeItem] of activePageChecks) {
  assert.match(files[path], new RegExp(`<AppHeader[\\s\\S]*?activeItem="${activeItem}"`));
}
console.log("PASS all primary experiences identify the active navigation item");

const summary = files["src/app/page.tsx"];
assert.match(summary, /createManagerSummary\(current\.all, reviews\)/);
assert.match(summary, /href="\/findings"/);
console.log("PASS manager summary calculation and findings CTA remain intact");

const findings = files["src/app/findings/page.tsx"];
for (const invariant of [
  /parseFindingFilters/,
  /createFindingFilterSearchParams/,
  /name="status"/,
  /name="type"/,
  /name="q"/,
  /\/api\/findings\/export/,
  /FindingReviewAction/,
]) {
  assert.match(findings, invariant);
}
console.log("PASS findings filters, search, Excel export, and review actions remain intact");

const detail = files["src/app/findings/detail/page.tsx"];
assert.match(detail, /resolveCurrentFinding\(current\.all, key\)/);
assert.match(detail, /<ReviewForm key=\{key\} findingKey=\{key\}/);
assert.match(detail, /href="\/findings"/);
console.log("PASS finding detail resolves stable identity, review form, and back action");

const serviceImport = files["src/components/imports/csv-import-preview.tsx"];
for (const invariant of [
  /parseImportFile\(file\)/,
  /validateMappedRows/,
  /fetch\("\/api\/imports"/,
  /createSubmittedColumnMappings/,
  /<ImportActionSection/,
]) {
  assert.match(serviceImport, invariant);
}

const warrantyImport = files["src/components/warranties/warranty-csv-import.tsx"];
for (const invariant of [
  /parseImportFile\(file\)/,
  /validateWarrantyRows/,
  /fetch\("\/api\/warranty-imports"/,
  /createSubmittedWarrantyColumnMappings/,
  /<WarrantyImportActionSection/,
]) {
  assert.match(warrantyImport, invariant);
}
console.log("PASS service and warranty import parsing, validation, mapping, and API paths remain intact");

console.log("Completed 6 Pilot UX verification groups.");
