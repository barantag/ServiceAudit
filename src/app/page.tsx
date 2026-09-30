import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppHeader } from "@/components/app-header";
import { EmptyState, ErrorState } from "@/components/feedback-state";
import { ReviewState } from "@/components/findings/review-state";
import { loadFindingReviews } from "@/lib/findings/finding-reviews";
import { loadCurrentFindings } from "@/lib/findings/load-current-findings";
import { getCurrentOrganizationId, loadCurrentOrganization } from "@/lib/organizations/current-organization";
import {
  createManagerSummary,
  type ManagerPriorityFinding,
  type ManagerSummary,
} from "@/lib/findings/manager-summary";
import {
  calculateAnalysisReadiness,
  type AnalysisReadiness,
} from "@/lib/findings/analysis-readiness";

export const metadata: Metadata = {
  title: "Yönetici Özeti | ServiceAudit",
  description: "Güncel servis bulguları ve inceleme durumlarının yönetici özeti.",
};

const numberFormatter = new Intl.NumberFormat("tr-TR");

export default async function Home() {
  await connection();

  let summary: ManagerSummary | null = null;
  let readiness: AnalysisReadiness[] = [];
  let organizationName: string | undefined;

  try {
    const organizationId = getCurrentOrganizationId();
    const { db } = await import("@/db");
    organizationName = (await loadCurrentOrganization(db)).name;

    const result = await db.transaction(async (transaction) => {
      const current = await loadCurrentFindings(transaction, organizationId);
      const reviews = await loadFindingReviews(transaction, organizationId);

      return {
        summary: createManagerSummary(current.all, reviews),
        readiness: calculateAnalysisReadiness(current.records, current.warrantyRecords)
      };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    summary = result.summary;
    readiness = result.readiness;
  } catch (error: unknown) {
    console.error("Manager summary could not be loaded", error);
    summary = null;
    readiness = [];
  }

  return (
    <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
      <AppHeader activeItem="summary" organizationName={organizationName} />

      <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-2 text-sm font-semibold text-blue-700">GÜNCEL DURUM</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Yönetici Özeti
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Güncel servis bulgularını, inceleme kararlarını ve değerlendirilmesi
              önerilen servis tutarlarını tek bakışta izleyin.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ActionLink href="/findings" primary>Bulguları Gör</ActionLink>
          </div>
        </div>

        {summary === null ? (
          <ErrorState
            className="mt-8"
            title="Yönetici özeti yüklenemedi"
            description="Bilgiler şu anda alınamıyor. Kısa bir süre sonra yeniden deneyebilir veya mevcut içe aktarımları kontrol edebilirsiniz."
            actions={[
              { href: "/", label: "Tekrar Dene", primary: true },
              { href: "/imports", label: "İçe Aktarımları Gör" },
            ]}
          />
        ) : summary.totalFindingCount === 0 ? (
          <EmptyState
            className="mt-8"
            title="Henüz güncel inceleme bulgusu yok"
            description="Mevcut veriler şu anda bir inceleme adayı üretmedi. Yeni servis veya garanti verisi yükleyebilir ya da önceki içe aktarımları kontrol edebilirsiniz."
            actions={[
              { href: "/imports/new", label: "Servis Verisi Yükle", primary: true },
              { href: "/warranties/new", label: "Garanti Verisi Yükle" },
              { href: "/imports", label: "İçe Aktarımları Gör" },
            ]}
          />
        ) : (
          <ManagerSummaryContent summary={summary} readiness={readiness} />
        )}
      </main>
    </div>
  );
}

function ManagerSummaryContent({ summary, readiness }: { summary: ManagerSummary, readiness: AnalysisReadiness[] }) {
  return (
    <>
      <section aria-labelledby="overview-title" className="mt-8">
        <h2 id="overview-title" className="sr-only">Bulgu özeti</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Toplam bulgu" value={summary.totalFindingCount} tone="blue" />
          <KpiCard label="İncelenecek" value={summary.statusCounts.open} tone="amber" />
          <KpiCard label="Doğrulandı" value={summary.statusCounts.confirmed} tone="emerald" />
          <KpiCard label="Geçersiz" value={summary.statusCounts.dismissed} tone="slate" />
          <KpiCard
            label="İncelenecek benzersiz servis kaydı"
            value={summary.uniqueServiceRecordCount}
            tone="indigo"
          />
        </div>
      </section>

      <section
        aria-labelledby="review-amounts-title"
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="review-amounts-title" className="text-lg font-semibold text-slate-950">
              İncelenecek servis tutarı
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Aynı servis kaydı birden fazla bulguda yer alsa da tutarı yalnızca
              bir kez hesaplanır.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-500">Para birimine göre</p>
        </div>

        {summary.reviewAmounts.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            Güncel bulgularla ilişkilendirilebilen para birimli bir servis tutarı yok.
          </div>
        ) : (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.reviewAmounts.map((total) => (
              <div key={total.currency} className="rounded-xl border border-blue-100 bg-blue-50/70 px-5 py-4">
                <dt className="text-sm font-semibold text-blue-700">{total.currency}</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                  {formatCanonicalAmount(total.amount)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Bu tutarlar inceleme kapsamını gösterir; doğrulanmış tasarruf veya kayıp değildir.
        </p>
      </section>

      <section
        aria-labelledby="readiness-title"
        className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
          <h2 id="readiness-title" className="text-lg font-semibold text-slate-950">
            Analiz Hazırlığı / Veri Uygunluğu
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Mevcut verilerinizin hangi analizleri yapmaya uygun olduğunu gösterir. ServiceAudit yalnızca elindeki verinin desteklediği kontrolleri güvenilir biçimde çalıştırabilir.
          </p>
        </div>
        <div className="divide-y divide-slate-200">
          {readiness.map((r) => (
            <div key={r.type} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:px-7">
              <div className="w-full sm:w-1/3">
                <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      r.status === "Hazır"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                        : r.status === "Sınırlı"
                        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
                        : "bg-slate-50 text-slate-700 ring-slate-600/20"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
              </div>
              <div className="w-full sm:w-2/3">
                <p className="text-sm text-slate-600">{r.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.18fr)] lg:items-start">
        <section
          aria-labelledby="breakdown-title"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <h2 id="breakdown-title" className="text-lg font-semibold text-slate-950">
              Bulgu Türleri
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Güncel bulguların tür ve inceleme durumuna göre dağılımı.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <TableHeader>Bulgu türü</TableHeader>
                  <TableHeader>Toplam</TableHeader>
                  <TableHeader>İncelenecek</TableHeader>
                  <TableHeader>Doğrulandı</TableHeader>
                  <TableHeader>Geçersiz</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {summary.typeBreakdown.map((item) => (
                  <tr key={item.type} className="bg-white hover:bg-slate-50/70">
                    <td className="min-w-56 px-4 py-4 first:pl-7 font-semibold text-slate-900">
                      {item.label}
                    </td>
                    <CountCell value={item.total} strong />
                    <CountCell value={item.open} />
                    <CountCell value={item.confirmed} />
                    <CountCell value={item.dismissed} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-labelledby="open-findings-title"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
            <div>
              <h2 id="open-findings-title" className="text-lg font-semibold text-slate-950">
                İnceleme Bekleyen Bulgular
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Tutar içeren açık bulgular önce gösterilir.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800">
              {numberFormatter.format(summary.statusCounts.open)} açık
            </span>
          </div>

          {summary.priorityFindings.length === 0 ? (
            <div className="px-5 py-10 text-center sm:px-7">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.8">
                  <path d="m7.5 12.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                İnceleme bekleyen bulgu yok
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Güncel bulgular arasında açık inceleme bulunmuyor.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-slate-200">
              {summary.priorityFindings.map((finding) => (
                <PriorityFindingRow key={finding.findingKey} finding={finding} />
              ))}
            </ol>
          )}
          {summary.statusCounts.open > summary.priorityFindings.length && (
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600 sm:px-7">
              İlk {numberFormatter.format(summary.priorityFindings.length)} bulgu gösteriliyor. {" "}
              <Link href="/findings" className="font-semibold text-blue-700 hover:text-blue-800">
                Tümünü görüntüleyin
              </Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function PriorityFindingRow({ finding }: { finding: ManagerPriorityFinding }) {
  return (
    <li className="px-5 py-5 sm:px-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-blue-700">{finding.typeLabel}</p>
            <ReviewState status={finding.status} />
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{finding.explanation}</p>
          {finding.currentAmount && (
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-500">İncelenecek tutar</p>
              <p className="mt-1 font-semibold text-slate-950">
                {formatDisplayAmount(finding.currentAmount, finding.currency)}
              </p>
            </div>
          )}
        </div>
        <Link
          prefetch={false}
          href={`/findings/detail?key=${encodeURIComponent(finding.findingKey)}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-100"
        >
          İncele
        </Link>
      </div>
    </li>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "amber" | "emerald" | "slate" | "indigo";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50/70 text-blue-700",
    amber: "border-amber-200 bg-amber-50/70 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
    slate: "border-slate-200 bg-white text-slate-600",
    indigo: "border-indigo-200 bg-indigo-50/70 text-indigo-700",
  } as const;

  return (
    <article className={`min-h-36 rounded-2xl border p-5 shadow-sm ${tones[tone]}`}>
      <p className="text-sm font-semibold leading-5">{label}</p>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
        {numberFormatter.format(value)}
      </p>
    </article>
  );
}

function ActionLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={primary
        ? "inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700"
        : "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-100"}
    >
      {children}
    </Link>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold first:pl-7 last:pr-7">
      {children}
    </th>
  );
}

function CountCell({ value, strong = false }: { value: number; strong?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-4 py-4 text-right last:pr-7 ${strong ? "font-semibold text-slate-950" : "text-slate-700"}`}>
      {numberFormatter.format(value)}
    </td>
  );
}

function formatDisplayAmount(amount: string, currency: string | null): string {
  const formattedAmount = formatCanonicalAmount(amount);
  return currency ? `${formattedAmount} ${currency}` : formattedAmount;
}

function formatCanonicalAmount(amount: string): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) {
    return amount;
  }

  const integerPart = numberFormatter.format(BigInt(match[2]));
  const fractionalPart = (match[3] ?? "").padEnd(2, "0");

  return `${match[1]}${integerPart},${fractionalPart}`;
}
