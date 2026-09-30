const baseUrlValue = process.env.SERVICEAUDIT_SMOKE_BASE_URL;
const username = process.env.SERVICEAUDIT_SMOKE_AUTH_USERNAME;
const password = process.env.SERVICEAUDIT_SMOKE_AUTH_PASSWORD;

if (!baseUrlValue) {
  console.error("SERVICEAUDIT_SMOKE_BASE_URL is required.");
  process.exit(1);
}

if (Boolean(username) !== Boolean(password)) {
  console.error(
    "Set both SERVICEAUDIT_SMOKE_AUTH_USERNAME and SERVICEAUDIT_SMOKE_AUTH_PASSWORD, or neither."
  );
  process.exit(1);
}

const baseUrl = new URL(baseUrlValue);
const authorization =
  username && password
    ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
    : undefined;
const headers = authorization ? { Authorization: authorization } : undefined;

const routes = ["/", "/findings", "/imports", "/warranties/new"];

for (const route of routes) {
  const response = await fetch(new URL(route, baseUrl), {
    headers,
    redirect: "manual",
  });

  if (response.status !== 200) {
    throw new Error(`${route} returned HTTP ${response.status}.`);
  }

  const body = await response.text();
  if (!body.includes("ServiceAudit")) {
    throw new Error(`${route} did not return a ServiceAudit page.`);
  }

  console.log(`PASS ${route}`);
}

const healthResponse = await fetch(new URL("/api/health", baseUrl), {
  headers,
  redirect: "manual",
});

if (healthResponse.status !== 200) {
  throw new Error(`/api/health returned HTTP ${healthResponse.status}.`);
}

const health = await healthResponse.json();
if (health.status !== "ok" || health.database !== "connected") {
  throw new Error("/api/health did not report a ready application and database.");
}

console.log("PASS /api/health");
console.log("Production smoke check passed.");
