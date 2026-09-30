import "server-only";
import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { findingReviews } from "@/db/schema";
import { loadCurrentFindings, resolveCurrentFinding } from "./load-current-findings";
import { getCurrentOrganizationId } from "@/lib/organizations/current-organization";
import { isReviewStatus, validateReviewInput, type FindingReview, type ReviewResponse } from "./review-contract";

export async function loadFindingReviews(database: Pick<typeof db, "select">, organizationId: string) {
  const rows = await database.select({
    findingKey: findingReviews.findingKey,
    status: findingReviews.status,
    note: findingReviews.note,
    reviewedAt: findingReviews.reviewedAt,
  }).from(findingReviews).where(eq(findingReviews.organizationId, organizationId));
  const reviews = new Map<string, FindingReview>();
  for (const row of rows) {
    if (!isReviewStatus(row.status)) throw new Error("Invalid stored review status");
    reviews.set(row.findingKey, {
      status: row.status, note: row.note, reviewedAt: row.reviewedAt?.toISOString() ?? null,
    });
  }
  return reviews;
}

export async function saveFindingReview(value: unknown): Promise<ReviewResponse> {
  const validated = validateReviewInput(value);
  if (!validated.ok) return { ok: false, code: "INVALID_REQUEST", message: validated.message };
  try {
    const organizationId = getCurrentOrganizationId();
    const { db } = await import("@/db");
    return await db.transaction(async (transaction): Promise<ReviewResponse> => {
      const current = await loadCurrentFindings(transaction, organizationId);
      const resolved = resolveCurrentFinding(current.all, validated.input.findingKey);
      if (!resolved) {
        return { ok: false, code: "FINDING_NOT_FOUND", message: "Bu bulgu güncel kayıtlarda bulunamadı. Bulgular listesini yenileyin." };
      }
      const { findingKey, status, note } = validated.input;
      const now = new Date();
      const reviewedAt = status === "open" ? null : now;
      await transaction.insert(findingReviews).values({
        organizationId, findingKey, findingType: resolved.type, status, note, reviewedAt,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [findingReviews.organizationId, findingReviews.findingKey],
        set: { findingType: resolved.type, status, note, reviewedAt, updatedAt: now },
        setWhere: and(eq(findingReviews.organizationId, organizationId), eq(findingReviews.findingKey, findingKey)),
      });
      return { ok: true, review: { status, note, reviewedAt: reviewedAt?.toISOString() ?? null } };
    }, { isolationLevel: "repeatable read" });
  } catch {
    return { ok: false, code: "SERVER_ERROR", message: "İnceleme kaydedilemedi. Lütfen tekrar deneyin." };
  }
}
