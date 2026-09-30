import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import pg from "pg";
import {
  MAX_ORGANIZATION_NAME_LENGTH,
  validateOrganizationNameRequest,
} from "../src/lib/organizations/organization-contract.ts";

assert.deepEqual(validateOrganizationNameRequest({ name: "  Acme Enerji  " }), {
  ok: true,
  name: "Acme Enerji",
});
assert.equal(validateOrganizationNameRequest({ name: "" }).ok, false);
assert.equal(validateOrganizationNameRequest({ name: "   " }).ok, false);
assert.equal(validateOrganizationNameRequest({ name: "x".repeat(MAX_ORGANIZATION_NAME_LENGTH + 1) }).ok, false);
assert.equal(validateOrganizationNameRequest({ name: "Acme", organizationId: randomUUID() }).ok, false);
assert.equal(validateOrganizationNameRequest({ name: "Acme", slug: "other" }).ok, false);
console.log("PASS organization name validation trims and rejects empty, oversized, and injected scope fields");

const paths = [
  "src/lib/organizations/current-organization.ts",
  "src/app/api/organization/route.ts",
  "src/components/app-header.tsx",
  "src/app/settings/organization/page.tsx",
  "src/lib/findings/repeated-failure.ts",
  "src/lib/findings/load-current-findings.ts",
  "src/lib/findings/finding-reviews.ts",
  "src/lib/imports/server-import.ts",
  "src/lib/warranties/server-import.ts",
  "src/lib/imports/import-analysis-state.ts",
];
const sources = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await readFile(path, "utf8")])));
const server = sources["src/lib/organizations/current-organization.ts"];
assert.match(server, /process\.env\.SERVICEAUDIT_ORGANIZATION_ID/);
assert.match(server, /eq\(organizations\.id, organizationId\)/);
assert.match(server, /\.set\(\{ name: validation\.name, updatedAt: new Date\(\) \}\)/);
assert.doesNotMatch(server, /\.insert\(organizations\)/);
assert.doesNotMatch(server, /NEXT_PUBLIC/);
assert.match(server, /INVALID_CONFIGURATION/);
assert.match(server, /ORGANIZATION_NOT_FOUND/);
console.log("PASS server contract uses only configured UUID, updates name/timestamp, and never auto-creates organizations");

for (const path of [
  "src/lib/findings/finding-reviews.ts",
  "src/lib/imports/server-import.ts",
  "src/lib/warranties/server-import.ts",
  "src/lib/imports/import-analysis-state.ts",
]) {
  assert.match(sources[path], /getCurrentOrganizationId\(\)/);
  assert.doesNotMatch(sources[path], /process\.env\.SERVICEAUDIT_ORGANIZATION_ID/);
}
assert.match(sources["src/lib/findings/load-current-findings.ts"], /loadActiveAnalysisData\(database, organizationId\)/);
assert.match(sources["src/app/api/organization/route.ts"], /readJsonRequest\(request\)/);
assert.match(sources["src/app/api/organization/route.ts"], /updateCurrentOrganization\(bodyResult\.value\)/);
console.log("PASS imports, findings, reviews, and lifecycle operations retain centralized server-side organization scope");

const header = sources["src/components/app-header.tsx"];
assert.match(header, /Aktif kuruluş/);
assert.match(header, /href="\/settings\/organization"/);
assert.match(header, /organizationName/);
assert.doesNotMatch(header, /organizationId|SERVICEAUDIT_ORGANIZATION_ID/);
const settingsPage = sources["src/app/settings/organization/page.tsx"];
assert.match(settingsPage, /Kuruluş Ayarları/);
assert.doesNotMatch(settingsPage, /organization\.id|organization\.slug|SERVICEAUDIT_ORGANIZATION_ID/);
console.log("PASS UI exposes display identity and settings without UUID, slug, or environment details");

await verifyRollbackDatabaseBehavior();
console.log("Completed 5 current organization verification groups.");

async function verifyRollbackDatabaseBehavior() {
  dotenv.config({ path: ".env.local", quiet: true });
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const importId = randomUUID();
  const serviceId = randomUUID();
  const warrantyId = randomUUID();
  const findingKey = `abnormal-price:${serviceId}`;

  try {
    await client.query("begin");
    await client.query(
      "insert into organizations(id,name,slug) values($1,'Original Name',$2),($3,'Other Name',$4)",
      [organizationId, `qa-org-${organizationId}`, otherOrganizationId, `qa-org-${otherOrganizationId}`],
    );
    await client.query(
      "insert into imports(id,organization_id,file_name,file_hash,row_count,status) values($1,$2,'identity.csv',$3,1,'completed')",
      [importId, organizationId, "b".repeat(64)],
    );
    await client.query(
      "insert into service_records(id,organization_id,import_id,service_date,asset_code,source_file_name,source_row_number,raw_data) values($1,$2,$3,'2026-01-01','ASSET-1','identity.csv',2,$4::jsonb)",
      [serviceId, organizationId, importId, JSON.stringify({ "Ekipman Kodu": "ASSET-1" })],
    );
    await client.query(
      "insert into warranties(id,organization_id,import_id,asset_code,warranty_start_date,warranty_end_date,source_file_name,source_row_number,raw_data) values($1,$2,$3,'ASSET-1','2026-01-01','2026-12-31','identity.csv',2,$4::jsonb)",
      [warrantyId, organizationId, importId, JSON.stringify({ "Ekipman Kodu": "ASSET-1" })],
    );
    await client.query(
      "insert into finding_reviews(organization_id,finding_key,finding_type,status,note) values($1,$2,'abnormal-price','confirmed','Korunmalı')",
      [organizationId, findingKey],
    );

    const before = await ownedSnapshot(client, organizationId);
    const original = await client.query("select id,slug from organizations where id=$1", [organizationId]);
    await client.query("update organizations set name=$1,updated_at=now() where id=$2", ["Trimmed Name", organizationId]);
    const updated = await client.query("select id,name,slug from organizations where id=$1", [organizationId]);
    const other = await client.query("select name from organizations where id=$1", [otherOrganizationId]);
    const after = await ownedSnapshot(client, organizationId);

    assert.deepEqual(updated.rows[0], { id: original.rows[0].id, name: "Trimmed Name", slug: original.rows[0].slug });
    assert.equal(other.rows[0].name, "Other Name");
    assert.deepEqual(after, before);
    console.log("PASS rollback-only DB check preserves id, slug, imports, service/warranty evidence, reviews, and other organizations");
  } finally {
    await client.query("rollback");
    const remainingFixtures = await client.query(
      "select count(*)::int as count from organizations where slug = any($1::varchar[])",
      [[`qa-org-${organizationId}`, `qa-org-${otherOrganizationId}`]],
    );
    assert.equal(remainingFixtures.rows[0].count, 0);
    await client.end();
  }
}

async function ownedSnapshot(client, organizationId) {
  const imports = await client.query("select id,file_hash,row_count,status from imports where organization_id=$1 order by id", [organizationId]);
  const services = await client.query("select id,import_id,source_file_name,source_row_number,raw_data from service_records where organization_id=$1 order by id", [organizationId]);
  const warranties = await client.query("select id,import_id,source_file_name,source_row_number,raw_data from warranties where organization_id=$1 order by id", [organizationId]);
  const reviews = await client.query("select finding_key,finding_type,status,note from finding_reviews where organization_id=$1 order by finding_key", [organizationId]);
  return { imports: imports.rows, services: services.rows, warranties: warranties.rows, reviews: reviews.rows };
}
