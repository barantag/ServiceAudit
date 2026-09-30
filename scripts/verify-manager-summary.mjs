// Run: node scripts/verify-manager-summary.mjs
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

const { createManagerSummary } = await import("../src/lib/findings/manager-summary.ts");
let passed = 0;

function check(name, assertion) {
  assertion();
  passed += 1;
  console.log("PASS " + name);
}

function currentFinding(type, key, serviceId, amount = null, currency = null) {
  const shared = { findingKey: key, explanation: "İncelenmesi önerilir." };

  if (type === "warranty-service") {
    return {
      type,
      finding: {
        ...shared,
        serviceRecordId: serviceId,
        currentServiceAmount: amount,
        currency,
      },
    };
  }

  if (type === "abnormal-price") {
    return {
      type,
      finding: { ...shared, currentRecordId: serviceId, currentAmount: amount, currency },
    };
  }

  return {
    type,
    finding: {
      ...shared,
      currentRecordId: serviceId,
      currentAmount: amount,
      currentCurrency: currency,
    },
  };
}

check("no findings produces zero counts and clean empty collections", () => {
  const summary = createManagerSummary([], new Map());
  assert.equal(summary.totalFindingCount, 0);
  assert.deepEqual(summary.statusCounts, { open: 0, confirmed: 0, dismissed: 0 });
  assert.equal(summary.uniqueServiceRecordCount, 0);
  assert.deepEqual(summary.reviewAmounts, []);
  assert.deepEqual(summary.priorityFindings, []);
  assert.equal(summary.typeBreakdown.length, 4);
});

const repeated = currentFinding(
  "repeated-failure",
  "repeated-failure:previous-a:service-a",
  "service-a",
  "1000.00",
  "TRY",
);
const duplicate = currentFinding(
  "duplicate-service",
  "duplicate-service:previous-a:service-a",
  "service-a",
  "1000.00",
  "try",
);
const abnormal = currentFinding(
  "abnormal-price",
  "abnormal-price:service-b",
  "service-b",
  "1500.00",
  "EUR",
);
const warrantyWithoutAmount = currentFinding(
  "warranty-service",
  "warranty-service:service-c:warranty-a",
  "service-c",
  null,
  null,
);

check("missing review rows default to open", () => {
  const summary = createManagerSummary([repeated], new Map());
  assert.equal(summary.statusCounts.open, 1);
  assert.equal(summary.priorityFindings[0].status, "open");
});

check("confirmed review moves a finding out of open", () => {
  const reviews = new Map([[repeated.finding.findingKey, { status: "confirmed" }]]);
  const summary = createManagerSummary([repeated], reviews);
  assert.deepEqual(summary.statusCounts, { open: 0, confirmed: 1, dismissed: 0 });
});

check("dismissed review increments dismissed", () => {
  const reviews = new Map([[repeated.finding.findingKey, { status: "dismissed" }]]);
  const summary = createManagerSummary([repeated], reviews);
  assert.deepEqual(summary.statusCounts, { open: 0, confirmed: 0, dismissed: 1 });
});

check("two finding types count once for unique service amount", () => {
  const summary = createManagerSummary([repeated, duplicate], new Map());
  assert.equal(summary.totalFindingCount, 2);
  assert.equal(summary.uniqueServiceRecordCount, 1);
  assert.deepEqual(summary.reviewAmounts, [{ currency: "TRY", amount: "1000.00" }]);
});

check("currencies remain separate and cents sum exactly", () => {
  const secondTry = currentFinding(
    "warranty-service",
    "warranty-service:service-d:warranty-b",
    "service-d",
    "6900.00",
    "TRY",
  );
  const summary = createManagerSummary([repeated, abnormal, secondTry], new Map());
  assert.deepEqual(summary.reviewAmounts, [
    { currency: "EUR", amount: "1500.00" },
    { currency: "TRY", amount: "7900.00" },
  ]);
});

check("finding without amount still counts but adds no monetary total", () => {
  const summary = createManagerSummary([warrantyWithoutAmount], new Map());
  assert.equal(summary.totalFindingCount, 1);
  assert.equal(summary.uniqueServiceRecordCount, 1);
  assert.deepEqual(summary.reviewAmounts, []);
});

check("type breakdown totals equal overall total", () => {
  const findings = [repeated, duplicate, abnormal, warrantyWithoutAmount];
  const summary = createManagerSummary(findings, new Map());
  assert.equal(
    summary.typeBreakdown.reduce((total, item) => total + item.total, 0),
    summary.totalFindingCount,
  );
  assert.deepEqual(summary.typeBreakdown.map((item) => item.total), [1, 1, 1, 1]);
});

check("priority list contains only open findings, amount first, maximum five", () => {
  const withoutAmount = Array.from({ length: 5 }, (_, index) => currentFinding(
    "repeated-failure",
    `repeated-failure:previous-${index}:service-${index + 10}`,
    `service-${index + 10}`,
  ));
  const confirmedKey = withoutAmount[0].finding.findingKey;
  const summary = createManagerSummary(
    [...withoutAmount, abnormal, repeated],
    new Map([[confirmedKey, { status: "confirmed" }]]),
  );
  assert.equal(summary.priorityFindings.length, 5);
  assert.ok(summary.priorityFindings.every((finding) => finding.status === "open"));
  assert.equal(summary.priorityFindings[0].findingKey, abnormal.finding.findingKey);
  assert.ok(!summary.priorityFindings.some((finding) => finding.findingKey === confirmedKey));
});

check("priority detail identity preserves the existing stable finding key", () => {
  const summary = createManagerSummary([repeated], new Map());
  assert.equal(summary.priorityFindings[0].findingKey, repeated.finding.findingKey);
  assert.equal(
    `/findings/detail?key=${encodeURIComponent(summary.priorityFindings[0].findingKey)}`,
    "/findings/detail?key=repeated-failure%3Aprevious-a%3Aservice-a",
  );
});

console.log(`Completed ${passed} manager summary verification groups.`);
