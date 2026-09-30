import { updateCurrentOrganization } from "@/lib/organizations/current-organization";
import type { OrganizationUpdateResponse } from "@/lib/organizations/organization-contract";
import {
  readJsonRequest,
  validateStateChangingRequest,
} from "@/lib/security/request-boundaries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const boundaryResult = validateStateChangingRequest(request);
  if (!boundaryResult.ok) {
    return Response.json({
      ok: false,
      code: "INVALID_REQUEST",
      message: boundaryResult.message,
    } satisfies OrganizationUpdateResponse, { status: boundaryResult.status });
  }

  const bodyResult = await readJsonRequest(request);
  if (!bodyResult.ok) {
    return Response.json({
      ok: false,
      code: "INVALID_REQUEST",
      message: bodyResult.message,
    } satisfies OrganizationUpdateResponse, { status: bodyResult.status });
  }

  const result = await updateCurrentOrganization(bodyResult.value);
  const status = result.ok ? 200 : result.code === "INVALID_REQUEST" ? 400 : 500;
  return Response.json(result, { status });
}
