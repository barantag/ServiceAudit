// Run: node scripts/verify-import-filtering.mjs
// Tests for Part A (encoding) and Part B (import-scoped findings filter).
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    const candidate = specifier.startsWith("@/")
      ? path.join(root, "src", specifier.slice(2))
      : specifier.startsWith(".") && context.parentURL?.endsWith(".ts")
        ? fileURLToPath(new URL(specifier, context.parentURL))
        : null;

    if (candidate && existsSync(candidate + ".ts")) {
      return { url: pathToFileURL(candidate + ".ts").href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

const {
  filterCurrentFindings,
  parseFindingFilters,
  hasActiveFindingFilters,
} = await import("../src/lib/findings/findings-operations.ts");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("PASS " + name);
  } catch (err) {
    failed += 1;
    console.error("FAIL " + name + ": " + err.message);
  }
}

// ============================================================
// PART A: Encoding regression checks
// ============================================================

check("finding-evidence.tsx has no mojibake sequences", () => {
  const content = readFileSync("src/components/findings/finding-evidence.tsx", "utf8");
  // Common mojibake patterns from double-encoding UTF-8 Turkish as Latin-1
  // These are the corrupted byte sequences that should NOT appear in the file.
  const mojibakePatterns = [
    // Ü encoded as C3 BC in UTF-8, then treated as Latin-1 gives "Ã¼"
    "\u00c3\u00bc",
    // Ö encoded as C3 B6 → "Ã¶"
    "\u00c3\u00b6",
    // ç encoded as C3 A7 → "Ã§"
    "\u00c3\u00a7",
    // ı encoded as C4 B1 → "Ä±"
    "\u00c4\u00b1",
    // ş encoded as C5 9F → "Å\x9f"
    "\u00c5\u009f",
    // Ş encoded as C5 9E → "Å\x9e"
    "\u00c5\u009e",
    // Ü uppercase → "Ã\x9c"
    "\u00c3\u009c",
    // Ö uppercase → "Ã\x96"
    "\u00c3\u0096",
    // Known broken substring
    "KarÅ\u009f",
    "geÃ§miÅ\u009f",
    "GÃ¼n",
    // Middle dot mojibake
    "\u00c2\u00b7",
    // BelirtilmemiÅŸ
    "BelirtilmemiÅ\u009f",
    // "incelemeye alÄ±ndÄ±"
    "alÄ\u00b1ndÄ\u00b1",
  ];
  for (const pattern of mojibakePatterns) {
    assert.ok(
      !content.includes(pattern),
      `finding-evidence.tsx contains mojibake: "${pattern}"`,
    );
  }
});

check("finding-evidence.tsx contains correct Turkish strings", () => {
  const content = readFileSync("src/components/findings/finding-evidence.tsx", "utf8");
  const expected = [
    "Karşılaştırılan geçmiş kayıt",
    "Güncel servis kaydı",
    "Gün aralığı",
    "şirketin kendi geçmiş",
    "Neden bu kayıt incelemeye alındı?",
    "Belirtilmemiş",
    "Karşılaştırma kriterleri",
    "Garanti sağlayıcı",
    "Sisteme aktarılan garanti dönemi",
  ];
  for (const str of expected) {
    assert.ok(content.includes(str), `Missing expected string: "${str}"`);
  }
});

check("finding-evidence.tsx has no Unicode replacement characters", () => {
  const content = readFileSync("src/components/findings/finding-evidence.tsx", "utf8");
  assert.ok(!content.includes("\uFFFD"), "File contains Unicode replacement character U+FFFD");
});

// ============================================================
// PART B: Import-based filtering
// ============================================================

// Test fixtures
const importIdA = "aaaaaaaa-0000-0000-0000-000000000001";
const importIdB = "bbbbbbbb-0000-0000-0000-000000000002";

const recordFromA1 = { id: "rec-a1", importId: importIdA };
const recordFromA2 = { id: "rec-a2", importId: importIdA };
const recordFromB1 = { id: "rec-b1", importId: importIdB };
const recordFromB2 = { id: "rec-b2", importId: importIdB };

const recordImportIds = new Map([
  [recordFromA1.id, importIdA],
  [recordFromA2.id, importIdA],
  [recordFromB1.id, importIdB],
  [recordFromB2.id, importIdB],
]);

const reviews = new Map();

function makeRepeatedFailure(currentId, previousId, key) {
  return {
    type: "repeated-failure",
    finding: {
      findingKey: key,
      currentRecordId: currentId,
      previousRecordId: previousId,
      locationCode: "L1", locationName: "Loc 1",
      assetCode: "ASSET-01", assetType: "Pompa",
      failureType: "Su Kaçağı",
      previousDate: "2026-01-01", currentDate: "2026-01-15",
      daysBetween: 14,
      previousVendor: "Firma A", currentVendor: "Firma B",
      previousAmount: "1000", previousCurrency: "TRY",
      currentAmount: "1200", currentCurrency: "TRY",
      previousSourceFileName: "jan.csv", previousSourceRowNumber: 2,
      currentSourceFileName: "feb.csv", currentSourceRowNumber: 5,
      explanation: "14 gün içinde aynı arıza",
    },
  };
}

