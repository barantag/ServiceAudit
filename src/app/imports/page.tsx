import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppHeader } from "@/components/app-header";
import { EmptyState, ErrorState } from "@/components/feedback-state";
import { ImportAnalysisStateAction } from "@/components/imports/import-analysis-state-action";
import { getCurrentOrganizationId, loadCurrentOrganization } from "@/lib/organizations/current-organization";
import {
  IMPORT_TYPE_FILTER_OPTIONS,
  hasActiveImportHistoryFilters,
  type ImportHistoryItem,
  type ImportHistoryResult,
  type ImportHistoryType,
} from "@/lib/imports/import-history";
import { loadImportHistory } from "@/lib/imports/load-import-history";

export const metadata: Metadata = {
  title: "İçe Aktarımlar | ServiceAudit",
  description: "ServiceAudit servis ve garanti verisi içe aktarma geçmişi.",
};

const numberFormatter = new Intl.NumberFormat("tr-TR");
const dateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

type ImportHistoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ImportHistoryPage({ searchParams }: ImportHistoryPageProps) {
  await connection();
  const queryParams = await searchParams;
  let history: ImportHistoryResult | null = null;
  let organizationName: string | undefined;

  try {
    const organizationId = getCurrentOrganizationId();
    const { db } = await import("@/db");
    organizationName = (await loadCurrentOrganization(db)).name;
    history = await db.transaction(
      (transaction) => loadImportHistory(transaction, organizationId, {
        type: firstQueryValue(queryParams.type),
        status: firstQueryValue(queryParams.status),
        query: firstQueryValue(queryParams.q),
      }),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } catch (error: unknown) {
    console.error("Import history could not be loaded", error);
    history = null;
  }

  return (
    <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
      <AppHeader activeItem="imports" organizationName={organizationName} />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-8 max-w-3xl">
          <p className="mb-2 text-sm font-semibold text-blue-700">VERİ GEÇMİŞİ</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">İçe Aktarımlar</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Organizasyonunuz için daha önce kaydedilen servis ve garanti veri
            dosyalarını, işlem durumları ve kaynak bilgileriyle inceleyin.
          </p>
        </div>

        {history === null ? (
          <ErrorState
            title="İçe aktarma geçmişi yüklenemedi"
            description="Kaydedilmiş içe aktarımlar şu anda alınamıyor. Kısa bir süre sonra yeniden deneyebilirsiniz."
            actions={[
              { href: "/imports", label: "Tekrar Dene", primary: true },
              { href: "/", label: "Yönetici Özetine Dön" },
            ]}
          />
        ) : (
          <ImportHistoryContent history={history} />
        )}
      </main>
    </div>
  );
}

function ImportHistoryContent({ history }: { history: ImportHistoryResult }) {
  const filtersActive = hasActiveImportHistoryFilters(history.filters);

  return (
    <>
      <section aria-labelledby="import-filters-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="import-filters-title" className="text-lg font-semibold">İçe Aktarımları Daralt</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Veri türü, işlem durumu veya dosya adına göre arayın.</p>
          </div>
          <p className="text-sm font-semibold text-slate-700" aria-live="polite">
            {filtersActive
              ? `${numberFormatter.format(history.items.length)} içe aktarım gösteriliyor`
              : `Toplam ${numberFormatter.format(history.totalImportCount)} içe aktarım`}
          </p>
        </div>

        <form action="/imports" method="get" className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-end">
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Veri türü
            <select name="type" defaultValue={history.filters.type} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="all">Tümü</option>
              {IMPORT_TYPE_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            İşlem durumu
            <select name="status" defaultValue={history.filters.status} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="all">Tümü</option>
              {history.availableStatuses.map((status) => <option key={status} value={status}>{formatImportStatus(status)}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Dosya adı
            <input type="search" name="q" defaultValue={history.filters.query} maxLength={200} placeholder="Dosya adında ara..." className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700">Uygula</button>
        </form>

        {filtersActive && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <Link href="/imports" className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">Filtreleri Temizle</Link>
          </div>
        )}
      </section>

      {history.items.length === 0 ? (
        <ImportHistoryEmptyState hasImports={history.totalImportCount > 0} />
      ) : (
        <section aria-labelledby="import-list-title" className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <h2 id="import-list-title" className="text-lg font-semibold">Kaydedilen İçe Aktarımlar</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">En yeni içe aktarımlar önce gösterilir.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <TableHeader>Dosya</TableHeader>
                  <TableHeader>Veri türü</TableHeader>
                  <TableHeader>Satır</TableHeader>
                  <TableHeader>İşlem durumu</TableHeader>
                  <TableHeader>Analiz durumu</TableHeader>
                  <TableHeader>İçe aktarıldı</TableHeader>
                  <TableHeader>İşlem</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {history.items.map((item) => <ImportHistoryRow key={item.id} item={item} />)}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function ImportHistoryRow({ item }: { item: ImportHistoryItem }) {
  return (
    <tr className="align-top hover:bg-slate-50/70">
      <td className="min-w-72 px-4 py-4 first:pl-7">
        <p className="font-semibold text-slate-900">{item.fileName}</p>
      </td>
      <td className="whitespace-nowrap px-4 py-4"><ImportTypeBadge type={item.type} /></td>
      <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-800">{numberFormatter.format(item.rowCount)}</td>
      <td className="whitespace-nowrap px-4 py-4"><ImportStatusBadge status={item.status} /></td>
      <td className="min-w-56 px-4 py-4">
        <ImportAnalysisStateBadge excluded={item.excludedAt !== null} />
        {item.excludedAt && (
          <div className="mt-2 text-xs leading-5 text-slate-500">
            <time dateTime={item.excludedAt.toISOString()}>{dateTimeFormatter.format(item.excludedAt)}</time>
            {item.exclusionReason && <p className="mt-1 max-w-72 whitespace-normal text-slate-600">{item.exclusionReason}</p>}
          </div>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-4">
        <time dateTime={item.createdAt.toISOString()} className="font-medium text-slate-800">{dateTimeFormatter.format(item.createdAt)}</time>
      </td>
      <td className="px-4 py-4 last:pr-7">
        {item.status === "completed" ? (
          <div className="flex flex-wrap gap-2">
            <ImportAnalysisStateAction
              importId={item.id}
              fileName={item.fileName}
              excluded={item.excludedAt !== null}
            />
            {item.excludedAt === null && item.type === "service" && (
              <Link
                href={`/findings?importId=${item.id}`}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
              >
                Bulguları Gör
              </Link>
            )}
          </div>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}

function ImportHistoryEmptyState({ hasImports }: { hasImports: boolean }) {
  return <EmptyState
    className="mt-6"
    title={hasImports ? "Filtrelerle eşleşen içe aktarım yok" : "Henüz içe aktarım yok"}
    description={hasImports ? "Kaydedilmiş içe aktarımlar var; yalnızca geçerli filtrelerle eşleşen sonuç bulunamadı." : "Servis veya garanti verisi yüklediğinizde kaydedilen işlemler burada görünecek."}
    actions={hasImports
      ? [{ href: "/imports", label: "Filtreleri Temizle", primary: true }]
      : [
          { href: "/imports/new", label: "Servis Verisi Yükle", primary: true },
          { href: "/warranties/new", label: "Garanti Verisi Yükle" },
        ]}
  />;
}

function ImportTypeBadge({ type }: { type: ImportHistoryType }) {
  const labels: Record<ImportHistoryType, string> = { service: "Servis Verisi", warranty: "Garanti Verisi", unknown: "Belirlenemedi" };
  const tones: Record<ImportHistoryType, string> = { service: "border-blue-200 bg-blue-50 text-blue-700", warranty: "border-indigo-200 bg-indigo-50 text-indigo-700", unknown: "border-slate-200 bg-slate-50 text-slate-600" };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[type]}`}>{labels[type]}</span>;
}

function ImportStatusBadge({ status }: { status: string }) {
  const tone = status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : status === "processing" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{formatImportStatus(status)}</span>;
}

function ImportAnalysisStateBadge({ excluded }: { excluded: boolean }) {
  return (
    <span className={excluded
      ? "inline-flex rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
      : "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"}
    >
      {excluded ? "Analiz Dışı" : "Analizde"}
    </span>
  );
}

function formatImportStatus(status: string): string {
  if (status === "completed") return "Tamamlandı";
  if (status === "processing") return "İşleniyor";
  if (status === "pending") return "Bekliyor";
  return "Belirlenemedi";
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold first:pl-7 last:pr-7">{children}</th>;
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
