// Run: node scripts/verify-findings-operations.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
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
  hasActiveFindingFilters,
  parseFindingFilters,
} = await import("../src/lib/findings/findings-operations.ts");
const {
  createFindingsWorkbook,
  FINDINGS_WORKBOOK_HEADERS,
  FINDINGS_WORKSHEET_NAME,
} = await import("../src/lib/findings/findings-workbook.ts");
const ExcelJS = (await import("exceljs")).default;

let passed = 0;
function check(name, assertion) {
  assertion();
  passed += 1;
  console.log("PASS " + name);
}

const repeated = {
  type: "repeated-failure",
  finding: {
    findingKey: "repeated-failure:previous-1:current-1",
    currentRecordId: "current-1",
    previousRecordId: "previous-1",
    locationCode: "IST-01",
    locationName: " Şişli Merkez ",
    assetCode: " POMPA-İST-01 ",
    assetType: "Pompa",
    failureType: "Basınç Düşüşü",
    previousDate: "2026-01-01",
    currentDate: "2026-01-10",
    daysBetween: 9,
    previousVendor: "Eski Servis",
    currentVendor: " Servis Çözüm ",
    previousAmount: "800.00",
    previousCurrency: "TRY",
    currentAmount: "1000.00",
    currentCurrency: "TRY",
    previousSourceFileName: "servis-ocak.csv",
    previousSourceRowNumber: 2,
    currentSourceFileName: "servis-şubat.csv",
    currentSourceRowNumber: 3,
    explanation: "Aynı ekipmanda aynı arıza 9 gün içinde tekrarlandı.",
  },
};

const duplicate = {
  type: "duplicate-service",
  finding: {
    findingKey: "duplicate-service:previous-2:current-2",
    currentRecordId: "current-2",
    previousRecordId: "previous-2",
    reasonType: "sameInvoice",
    locationCode: "ANK-01",
    locationName: "Ankara Şube",
    assetCode: "KOMP-02",
    assetType: "Kompresör",
    failureType: "Motor Arızası",
    serviceDate: "2026-02-15",
    previousVendor: "Teknik AŞ",
    currentVendor: "Teknik AŞ",
    previousInvoiceNumber: "FAT-42",
    currentInvoiceNumber: " fat-42 ",
    previousAmount: "1500.00",
    previousCurrency: "TRY",
    currentAmount: "1500.00",
    currentCurrency: "TRY",
    previousSourceFileName: "ankara-eski.csv",
    previousSourceRowNumber: 4,
    currentSourceFileName: "ankara-yeni.csv",
    currentSourceRowNumber: 7,
    explanation: "Aynı fatura numarası aynı ekipman için aynı gün tekrar kullanılmış. Kayıtların incelenmesi önerilir.",
  },
};

const abnormal = {
  type: "abnormal-price",
  finding: {
    findingKey: "abnormal-price:current-3",
    currentRecordId: "current-3",
    locationCode: "IZM-01",
    locationName: "İzmir Depo",
    assetCode: "JEN-03",
    assetType: "Jeneratör",
    failureType: "Akü",
    vendorName: "Enerji Servis",
    serviceDate: "2026-03-20",
    currentAmount: "1700.00",
    currency: "EUR",
    historicalMedian: "1100.00",
    historicalComparableRecordCount: 3,
    percentageAboveMedian: "54.5",
    oldestHistoricalDate: "2025-12-01",
    newestHistoricalDate: "2026-02-01",
    sourceFileName: "fiyatlar.csv",
    sourceRowNumber: 8,
    explanation: "Bu servis tutarı benzer kayıtların medyanından daha yüksek. İncelenmesi önerilir.",
  },
};

