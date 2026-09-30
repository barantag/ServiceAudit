export const MAX_ORGANIZATION_NAME_LENGTH = 255;

export type OrganizationIdentity = { name: string };

export type OrganizationUpdateResponse =
  | { ok: true; organization: OrganizationIdentity; message: string }
  | {
      ok: false;
      code: "INVALID_REQUEST" | "SERVER_CONFIGURATION_ERROR" | "DATABASE_ERROR";
      message: string;
    };

export function validateOrganizationNameRequest(value: unknown):
  | { ok: true; name: string }
  | { ok: false; message: string } {
  if (!isPlainRecord(value) || Object.keys(value).length !== 1 || typeof value.name !== "string") {
    return { ok: false, message: "Kuruluş adı isteği geçersiz." };
  }

  const name = value.name.trim();
  if (name.length === 0) return { ok: false, message: "Kuruluş adı boş bırakılamaz." };
  if (name.length > MAX_ORGANIZATION_NAME_LENGTH) {
    return { ok: false, message: `Kuruluş adı en fazla ${MAX_ORGANIZATION_NAME_LENGTH} karakter olabilir.` };
  }
  return { ok: true, name };
}

export function isOrganizationUpdateResponse(value: unknown): value is OrganizationUpdateResponse {
  if (!isPlainRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) {
    return isPlainRecord(value.organization)
      && typeof value.organization.name === "string"
      && typeof value.message === "string";
  }
  return typeof value.code === "string"
    && ORGANIZATION_ERROR_CODES.has(value.code)
    && typeof value.message === "string";
}

const ORGANIZATION_ERROR_CODES = new Set(["INVALID_REQUEST", "SERVER_CONFIGURATION_ERROR", "DATABASE_ERROR"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
