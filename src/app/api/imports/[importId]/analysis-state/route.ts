import { updateImportAnalysisState } from "@/lib/imports/import-analysis-state";
import type { ImportAnalysisStateResponse } from "@/lib/imports/import-analysis-state-contract";
import {
  readJsonRequest,
  validateStateChangingRequest,
} from "@/lib/security/request-boundaries";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  const boundaryResult = validateStateChangingRequest(request);
  if (!boundaryResult.ok) {
    return Response.json({
      ok: false,
      code: "INVALID_REQUEST",
      message: boundaryResult.message,
    } satisfies ImportAnalysisStateResponse, { status: boundaryResult.status });
  }

  const bodyResult = await readJsonRequest(request);
  if (!bodyResult.ok) {
    return Response.json({
      ok: false,
      code: "INVALID_REQUEST",
      message: bodyResult.message,
    } satisfies ImportAnalysisStateResponse, { status: bodyResult.status });
  }

  const { importId } = await context.params;
  const result = await updateImportAnalysisState(importId, bodyResult.value);
  return Response.json(result, { status: responseStatus(result) });
}

function responseStatus(response: ImportAnalysisStateResponse): number {
  if (response.ok) {
    return 200;
  }

  switch (response.code) {
    case "INVALID_REQUEST":
      return 400;
    case "IMPORT_NOT_FOUND":
      return 404;
    case "INVALID_IMPORT_STATE":
    case "ACTIVE_DUPLICATE_EXISTS":
      return 409;
    case "SERVER_CONFIGURATION_ERROR":
    case "DATABASE_ERROR":
      return 500;
  }
}