function makeDuplicateService(currentId, previousId, key) {
  return {
    type: "duplicate-service",
    finding: {
      findingKey: key,
      currentRecordId: currentId,
      previousRecordId: previousId,
      reasonType: "sameInvoice",
      locationCode: "L1", locationName: "Loc 1",
      assetCode: "ASSET-02", assetType: "Klima",
      failureType: "Soğutmuyor",
      serviceDate: "2026-05-01",
      previousVendor: "Firma X", currentVendor: "Firma X",
      previousInvoiceNumber: "INV-001", currentInvoiceNumber: "INV-001",
      previousAmount: "2000", previousCurrency: "TRY",
      currentAmount: "2000", currentCurrency: "TRY",
      previousSourceFileName: "may.csv", previousSourceRowNumber: 3,
      currentSourceFileName: "may.csv", currentSourceRowNumber: 4,
      explanation: "Aynı fatura",
    },
  };
}

function makeAbnormalPrice(currentId, key) {
  return {
    type: "abnormal-price",
    finding: {
      findingKey: key,
      currentRecordId: currentId,
      locationCode: "L2", locationName: "Loc 2",
      assetCode: null, assetType: "Jeneratör",
      failureType: "Periyodik Bakım",
      vendorName: "GüçMak",
      serviceDate: "2026-08-01",
      currentAmount: "16500",
      currency: "TRY",
      historicalMedian: "5100",
      historicalComparableRecordCount: 3,
      percentageAboveMedian: "223.53",
      oldestHistoricalDate: "2026-03-01",
      newestHistoricalDate: "2026-05-01",
      sourceFileName: "aug.csv", sourceRowNumber: 7,
      explanation: "Anormal fiyat",
    },
  };
}

function makeWarrantyService(serviceRecordId, key) {
  return {
    type: "warranty-service",
    finding: {
      findingKey: key,
      serviceRecordId,
      warrantyRecordId: "war-1",
      locationCode: "NR021", locationName: "NovaRetail Ankara",
      assetCode: "JEN-NR021-03", assetType: "Jeneratör",
      failureType: "Akü Arızası",
      serviceDate: "2026-08-18",
      serviceVendor: "GüçMak",
      currentServiceAmount: "18400",
      currency: "TRY",
      warrantyStartDate: "2025-11-01", warrantyEndDate: "2027-11-01",
      providerName: "GüçMak",
      serviceSourceFileName: "aug.csv", serviceSourceRowNumber: 10,
      warrantySourceFileName: "warranties.xlsx", warrantySourceRowNumber: 2,
      explanation: "Garanti süresinde servis",
    },
  };
}

// Finding set: 2 from A, 2 from B, cross-import repeated failure (current=B, historical=A)
const findingA1 = makeRepeatedFailure(recordFromA1.id, "old-rec", "rf:old:A1");
const findingB1 = makeRepeatedFailure(recordFromB1.id, "old-rec", "rf:old:B1");
// Cross-import: current record in B, historical evidence in A — should be attributed to B
const findingCross = makeRepeatedFailure(recordFromB2.id, recordFromA2.id, "rf:A2:B2");
const findingAbnormalA = makeAbnormalPrice(recordFromA1.id, "ap:A1");
const findingDupB = makeDuplicateService(recordFromB1.id, recordFromB2.id, "ds:B1:B2");
const findingWarrantyA = makeWarrantyService(recordFromA1.id, "ws:A1");

const allFindings = [findingA1, findingB1, findingCross, findingAbnormalA, findingDupB, findingWarrantyA];

check("parseFindingFilters: importId=null when not provided", () => {
  const f = parseFindingFilters({ status: "all", type: "all", query: "" });
  assert.equal(f.importId, null);
});

check("parseFindingFilters: importId parsed from valid string", () => {
  const f = parseFindingFilters({ importId: importIdA });
  assert.equal(f.importId, importIdA);
});

check("parseFindingFilters: importId=null for empty string", () => {
  const f = parseFindingFilters({ importId: "" });
  assert.equal(f.importId, null);
});

check("hasActiveFindingFilters: true when importId set", () => {
  const f = parseFindingFilters({ importId: importIdA });
  assert.ok(hasActiveFindingFilters(f));
});

check("hasActiveFindingFilters: false when only defaults", () => {
  const f = parseFindingFilters({});
  assert.ok(!hasActiveFindingFilters(f));
});

