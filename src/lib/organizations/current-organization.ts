import "server-only";

import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { organizations } from "@/db/schema";
import { validateOrganizationNameRequest, type OrganizationUpdateResponse } from "./organization-contract";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type OrganizationReader = Pick<typeof db, "select">;
type OrganizationWriter = Pick<typeof db, "update">;

export type CurrentOrganization = { id: string; name: string; slug: string };

export class CurrentOrganizationError extends Error {
  constructor(
    public readonly code: "INVALID_CONFIGURATION" | "ORGANIZATION_NOT_FOUND",
    public readonly userMessage: string,
  ) {
    super(code);
    this.name = "CurrentOrganizationError";
  }
}

export function getCurrentOrganizationId(): string {
  const value = process.env.SERVICEAUDIT_ORGANIZATION_ID?.trim();
  if (!value || !UUID_PATTERN.test(value)) {
    throw new CurrentOrganizationError("INVALID_CONFIGURATION", "Aktif kuruluş yapılandırması geçerli değil.");
  }
  return value;
}

export async function loadCurrentOrganization(database?: OrganizationReader): Promise<CurrentOrganization> {
  const organizationId = getCurrentOrganizationId();
  const connection = database ?? (await import("@/db")).db;
  const [organization] = await connection
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new CurrentOrganizationError("ORGANIZATION_NOT_FOUND", "Yapılandırılan kuruluş bulunamadı.");
  }
  return organization;
}

export async function updateCurrentOrganization(
  value: unknown,
  database?: OrganizationWriter,
): Promise<OrganizationUpdateResponse> {
  const validation = validateOrganizationNameRequest(value);
  if (!validation.ok) return { ok: false, code: "INVALID_REQUEST", message: validation.message };

  try {
    const organizationId = getCurrentOrganizationId();
    const connection = database ?? (await import("@/db")).db;
    const [updated] = await connection
      .update(organizations)
      .set({ name: validation.name, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId))
      .returning({ name: organizations.name });

    if (!updated) {
      return { ok: false, code: "SERVER_CONFIGURATION_ERROR", message: "Yapılandırılan kuruluş bulunamadı." };
    }
    return { ok: true, organization: updated, message: "Kuruluş adı güncellendi." };
  } catch (error: unknown) {
    if (error instanceof CurrentOrganizationError) {
      return { ok: false, code: "SERVER_CONFIGURATION_ERROR", message: error.userMessage };
    }
    return { ok: false, code: "DATABASE_ERROR", message: "Kuruluş adı güncellenemedi. Lütfen tekrar deneyin." };
  }
}
