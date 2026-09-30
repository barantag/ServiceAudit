const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const MAX_JSON_REQUEST_BYTES = 16 * 1024;
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_REQUEST_BYTES = 11 * 1024 * 1024;
export const MAX_IMPORT_ROW_COUNT = 25_000;

export type RequestBoundaryFailure = {
  ok: false;
  code:
    | "INVALID_REQUEST"
    | "CROSS_ORIGIN_REQUEST"
    | "REQUEST_TOO_LARGE"
    | "SERVER_CONFIGURATION_ERROR";
  status: 400 | 403 | 413 | 500;
  message: string;
};

export type RequestBoundaryResult =
  | { ok: true }
  | RequestBoundaryFailure;

export type RequestBodyResult<T> =
  | { ok: true; value: T }
  | RequestBoundaryFailure;

type SameOriginOptions = {
  publicOrigin?: string;
  nodeEnvironment?: string;
};

export function validateStateChangingRequest(
  request: Request,
  options: SameOriginOptions = {},
): RequestBoundaryResult {
  if (SAFE_HTTP_METHODS.has(request.method.toUpperCase())) {
    return { ok: true };
  }

  const expectedOriginResult = resolveExpectedOrigin(request, options);
  if (!expectedOriginResult.ok) {
    return expectedOriginResult;
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return crossOriginFailure();
  }

  const suppliedOrigin = request.headers.get("origin");
  const suppliedReferer = request.headers.get("referer");
  const sourceOrigin = suppliedOrigin
    ? parseRequestOrigin(suppliedOrigin)
    : suppliedReferer
      ? parseRequestOrigin(suppliedReferer)
      : null;

  if (sourceOrigin !== expectedOriginResult.origin) {
    return crossOriginFailure();
  }

  return { ok: true };
}

export async function readJsonRequest(
  request: Request,
  maxBytes = MAX_JSON_REQUEST_BYTES,
): Promise<RequestBodyResult<unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return invalidRequestFailure("İstek JSON biçiminde olmalıdır.");
  }

  const bodyResult = await readRequestBytes(request, maxBytes);
  if (!bodyResult.ok) {
    return bodyResult;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      bodyResult.value,
    );
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return invalidRequestFailure("İstek bilgisi okunamadı.");
  }
}

export async function readMultipartFormDataRequest(
  request: Request,
  maxBytes = MAX_IMPORT_REQUEST_BYTES,
): Promise<RequestBodyResult<FormData>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return invalidRequestFailure("İstek form verisi okunamadı.");
  }

  const bodyResult = await readRequestBytes(request, maxBytes);
  if (!bodyResult.ok) {
    return bodyResult;
  }

  try {
    const bodyBuffer = new ArrayBuffer(bodyResult.value.byteLength);
    new Uint8Array(bodyBuffer).set(bodyResult.value);
    const response = new Response(bodyBuffer, {
      headers: { "content-type": contentType },
    });
    return { ok: true, value: await response.formData() };
  } catch {
    return invalidRequestFailure("İstek form verisi okunamadı.");
  }
}

export function validateImportFileSize(
  byteLength: number,
): RequestBoundaryResult {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > MAX_IMPORT_FILE_BYTES
  ) {
    return requestTooLargeFailure(
      "Veri dosyası en fazla 10 MB olabilir. Dosya küçültülmeden içe aktarma yapılmadı.",
    );
  }

  return { ok: true };
}

export function validateImportRowCount(rowCount: number): RequestBoundaryResult {
  if (
    !Number.isSafeInteger(rowCount) ||
    rowCount < 0 ||
    rowCount > MAX_IMPORT_ROW_COUNT
  ) {
    return requestTooLargeFailure(
      "Bir veri dosyasında en fazla 25.000 veri satırı olabilir. Hiçbir satır içe aktarılmadı.",
    );
  }

  return { ok: true };
}

async function readRequestBytes(
  request: Request,
  maxBytes: number,
): Promise<RequestBodyResult<Uint8Array>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    return {
      ok: false,
      code: "SERVER_CONFIGURATION_ERROR",
      status: 500,
      message: "Sunucu istek sınırı yapılandırması geçerli değil.",
    };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return invalidRequestFailure("İstek boyutu bilgisi geçerli değil.");
    }

    if (Number(contentLength) > maxBytes) {
      return requestTooLargeFailure(
        "İstek izin verilen boyut sınırını aşıyor.",
      );
    }
  }

  if (!request.body) {
    return { ok: true, value: new Uint8Array() };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return requestTooLargeFailure(
          "İstek izin verilen boyut sınırını aşıyor.",
        );
      }

      chunks.push(value);
    }
  } catch {
    return invalidRequestFailure("İstek gövdesi okunamadı.");
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, value: bytes };
}

function resolveExpectedOrigin(
  request: Request,
  options: SameOriginOptions,
): { ok: true; origin: string } | RequestBoundaryFailure {
  const configuredOrigin =
    options.publicOrigin ?? process.env.SERVICEAUDIT_PUBLIC_ORIGIN;
  const nodeEnvironment = options.nodeEnvironment ?? process.env.NODE_ENV;

  if (configuredOrigin !== undefined && configuredOrigin.trim().length > 0) {
    const parsedOrigin = parseConfiguredPublicOrigin(configuredOrigin);
    if (!parsedOrigin) {
      return {
        ok: false,
        code: "SERVER_CONFIGURATION_ERROR",
        status: 500,
        message: "Sunucu istek güvenliği yapılandırması geçerli değil.",
      };
    }

    return { ok: true, origin: parsedOrigin };
  }

  if (nodeEnvironment === "production") {
    return {
      ok: false,
      code: "SERVER_CONFIGURATION_ERROR",
      status: 500,
      message: "Sunucu istek güvenliği yapılandırması eksik.",
    };
  }

  try {
    return { ok: true, origin: new URL(request.url).origin };
  } catch {
    return invalidRequestFailure("İstek adresi geçerli değil.");
  }
}

function parseConfiguredPublicOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.pathname !== "/" ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function parseRequestOrigin(value: string): string | null {
  if (value === "null") {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function invalidRequestFailure(message: string): RequestBoundaryFailure {
  return { ok: false, code: "INVALID_REQUEST", status: 400, message };
}

function crossOriginFailure(): RequestBoundaryFailure {
  return {
    ok: false,
    code: "CROSS_ORIGIN_REQUEST",
    status: 403,
    message: "İstek kaynağı doğrulanamadı. Sayfayı yenileyip tekrar deneyin.",
  };
}

function requestTooLargeFailure(message: string): RequestBoundaryFailure {
  return { ok: false, code: "REQUEST_TOO_LARGE", status: 413, message };
}
