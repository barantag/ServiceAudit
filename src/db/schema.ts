import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: varchar("name", { length: 255 }).notNull(),

  slug: varchar("slug", { length: 120 }).notNull().unique(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const findingReviews = pgTable(
  "finding_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    findingKey: varchar("finding_key", { length: 255 }).notNull(),
    findingType: varchar("finding_type", { length: 80 }).notNull(),
    status: varchar("status", { length: 30 }).default("open").notNull(),
    note: text("note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("finding_reviews_org_key_unique").on(table.organizationId, table.findingKey),
    index("finding_reviews_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    fileName: varchar("file_name", { length: 255 }).notNull(),

    fileHash: varchar("file_hash", { length: 64 }).notNull(),

    rowCount: integer("row_count").default(0).notNull(),

    status: varchar("status", { length: 40 }).default("pending").notNull(),

    excludedAt: timestamp("excluded_at", { withTimezone: true }),

    exclusionReason: text("exclusion_reason"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("imports_org_file_hash_unique").on(
      table.organizationId,
      table.fileHash
    ).where(sql`${table.excludedAt} is null`),
  ]
);

export const serviceRecords = pgTable("service_records", {
  id: uuid("id").defaultRandom().primaryKey(),

  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  importId: uuid("import_id").references(() => imports.id, {
    onDelete: "set null",
  }),

  locationCode: varchar("location_code", { length: 120 }),
  locationName: varchar("location_name", { length: 255 }),

  assetCode: varchar("asset_code", { length: 120 }),
  assetType: varchar("asset_type", { length: 160 }),

  vendorName: varchar("vendor_name", { length: 255 }),

  serviceDate: date("service_date").notNull(),

  failureType: varchar("failure_type", { length: 255 }),
  description: text("description"),

  amount: numeric("amount", { precision: 14, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("TRY"),

  invoiceNumber: varchar("invoice_number", { length: 120 }),

  sourceFileName: varchar("source_file_name", { length: 255 }),
  sourceRowNumber: integer("source_row_number"),

  rawData: jsonb("raw_data"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const warranties = pgTable(
  "warranties",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    importId: uuid("import_id").references(() => imports.id, {
      onDelete: "set null",
    }),

    assetCode: varchar("asset_code", { length: 120 }).notNull(),
    locationCode: varchar("location_code", { length: 120 }),

    warrantyStartDate: date("warranty_start_date").notNull(),
    warrantyEndDate: date("warranty_end_date").notNull(),

    providerName: varchar("provider_name", { length: 255 }),
    description: text("description"),

    sourceFileName: varchar("source_file_name", { length: 255 }),
    sourceRowNumber: integer("source_row_number"),
    rawData: jsonb("raw_data"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("warranties_org_asset_idx").on(
      table.organizationId,
      table.assetCode,
    ),
  ],
);
