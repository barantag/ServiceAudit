import type {
  ImportApiResponse,
  ImportErrorCode,
} from "@/lib/imports/import-contract";
import {
  readMultipartFormDataRequest,
  validateImportFileSize,
  validateStateChangingRequest,
  type RequestBoundaryFailure,
} from "@/lib/security/request-boundaries";
import { importWarrantyCsvToDatabase } from "@/lib/warranties/server-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const boundaryResult = validateStateChangingRequest(request);
  if (!boundaryResult.ok) {
    return requestBoundaryErrorResponse(boundaryResult);
  }

  const formDataResult = await readMultipartFormDataRequest(request);
  if (!formDataResult.ok) {
    return requestBoundaryErrorResponse(formDataResult);
  }

  const formData = formDataResult.value;
  const fileValue = formData.get("file");
  const mappingValue = formData.get("mapping");
  const worksheetValue = formData.get("worksheet");

  if (
    !(fileValue instanceof File)
    || typeof mappingValue !== "string"
    || (worksheetValue !== null && typeof worksheetValue !== "string")
  ) {
    return errorResponse(
      "MALFORMED_REQUEST",
      "Veri dosyası ve sütun eşleme bilgisi gereklidir.",
      400,
    );
  }

  const fileSizeResult = validateImportFileSize(fileValue.size);
  if (!fileSizeResult.ok) {
    return requestBoundaryErrorResponse(fileSizeResult);
  }

  let submittedMappings: unknown;

  try {
    submittedMappings = JSON.parse(mappingValue) as unknown;
  } catch {
    return errorResponse(
      "MALFORMED_REQUEST",
      "Sütun eşleme bilgisi okunamadı.",
      400,
    );
  }

  try {
    const result = await importWarrantyCsvToDatabase({
      fileName: fileValue.name,
      fileBytes: new Uint8Array(await fileValue.arrayBuffer()),
      submittedMappings,
      selectedWorksheetName: worksheetValue,
    });

    return Response.json(result, { status: responseStatus(result) });
  } catch {
    return errorResponse(
      "DATABASE_ERROR",
      "Garanti içe aktarma işlemi tamamlanamadı. Hiçbir kayıt oluşturulmadı.",
      500,
    );
  }
}

function responseStatus(response: ImportApiResponse): number {
  if (response.ok) {
    return 201;
  }

  switch (response.code) {
    case "MALFORMED_REQUEST":
      return 400;
    case "INVALID_CSV":
    case "INVALID_MAPPING":
    case "INVALID_DATA":
      return 422;
    case "LIMIT_EXCEEDED":
      return 413;
    case "DUPLICATE_IMPORT":
      return 409;
    case "SERVER_CONFIGURATION_ERROR":
    case "DATABASE_ERROR":
      return 500;
  }
}

function requestBoundaryErrorResponse(error: RequestBoundaryFailure) {
  const code: ImportErrorCode = error.code === "REQUEST_TOO_LARGE"
    ? "LIMIT_EXCEEDED"
    : error.code === "SERVER_CONFIGURATION_ERROR"
      ? "SERVER_CONFIGURATION_ERROR"
      : "MALFORMED_REQUEST";

  return errorResponse(code, error.message, error.status);
}

function errorResponse(
  code: ImportErrorCode,
  message: string,
  status: number,
) {
  return Response.json(
    { ok: false, code, message } satisfies ImportApiResponse,
    { status },
  );
}
