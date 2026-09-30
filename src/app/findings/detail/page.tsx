import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/feedback-state";
import { loadCurrentFindings, resolveCurrentFinding } from "@/lib/findings/load-current-findings";
import { getCurrentOrganizationId, loadCurrentOrganization } from "@/lib/organizations/current-organization";
import { loadFindingReviews } from "@/lib/findings/finding-reviews";
import { FINDING_TYPE_LABELS } from "@/lib/findings/current-finding";
import { DEFAULT_REVIEW } from "@/lib/findings/review-contract";
import { FindingEvidence } from "@/components/findings/finding-evidence";
import { ReviewForm } from "@/components/findings/review-form";

export const metadata: Metadata = { title: "Bulgu İncelemesi | ServiceAudit" };

export default async function FindingDetailPage({ searchParams }: {
  searchParams: Promise<{ key?: string | string[] }>;
}) {
  await connection();
  const { key } = await searchParams;
  if (typeof key !== "string" || !key || key.length > 255) notFound();

  let data;
  try {
    const organizationId = getCurrentOrganizationId();
    const { db } = await import("@/db");
    const organization = await loadCurrentOrganization(db);
    data = await db.transaction(async (transaction) => {
      const current = await loadCurrentFindings(transaction, organizationId);
      const entry = resolveCurrentFinding(current.all, key);
      const reviews = await loadFindingReviews(transaction, organizationId);
      return { entry, review: reviews.get(key) ?? DEFAULT_REVIEW, organizationName: organization.name };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  } catch (error: unknown) {
    console.error("Finding detail could not be loaded", error);
    return <DetailShell><ErrorState
      title="Bulgu incelemesi yüklenemedi"
      description="Bulgu ve inceleme bilgileri şu anda alınamıyor. Kısa bir süre sonra yeniden deneyebilirsiniz."
      actions={[
        { href: `/findings/detail?key=${encodeURIComponent(key)}`, label: "Tekrar Dene", primary: true },
        { href: "/findings", label: "Bulgulara Dön" },
      ]}
    /></DetailShell>;
  }
  if (!data.entry) notFound();
  return (
    <DetailShell organizationName={data.organizationName}>
      <p className="text-sm font-semibold text-blue-700">BULGU İNCELEMESİ</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{FINDING_TYPE_LABELS[data.entry.type]}</h1>
      <p className="mt-4 leading-7 text-slate-700">{data.entry.finding.explanation}</p>
      <p className="mt-2 text-sm text-slate-500">Bulgu bir inceleme adayıdır; tek başına uygunsuz harcama anlamına gelmez.</p>
      <ReviewForm key={key} findingKey={key} initialReview={data.review} />
      <FindingEvidence entry={data.entry} />
    </DetailShell>
  );
}

function DetailShell({ children, organizationName }: { children: React.ReactNode; organizationName?: string }) {
  return <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
    <AppHeader activeItem="findings" organizationName={organizationName} />
    <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link href="/findings" prefetch={false} className="mb-6 inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-100">Bulgulara Dön</Link>
      <div className="max-w-5xl">{children}</div>
    </main>
  </div>;
}
