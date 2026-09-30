import { saveFindingReview } from "@/lib/findings/finding-reviews";
import type { ReviewResponse } from "@/lib/findings/review-contract";
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
    } satisfies ReviewResponse, { status: boundaryResult.status });
  }

  const bodyResult = await readJsonRequest(request);
  if (!bodyResult.ok) {
    return Response.json({
      ok: false,
      code: "INVALID_REQUEST",
      message: bodyResult.message,
    } satisfies ReviewResponse, { status: bodyResult.status });
  }

  const result = await saveFindingReview(bodyResult.value);
  const status = result.ok ? 200 : result.code === "INVALID_REQUEST" ? 400 : result.code === "FINDING_NOT_FOUND" ? 404 : 500;
  return Response.json(result, { status });
}