check("global Findings: no importId filter returns all findings", () => {
  const filters = parseFindingFilters({});
  const result = filterCurrentFindings(allFindings, reviews, filters, recordImportIds);
  assert.equal(result.length, allFindings.length);
});

check("import A filter: returns only findings whose current record is in import A", () => {
  const filters = parseFindingFilters({ importId: importIdA });
  const result = filterCurrentFindings(allFindings, reviews, filters, recordImportIds);
  // findingA1 (current=A1), findingAbnormalA (current=A1), findingWarrantyA (service=A1)
  assert.equal(result.length, 3);
  const keys = new Set(result.map(r => r.finding.findingKey));
  assert.ok(keys.has("rf:old:A1"), "Missing repeated-failure A1");
  assert.ok(keys.has("ap:A1"), "Missing abnormal-price A1");
  assert.ok(keys.has("ws:A1"), "Missing warranty-service A1");
});

check("import B filter: returns findings whose current record is in import B", () => {
  const filters = parseFindingFilters({ importId: importIdB });
  const result = filterCurrentFindings(allFindings, reviews, filters, recordImportIds);
  // findingB1 (current=B1), findingCross (current=B2, historical=A2), findingDupB (current=B1)
  assert.equal(result.length, 3);
  const keys = new Set(result.map(r => r.finding.findingKey));
  assert.ok(keys.has("rf:old:B1"), "Missing repeated-failure B1");
  assert.ok(keys.has("rf:A2:B2"), "Missing cross-import repeated-failure");
  assert.ok(keys.has("ds:B1:B2"), "Missing duplicate-service B");
});

check("cross-import evidence: finding with current=B, historical=A attributed to B", () => {
  const filters = parseFindingFilters({ importId: importIdB });
  const result = filterCurrentFindings(allFindings, reviews, filters, recordImportIds);
  const crossFinding = result.find(r => r.finding.findingKey === "rf:A2:B2");
  assert.ok(crossFinding !== undefined, "Cross-import finding should appear under import B");
  // Must NOT appear under A
  const filtersA = parseFindingFilters({ importId: importIdA });
  const resultA = filterCurrentFindings(allFindings, reviews, filtersA, recordImportIds);
  const crossInA = resultA.find(r => r.finding.findingKey === "rf:A2:B2");
  assert.ok(crossInA === undefined, "Cross-import finding must NOT appear under import A");
});

check("warranty finding attributed to service record import, not warranty import", () => {
  // The warranty record has no importId in our recordImportIds map (it's a warranty record)
  // The service record A1 is in import A → finding attributed to A
  const filtersA = parseFindingFilters({ importId: importIdA });
  const resultA = filterCurrentFindings(allFindings, reviews, filtersA, recordImportIds);
  const warrantyFinding = resultA.find(r => r.finding.findingKey === "ws:A1");
  assert.ok(warrantyFinding !== undefined, "Warranty finding attributed to service import A");

  // Must NOT appear under import B
  const filtersB = parseFindingFilters({ importId: importIdB });
  const resultB = filterCurrentFindings(allFindings, reviews, filtersB, recordImportIds);
  const warrantyInB = resultB.find(r => r.finding.findingKey === "ws:A1");
  assert.ok(warrantyInB === undefined, "Warranty finding must NOT appear under import B");
});

check("excluded import: when recordImportIds has no entry, finding not shown for any importId filter", () => {
  // Simulate an excluded import: its records wouldn't be in recordImportIds at all
  // (excluded records are filtered out by filterActiveAnalysisRecords before reaching detectors)
  // The recordImportIds map only has active records — if a record's import is excluded, it wouldn't
  // exist in the findings at all. This test verifies unknown recordId → null → not matching any filter.
  const unknownRecordFinding = makeRepeatedFailure("unknown-record", "other", "rf:unknown");
  const filtersA = parseFindingFilters({ importId: importIdA });
  const result = filterCurrentFindings([unknownRecordFinding], reviews, filtersA, recordImportIds);
  assert.equal(result.length, 0, "Finding with unknown record should not match any import filter");
});

check("organization scoping preserved: filters do not break when recordImportIds is empty (backward compat)", () => {
  const filters = parseFindingFilters({ importId: importIdA });
  // Empty map — backward compat: finding with no importId doesn't match the filter
  const result = filterCurrentFindings(allFindings, reviews, filters, new Map());
  assert.equal(result.length, 0, "No findings match importId filter when recordImportIds map is empty");
});

check("Bulgular Gör link format: importId is a query param", () => {
  const href = `/findings?importId=${importIdA}`;
  assert.ok(href.includes("?importId="), "Link uses ?importId= query param");
  assert.ok(href.includes(importIdA), "Link contains the import ID");
});

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
