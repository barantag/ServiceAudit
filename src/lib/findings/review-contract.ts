export const REVIEW_STATUS_LABELS = {
  open: "İncelenecek",
  confirmed: "Doğrulandı",
  dismissed: "Geçersiz",
} as const;

export type ReviewStatus = keyof typeof REVIEW_STATUS_LABELS;
export const MAX_REVIEW_NOTE_LENGTH = 2000;

export type FindingReview = {
  status: ReviewStatus;
  note: string | null;
  reviewedAt: string | null;
};
export const DEFAULT_REVIEW: FindingReview = { status: "open", note: null, reviewedAt: null };

export type ReviewInput = { findingKey: string; status: ReviewStatus; note: string | null };
export type ReviewResponse =
  | { ok: true; review: FindingReview }
  | { ok: false; code: "INVALID_REQUEST" | "FINDING_NOT_FOUND" | "SERVER_ERROR"; message: string };

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === "open" || value === "confirmed" || value === "dismissed";
}

export function validateReviewInput(value: unknown):
  | { ok: true; input: ReviewInput }
  | { ok: false; message: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, message: "İnceleme bilgisi geçersiz." };
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["findingKey", "status", "note"].includes(key))) {
    return { ok: false, message: "İzin verilmeyen inceleme alanı gönderildi." };
  }
  if (typeof input.findingKey !== "string" || input.findingKey.length === 0 || input.findingKey.length > 255) {
    return { ok: false, message: "Bulgu anahtarı geçersiz." };
  }
  if (!isReviewStatus(input.status)) {
    return { ok: false, message: "Geçerli bir inceleme durumu seçin." };
  }
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") {
    return { ok: false, message: "İnceleme notu metin olmalıdır." };
  }
  if (typeof input.note === "string" && input.note.length > MAX_REVIEW_NOTE_LENGTH) {
    return { ok: false, message: "İnceleme notu en fazla 2000 karakter olabilir." };
  }
  return { ok: true, input: {
    findingKey: input.findingKey,
    status: input.status,
    note: typeof input.note === "string" ? input.note.trim() || null : null,
  } };
}

export function isReviewResponse(value: unknown): value is ReviewResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  if (response.ok === false) {
    return ["INVALID_REQUEST", "FINDING_NOT_FOUND", "SERVER_ERROR"].includes(String(response.code))
      && typeof response.message === "string";
  }
  if (response.ok !== true || typeof response.review !== "object" || response.review === null) return false;
  const review = response.review as Record<string, unknown>;
  return isReviewStatus(review.status)
    && (review.note === null || typeof review.note === "string")
    && (review.reviewedAt === null || typeof review.reviewedAt === "string");
}
