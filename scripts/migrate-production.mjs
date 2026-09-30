import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to apply production migrations.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const database = drizzle(pool);
  await migrate(database, { migrationsFolder: "./drizzle" });
  console.log("Checked-in database migrations applied successfully.");
} catch {
  console.error(
    "Production database migration failed. Check database connectivity and the checked-in migrations."
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