const warranty = {
  type: "warranty-service",
  finding: {
    findingKey: "warranty-service:current-4:warranty-1",
    serviceRecordId: "current-4",
    warrantyRecordId: "warranty-1",
    locationCode: "BUR-01",
    locationName: "Bursa Fabrika",
    assetCode: "ROBOT-04",
    assetType: "Robot",
    failureType: "Sensör",
    serviceDate: "2026-04-05",
    serviceVendor: "Robotik Bakım",
    currentServiceAmount: "900.00",
    currency: "USD",
    warrantyStartDate: "2026-01-01",
    warrantyEndDate: "2026-12-31",
    providerName: "Üretici Güvence",
    serviceSourceFileName: "robot-servis.csv",
    serviceSourceRowNumber: 9,
    warrantySourceFileName: "garantiler-türkçe.csv",
    warrantySourceRowNumber: 2,
    explanation: "Servis tarihinde aktif garanti kaydı bulunuyor. Garanti kapsamının kontrol edilmesi önerilir.",
  },
};

const findings = [repeated, duplicate, abnormal, warranty];
const reviews = new Map([
  [duplicate.finding.findingKey, { status: "confirmed" }],
  [abnormal.finding.findingKey, { status: "dismissed" }],
]);

function filtered(input = {}) {
  return filterCurrentFindings(findings, reviews, parseFindingFilters(input));
}

check("no filters returns every finding and is inactive", () => {
  const filters = parseFindingFilters({});
  assert.equal(hasActiveFindingFilters(filters), false);
  assert.equal(filterCurrentFindings(findings, reviews, filters).length, 4);
});

check("open status includes missing review rows", () => {
  assert.deepEqual(filtered({ status: "open" }).map((item) => item.finding.findingKey), [
    repeated.finding.findingKey,
    warranty.finding.findingKey,
  ]);
});

check("confirmed status returns only confirmed", () => {
  assert.deepEqual(filtered({ status: "confirmed" }).map((item) => item.finding.findingKey), [
    duplicate.finding.findingKey,
  ]);
});

check("dismissed status returns only dismissed", () => {
  assert.deepEqual(filtered({ status: "dismissed" }).map((item) => item.finding.findingKey), [
    abnormal.finding.findingKey,
  ]);
});

check("each finding type can be selected independently", () => {
  for (const finding of findings) {
    const result = filtered({ type: finding.type });
    assert.equal(result.length, 1);
    assert.equal(result[0].type, finding.type);
  }
});

check("status and type filters intersect", () => {
  assert.equal(filtered({ status: "confirmed", type: "duplicate-service" }).length, 1);
  assert.equal(filtered({ status: "open", type: "duplicate-service" }).length, 0);
});

check("asset search matches available evidence", () => {
  assert.deepEqual(filtered({ query: "pompa-ist-01" }).map((item) => item.type), ["repeated-failure"]);
});

check("location search is Turkish-character tolerant", () => {
  assert.deepEqual(filtered({ query: "sisli merkez" }).map((item) => item.type), ["repeated-failure"]);
});

check("vendor search is case and whitespace tolerant", () => {
  assert.deepEqual(filtered({ query: "   SERVİS    ÇÖZÜM  " }).map((item) => item.type), ["repeated-failure"]);
});

check("search can match warranty provider and source filename", () => {
  assert.equal(filtered({ query: "uretici guvence" })[0].type, "warranty-service");
  assert.equal(filtered({ query: "garantiler turkce.csv" })[0].type, "warranty-service");
});

check("invalid query values safely fall back to all", () => {
  const filters = parseFindingFilters({ status: "admin", type: "unknown", query: 42 });
  assert.deepEqual(filters, { status: "all", type: "all", query: "", importId: null });
  assert.equal(filterCurrentFindings(findings, reviews, filters).length, 4);
});

check("unmatched search produces a zero-result set", () => {
  assert.deepEqual(filtered({ query: "bulunmayan-deger" }), []);
});

check("stable findingKey is preserved", () => {
  const result = filtered({ type: "repeated-failure" });
  assert.equal(result[0].finding.findingKey, repeated.finding.findingKey);
});

