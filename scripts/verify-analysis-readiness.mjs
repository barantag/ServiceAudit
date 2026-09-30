// Run: node scripts/verify-analysis-readiness.mjs
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

const { calculateAnalysisReadiness } = await import("../src/lib/findings/analysis-readiness.ts");

let passed = 0;

function check(name, assertion) {
  assertion();
  passed += 1;
  console.log("PASS " + name);
}

function serviceRecord(id, overrides = {}) {
  return {
    id: id || Math.random().toString(),
    assetCode: null,
    failureType: null,
    serviceDate: null,
    invoiceNumber: null,
    vendorName: null,
    amount: null,
    currency: null,
    assetType: null,
    locationCode: null,
    ...overrides
  };
}

function warrantyRecord(id, overrides = {}) {
  return {
    id: id || Math.random().toString(),
    locationCode: null,
    providerName: null,
    sourceFileName: null,
    sourceRowNumber: null,
    assetCode: null,
    warrantyStartDate: null,
    warrantyEndDate: null,
    ...overrides
  };
}

check("returns Veri gerekli for empty inputs", () => {
  const result = calculateAnalysisReadiness([], []);
  assert.ok(result.every(r => r.status === "Veri gerekli"));
});

check("Repeated failure - two unrelated records != Hazır", () => {
  const records = [
    serviceRecord("1", { assetCode: "A", failureType: "X", serviceDate: "2023-01-01" }),
    serviceRecord("2", { assetCode: "B", failureType: "Y", serviceDate: "2023-01-02" })
  ];
  const result = calculateAnalysisReadiness(records, []);
  assert.equal(result.find(r => r.type === "repeated-failure").status, "Sınırlı");
});

check("Repeated failure - comparable history outside repeat window => Hazır", () => {
  const records = [
    serviceRecord("1", { assetCode: "A", failureType: "F", serviceDate: "2023-01-01" }),
    // Outside MAX_REPEAT_INTERVAL_DAYS (30)
    serviceRecord("2", { assetCode: "A", failureType: "F", serviceDate: "2023-03-01" })
  ];
  const result = calculateAnalysisReadiness(records, []);
  assert.equal(result.find(r => r.type === "repeated-failure").status, "Hazır");
});

check("Duplicate service - unrelated invoice-bearing records != falsely Hazır", () => {
  const records = [
    serviceRecord("1", { assetCode: "A", failureType: "X", serviceDate: "2023-01-01", invoiceNumber: "INV1" }),
    serviceRecord("2", { assetCode: "B", failureType: "Y", serviceDate: "2023-01-02", invoiceNumber: "INV2" })
  ];
  const result = calculateAnalysisReadiness(records, []);
  assert.equal(result.find(r => r.type === "duplicate-service").status, "Sınırlı");
});

check("Duplicate service - comparable records but different invoice/details => Hazır", () => {
  const records = [
    serviceRecord("1", { assetCode: "A", failureType: "F", serviceDate: "2023-01-01", invoiceNumber: "INV1" }),
    // Same day, same asset, same failure, but different invoice (so it wouldn't generate a duplicate finding)
    serviceRecord("2", { assetCode: "A", failureType: "F", serviceDate: "2023-01-01", invoiceNumber: "INV2" })
  ];
  const result = calculateAnalysisReadiness(records, []);
  assert.equal(result.find(r => r.type === "duplicate-service").status, "Hazır");
});

check("Abnormal price - three records from different cohorts != Hazır", () => {
  const records = [
    serviceRecord("1", { assetType: "T1", failureType: "F1", vendorName: "V1", currency: "TRY", serviceDate: "2023-01-01", amount: "10" }),
    serviceRecord("2", { assetType: "T2", failureType: "F2", vendorName: "V2", currency: "TRY", serviceDate: "2023-01-02", amount: "20" }),
    serviceRecord("3", { assetType: "T3", failureType: "F3", vendorName: "V3", currency: "TRY", serviceDate: "2023-01-03", amount: "30" }),
  ];
  const result = calculateAnalysisReadiness(records, []);
  assert.equal(result.find(r => r.type === "abnormal-price").status, "Sınırlı");
});

check("Abnormal price - sufficient prior historical baseline + non-abnormal current amount => Hazır", () => {
  const records = [
    serviceRecord("1", { assetType: "T1", failureType: "F1", vendorName: "V1", currency: "TRY", serviceDate: "2023-01-01", amount: "10" }),
    serviceRecord("2", { assetType: "T1", failureType: "F1", vendorName: "V1", currency: "TRY", serviceDate: "2023-01-02", amount: "10" }),
    serviceRecord("3", { assetType: "T1", failureType: "F1", vendorName: "V1", currency: "TRY", serviceDate: "2023-01-03", amount: "10" }),
    // Evaluated record doesn't exceed any threshold, but is evaluable because of 3 prior records
    serviceRecord("4", { assetType: "T1", failureType: "F1", vendorName: "V1", currency: "TRY", serviceDate: "2023-01-04", amount: "10" }),
  ];
  const result = calculateAnalysisReadiness(records, []);
  assert.equal(result.find(r => r.type === "abnormal-price").status, "Hazır");
});

check("Warranty - one unrelated warranty != Hazır", () => {
  const records = [
    serviceRecord("1", { assetCode: "A", serviceDate: "2023-01-05" })
  ];
  const warranties = [
    warrantyRecord("w1", { assetCode: "B", warrantyStartDate: "2023-01-01", warrantyEndDate: "2023-12-31" })
  ];
  const result = calculateAnalysisReadiness(records, warranties);
  assert.equal(result.find(r => r.type === "warranty-service").status, "Sınırlı");
});

check("Warranty - joinable service outside supplied warranty period => Hazır", () => {
  const records = [
    // Service in August 2026
    serviceRecord("1", { assetCode: "A", serviceDate: "2026-08-01", amount: "10" })
  ];
  const warranties = [
    // Warranty in 2025
    warrantyRecord("w1", { assetCode: "A", warrantyStartDate: "2025-01-01", warrantyEndDate: "2025-12-31" })
  ];
  const result = calculateAnalysisReadiness(records, warranties);
  assert.equal(result.find(r => r.type === "warranty-service").status, "Hazır");
});

console.log(`Completed ${passed} analysis readiness verification groups.`);
