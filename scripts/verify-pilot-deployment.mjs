import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  dockerfile,
  dockerignore,
  compose,
  caddyfile,
  environment,
  migration,
  smoke,
  nextConfig,
] = await Promise.all([
    read("Dockerfile"),
    read(".dockerignore"),
    read("compose.production.yml"),
    read("deploy/Caddyfile"),
    read(".env.production.example"),
    read("scripts/migrate-production.mjs"),
    read("scripts/smoke-production.mjs"),
    read("next.config.ts"),
  ]);

assert.match(nextConfig, /output:\s*["']standalone["']/);
assert.match(dockerfile, /AS runner/);
assert.match(dockerfile, /AS migrator/);
assert.match(dockerfile, /USER nextjs/g);
assert.match(dockerfile, /COPY --from=builder .*\.next\/standalone/);
assert.match(dockerfile, /COPY --chown=nextjs:nodejs drizzle \.\/drizzle/);
assert.doesNotMatch(dockerfile, /drizzle-kit/);
assert.match(dockerignore, /^\.env\*$/m);
assert.doesNotMatch(dockerignore, /^!\.env/m);
assert.doesNotMatch(dockerignore, /^drizzle\/?$/m);

assert.match(compose, /postgres-data:\/var\/lib\/postgresql\/data/);
assert.match(compose, /profiles:\s*\["operations"\]/);
assert.match(compose, /target: migrator/);
assert.match(compose, /database:\s*\r?\n\s+internal: true/);
assert.equal((compose.match(/^\s+ports:/gm) ?? []).length, 1);
assert.match(compose, /- "80:80"/);
assert.match(compose, /- "443:443"/);
assert.doesNotMatch(compose, /- "3000:3000"/);
assert.doesNotMatch(compose, /- "5432:5432"/);

assert.match(caddyfile, /basic_auth/);
assert.match(caddyfile, /reverse_proxy app:3000/);
assert.match(caddyfile, /\{\$PILOT_BASIC_AUTH_PASSWORD_HASH\}/);

assert.match(environment, /replace-with-a-strong-database-password/);
assert.match(environment, /SERVICEAUDIT_ORGANIZATION_ID=/);
assert.doesNotMatch(environment, /NEXT_PUBLIC_/);

assert.match(migration, /migrationsFolder: "\.\/drizzle"/);
assert.doesNotMatch(migration, /drizzle-kit|\bpush\b|\breset\b/);

for (const route of ["/api/health", '"/"', "/findings", "/imports", "/warranties/new"]) {
  assert.ok(smoke.includes(route), `Smoke check must include ${route}.`);
}
assert.match(smoke, /health\.status !== "ok"/);
assert.match(smoke, /health\.database !== "connected"/);

console.log("Pilot deployment foundation verification passed.");
