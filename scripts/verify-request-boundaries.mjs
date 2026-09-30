import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_REQUEST_BYTES,
  MAX_IMPORT_ROW_COUNT,
  MAX_JSON_REQUEST_BYTES,
  readJsonRequest,
  readMultipartFormDataRequest,
  validateImportFileSize,
  validateImportRowCount,
  validateStateChangingRequest,
} from "../src/lib/security/request-boundaries.ts";

const repositoryRoot = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, repositoryRoot), "utf8");

const publicOrigin = "https://pilot.serviceaudit.example";
const sameOriginRequest = new Request("http://app:3000/api/organization", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: publicOrigin,
  },
  body: JSON.stringify({ name: "Pilot Kuruluş" }),
});

assert.deepEqual(
  validateStateChangingRequest(sameOriginRequest, {
    publicOrigin,
    nodeEnvironment: "production",
  }),
  { ok: true },
  "Configured public origin must allow legitimate writes behind the proxy.",
);

const crossOriginResult = validateStateChangingRequest(
  new Request("http://app:3000/api/organization", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
    body: "{}",
  }),
  { publicOrigin, nodeEnvironment: "production" },
);
assert.equal(crossOriginResult.ok, false);
assert.equal(crossOriginResult.status, 403);

const missingOriginResult = validateStateChangingRequest(
  new Request("http://app:3000/api/organization", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }),
  { publicOrigin, nodeEnvironment: "production" },
);
assert.equal(missingOriginResult.ok, false);
assert.equal(missingOriginResult.status, 403);

const missingProductionOrigin = validateStateChangingRequest(
  new Request("http://app:3000/api/organization", {
    method: "POST",
    headers: { origin: "http://app:3000" },
    body: "{}",
  }),
  { publicOrigin: "", nodeEnvironment: "production" },
);
assert.equal(missingProductionOrigin.ok, false);
assert.equal(missingProductionOrigin.status, 500);

const jsonResult = await readJsonRequest(sameOriginRequest.clone());
assert.deepEqual(jsonResult, { ok: true, value: { name: "Pilot Kuruluş" } });

const oversizedJsonResult = await readJsonRequest(
  new Request("http://localhost:3000/api/organization", {
    method: "POST",
    headers: {
      "content-length": String(MAX_JSON_REQUEST_BYTES + 1),
      "content-type": "application/json",
    },
    body: "{}",
  }),
);
assert.equal(oversizedJsonResult.ok, false);
assert.equal(oversizedJsonResult.status, 413);

const formData = new FormData();
formData.set("mapping", "[]");
formData.set(
  "file",
  new File(["Servis Tarihi,Tutar\n2026-09-12,1500\n"], "normal.csv", {
    type: "text/csv",
  }),
);
const multipartRequest = new Request("http://localhost:3000/api/imports", {
  method: "POST",
  body: formData,
});
const multipartResult = await readMultipartFormDataRequest(multipartRequest);
assert.equal(multipartResult.ok, true);
if (multipartResult.ok) {
  assert.equal(multipartResult.value.get("mapping"), "[]");
  const file = multipartResult.value.get("file");
  assert.ok(file instanceof File);
  assert.equal(file.name, "normal.csv");
}

assert.deepEqual(validateImportFileSize(MAX_IMPORT_FILE_BYTES), { ok: true });
assert.equal(validateImportFileSize(MAX_IMPORT_FILE_BYTES + 1).status, 413);
assert.deepEqual(validateImportRowCount(MAX_IMPORT_ROW_COUNT), { ok: true });
assert.equal(validateImportRowCount(MAX_IMPORT_ROW_COUNT + 1).status, 413);
assert.ok(MAX_IMPORT_REQUEST_BYTES > MAX_IMPORT_FILE_BYTES);

const routeRoot = new URL("../src/app/api/", import.meta.url);
const routeFiles = await findRouteFiles(routeRoot);
const stateChangingRoutes = [];
for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");
  if (/export async function (POST|PUT|PATCH|DELETE)\b/.test(source)) {
    stateChangingRoutes.push(routeFile.href);
    assert.match(
      source,
      /validateStateChangingRequest\(request\)/,
      `${routeFile} must use the shared same-origin boundary.`,
    );
  }
}
assert.equal(stateChangingRoutes.length, 5);

const [serviceImport, warrantyImport, importContract, nextConfig, caddyfile] =
  await Promise.all([
    read("src/lib/imports/server-import.ts"),
    read("src/lib/warranties/server-import.ts"),
    read("src/lib/imports/import-contract.ts"),
    read("next.config.ts"),
    read("deploy/Caddyfile"),
  ]);

for (const source of [serviceImport, warrantyImport]) {
  assert.match(source, /validateImportFileSize\(input\.fileBytes\.byteLength\)/);
  assert.match(source, /validateImportRowCount\(/);
}
assert.match(importContract, /"LIMIT_EXCEEDED"/);
assert.match(nextConfig, /X-Content-Type-Options/);
assert.match(nextConfig, /X-Frame-Options/);
assert.doesNotMatch(nextConfig, /Content-Security-Policy/);
assert.match(caddyfile, /request_body\s*\{\s*max_size 12MB/s);
assert.match(caddyfile, /Strict-Transport-Security/);

console.log("Request/security boundary verification passed.");

async function findRouteFiles(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryUrl = new URL(
      entry.isDirectory() ? `${entry.name}/` : entry.name,
      directoryUrl,
    );
    if (entry.isDirectory()) {
      files.push(...await findRouteFiles(entryUrl));
    } else if (entry.name === "route.ts") {
      files.push(entryUrl);
    }
  }
  return files;
}