const allWorkbookBuffer = await createFindingsWorkbook(filtered());
const allWorkbook = new ExcelJS.Workbook();
await allWorkbook.xlsx.load(Buffer.from(allWorkbookBuffer));
const allWorksheet = allWorkbook.getWorksheet(FINDINGS_WORKSHEET_NAME);

check("generated output is a valid XLSX workbook with Bulgular worksheet", () => {
  assert.deepEqual([...new Uint8Array(allWorkbookBuffer).subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.ok(allWorksheet);
  assert.equal(allWorksheet.name, "Bulgular");
});

check("workbook Turkish headers and values round-trip correctly", () => {
  assert.deepEqual(allWorksheet.getRow(1).values.slice(1), [...FINDINGS_WORKBOOK_HEADERS]);
  const values = worksheetTextValues(allWorksheet);
  for (const turkishText of [
    "Bulgu Anahtarı",
    "Bulgu Türü",
    "İnceleme Durumu",
    "Açıklama",
    "İncelenecek Tutar",
    "Mükerrer Servis Kaydı",
    "İncelenecek",
  ]) {
    assert.ok(values.includes(turkishText));
  }
});

const duplicateFiltered = filtered({ status: "confirmed", type: "duplicate-service" });
const filteredWorkbook = new ExcelJS.Workbook();
await filteredWorkbook.xlsx.load(Buffer.from(await createFindingsWorkbook(duplicateFiltered)));
const filteredWorksheet = filteredWorkbook.getWorksheet(FINDINGS_WORKSHEET_NAME);

check("XLSX contains only the current filtered result set and stable key", () => {
  assert.ok(filteredWorksheet);
  assert.equal(filteredWorksheet.rowCount - 1, duplicateFiltered.length);
  assert.equal(filteredWorksheet.getCell("A2").value, duplicate.finding.findingKey);
  const values = worksheetTextValues(filteredWorksheet);
  assert.ok(!values.includes(repeated.finding.findingKey));
  assert.ok(!values.includes(abnormal.finding.findingKey));
  assert.ok(!values.includes(warranty.finding.findingKey));
});

check("amount is numeric, currency separate, and relevant date is a real date", () => {
  assert.equal(typeof filteredWorksheet.getCell("M2").value, "number");
  assert.equal(filteredWorksheet.getCell("M2").value, 1500);
  assert.equal(filteredWorksheet.getCell("N2").value, "TRY");
  assert.ok(filteredWorksheet.getCell("L2").value instanceof Date);
  assert.equal(filteredWorksheet.getCell("L2").numFmt, "dd.mm.yyyy");
});

check("workbook has practical header, filter, freeze, width, and wrapping settings", () => {
  assert.equal(filteredWorksheet.getRow(1).font.bold, true);
  assert.equal(filteredWorksheet.views[0].state, "frozen");
  assert.equal(filteredWorksheet.views[0].ySplit, 1);
  assert.ok(filteredWorksheet.autoFilter);
  assert.ok((filteredWorksheet.getColumn(4).width ?? 0) >= 60);
  assert.equal(filteredWorksheet.getColumn(4).alignment?.wrapText, true);
});

check("XLSX keeps currencies separate and invents no financial conclusions", () => {
  const values = worksheetTextValues(allWorksheet);
  assert.ok(values.includes("TRY"));
  assert.ok(values.includes("EUR"));
  assert.ok(values.includes("USD"));
  const workbookText = values.join(" ").toLocaleLowerCase("tr-TR");
  for (const unsupportedClaim of ["tasarruf", "kayıp", "fazla ödeme", "dolandırıcılık"]) {
    assert.ok(!workbookText.includes(unsupportedClaim));
  }
  assert.ok(workbookText.includes("incelenecek tutar"));
});

function worksheetTextValues(worksheet) {
  const values = [];
  worksheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === "string") values.push(cell.value);
    });
  });
  return values;
}

console.log(`Completed ${passed} findings operations verification groups.`);
