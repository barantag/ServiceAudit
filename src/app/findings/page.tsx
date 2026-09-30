import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { EmptyState, ErrorState } from "@/components/feedback-state";
import { FindingReviewAction } from "@/components/findings/review-state";
import { getCurrentOrganizationId, loadCurrentOrganization } from "@/lib/organizations/current-organization";
import { loadFindingsOperations } from "@/lib/findings/load-findings-operations";
import {
  FINDING_TYPE_FILTER_OPTIONS,
  createFindingFilterSearchParams,
  hasActiveFindingFilters,
  parseFindingFilters,
  type ActiveServiceImport,
} from "@/lib/findings/findings-operations";
import { REVIEW_STATUS_LABELS, type ReviewStatus } from "@/lib/findings/review-contract";
import Link from "next/link";
import { connection } from "next/server";
import type { AbnormalPriceFinding } from "@/lib/findings/abnormal-price";
import type {
  DuplicateServiceFinding,
  DuplicateServiceReason,
} from "@/lib/findings/duplicate-service";
import type { RepeatedFailureFinding } from "@/lib/findings/repeated-failure";
import type { WarrantyServiceFinding } from "@/lib/findings/warranty-service";

export const metadata: Metadata = {
  title: "Bulgular | ServiceAudit",
  description: "İncelenmesi faydalı olabilecek servis kayıtları.",
};

const numberFormatter = new Intl.NumberFormat("tr-TR");
const amountFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const preciseAmountFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

type FindingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FindingsPage({ searchParams }: FindingsPageProps) {
  await connection();

  const queryParams = await searchParams;
  const filters = parseFindingFilters({
    status: firstQueryValue(queryParams.status),
    type: firstQueryValue(queryParams.type),
    query: firstQueryValue(queryParams.q),
    importId: firstQueryValue(queryParams.importId),
  });
  const filtersActive = hasActiveFindingFilters(filters);
  const exportQuery = createFindingFilterSearchParams(filters).toString();
  const exportHref = `/api/findings/export${exportQuery ? `?${exportQuery}` : ""}`;

  const findings: RepeatedFailureFinding[] = [];
  let couldNotLoadFindings = false;
  const duplicateServiceFindings: DuplicateServiceFinding[] = [];
  let couldNotLoadDuplicateServiceFindings = false;
  const abnormalPriceFindings: AbnormalPriceFinding[] = [];
  let couldNotLoadAbnormalPriceFindings = false;
  const warrantyServiceFindings: WarrantyServiceFinding[] = [];
  let couldNotLoadWarrantyServiceFindings = false;
  let totalFindingCount = 0;
  const reviewStatuses = new Map<string, ReviewStatus>();
  let organizationName: string | undefined;
  let activeServiceImports: ActiveServiceImport[] = [];
  try {
    const organizationId = getCurrentOrganizationId();
    const { db } = await import("@/db");
    organizationName = (await loadCurrentOrganization(db)).name;
    const result = await db.transaction(
      (transaction) => loadFindingsOperations(transaction, organizationId, filters),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    totalFindingCount = result.totalFindingCount;
    activeServiceImports = result.activeServiceImports;

    for (const currentFinding of result.findings) {
      reviewStatuses.set(
        currentFinding.finding.findingKey,
        currentFinding.reviewStatus,
      );

      switch (currentFinding.type) {
        case "repeated-failure":
          findings.push(currentFinding.finding);
          break;
        case "duplicate-service":
          duplicateServiceFindings.push(currentFinding.finding);
          break;
        case "abnormal-price":
          abnormalPriceFindings.push(currentFinding.finding);
          break;
        case "warranty-service":
          warrantyServiceFindings.push(currentFinding.finding);
          break;
      }
    }
  } catch (error: unknown) {
    console.error("Findings page data could not be loaded", error);
    couldNotLoadFindings = true;
    couldNotLoadDuplicateServiceFindings = true;
    couldNotLoadAbnormalPriceFindings = true;
    couldNotLoadWarrantyServiceFindings = true;
  }

  function reviewStatus(findingKey: string): ReviewStatus | null {
    return reviewStatuses.get(findingKey) ?? null;
  }

  const visibleFindingCount = findings.length
    + duplicateServiceFindings.length
    + abnormalPriceFindings.length
    + warrantyServiceFindings.length;
  const couldNotLoadAnyFindings = couldNotLoadFindings
    || couldNotLoadDuplicateServiceFindings
    || couldNotLoadAbnormalPriceFindings
    || couldNotLoadWarrantyServiceFindings;

  return (
    <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
      <AppHeader activeItem="findings" organizationName={organizationName} />

      <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-8 max-w-3xl">
          <p className="mb-2 text-sm font-semibold text-blue-700">
            SERVİS KAYITLARI
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Bulgular
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            İncelenmesi faydalı olabilecek servis kayıtlarını destekleyici
            kanıtlarıyla değerlendirin. Bulgular inceleme önceliği gösterir;
            tek başına uygunsuz harcama anlamına gelmez.
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Bu ekran, analizde aktif olan tüm içe aktarımlardan üretilen güncel bulguları gösterir. Belirli bir içe aktarımı incelemek için aşağıdaki filtreyi kullanın.
          </p>
        </div>

        <section
          aria-labelledby="finding-filters-title"
          className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="finding-filters-title" className="text-lg font-semibold text-slate-950">
                Bulguları Daralt
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                İnceleme durumu, bulgu türü ve kayıt kanıtlarında geçen metne göre arayın.
              </p>
            </div>
            {!couldNotLoadAnyFindings && (
              <p className="text-sm font-semibold text-slate-700" aria-live="polite">
                {filtersActive
                  ? `${numberFormatter.format(visibleFindingCount)} bulgu gösteriliyor`
                  : `Toplam ${numberFormatter.format(totalFindingCount)} bulgu`}
              </p>
            )}
          </div>

          <form action="/findings" method="get" className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_auto] lg:items-end">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              İnceleme durumu
              <select
                name="status"
                defaultValue={filters.status}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">Tümü</option>
                {Object.entries(REVIEW_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Bulgu türü
              <select
                name="type"
                defaultValue={filters.type}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">Tümü</option>
                {FINDING_TYPE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Kaynak içe aktarım
              <select
                name="importId"
                defaultValue={filters.importId ?? "all"}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">Tümü</option>
                {activeServiceImports.map((imp) => (
                  <option key={imp.id} value={imp.id}>{imp.fileName}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Ara
              <input
                type="search"
                name="q"
                defaultValue={filters.query}
                maxLength={200}
                placeholder="Ekipman, lokasyon, firma, fatura..."
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700"
            >
              Uygula
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <Link
              href={exportHref}
              prefetch={false}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
            >
              Filtrelenen Sonuçları Excel Olarak İndir
            </Link>
            {filtersActive && (
              <Link
                href="/findings"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                Filtreleri Temizle
              </Link>
            )}
          </div>
        </section>

        {couldNotLoadAnyFindings ? (
          <ErrorState
            title="Bulgular yüklenemedi"
            description="Güncel inceleme adayları şu anda alınamıyor. Kısa bir süre sonra yeniden deneyebilirsiniz."
            actions={[
              { href: "/findings", label: "Tekrar Dene", primary: true },
              { href: "/", label: "Yönetici Özetine Dön" },
            ]}
          />
        ) : visibleFindingCount === 0 ? (
          <EmptyState
            title={filtersActive ? "Filtrelerle eşleşen bulgu yok" : "Güncel inceleme bulgusu yok"}
            description={
              filters.importId !== null
                ? "Bu içe aktarımdan kaynaklanan servis kayıtları için şu anda bir inceleme bulgusu üretilmedi. Diğer aktif içe aktarımlardan bulgular mevcut olabilir."
                : filtersActive
                  ? "Kuruluşta bulgular mevcut olabilir; yalnızca geçerli filtre ve aramayla eşleşen sonuç bulunamadı."
                  : "Mevcut servis ve garanti kayıtları şu anda bir inceleme adayı üretmedi."
            }
            actions={filtersActive
              ? [{ href: "/findings", label: "Filtreleri Temizle", primary: true }]
              : [
                  { href: "/imports/new", label: "Servis Verisi Yükle", primary: true },
                  { href: "/warranties/new", label: "Garanti Verisi Yükle" },
                  { href: "/imports", label: "İçe Aktarımları Gör" },
                ]}
          />
        ) : (
          <>
        {(couldNotLoadFindings || !filtersActive || findings.length > 0) && (
        <section
          aria-labelledby="repeated-failures-title"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2
                id="repeated-failures-title"
                className="text-lg font-semibold text-slate-950"
              >
                Tekrarlayan Arızalar
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Aynı ekipman ve arıza türü için 1–30 gün içindeki en yakın
                önceki servis kaydı gösterilir.
              </p>
            </div>
            {!couldNotLoadFindings && (
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">
                <span aria-hidden="true" className="size-2 rounded-full bg-blue-500" />
                {numberFormatter.format(findings.length)} bulgu
              </div>
            )}
          </div>

          {couldNotLoadFindings ? (
            <div className="px-5 py-8 sm:px-7">
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
              >
                Bulgular şu anda yüklenemedi. Sunucu yapılandırmasını ve
                veritabanı bağlantısını kontrol edin.
              </div>
            </div>
          ) : findings.length === 0 ? (
            <div className="px-5 py-12 text-center sm:px-7">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="m7.5 12.5 3 3 6-7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                Tekrarlayan arıza bulgusu yok
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Mevcut servis kayıtlarında aynı ekipman ve arıza türü için 30
                gün içinde tekrarlanan bir kayıt bulunamadı.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <TableHeader>Lokasyon</TableHeader>
                    <TableHeader>Ekipman</TableHeader>
                    <TableHeader>Arıza türü</TableHeader>
                    <TableHeader>Tarih aralığı</TableHeader>
                    <TableHeader>Güncel servis</TableHeader>
                    <TableHeader>Kanıt</TableHeader>
                    <TableHeader>İnceleme</TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {findings.map((finding) => (
                    <FindingRow
                      key={`${finding.currentRecordId}-${finding.previousRecordId}`}
                      finding={finding}
                      reviewStatus={reviewStatus(finding.findingKey)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}

        {(couldNotLoadDuplicateServiceFindings || !filtersActive || duplicateServiceFindings.length > 0) && (
        <section
          aria-labelledby="duplicate-services-title"
          className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2
                id="duplicate-services-title"
                className="text-lg font-semibold text-slate-950"
              >
                Mükerrer Servis Kayıtları
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Aynı gün için fatura veya servis ayrıntıları güçlü biçimde
                benzeşen kayıtlar inceleme adayı olarak gösterilir.
              </p>
            </div>
            {!couldNotLoadDuplicateServiceFindings && (
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800">
                <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" />
                {numberFormatter.format(duplicateServiceFindings.length)} bulgu
              </div>
            )}
          </div>

          {couldNotLoadDuplicateServiceFindings ? (
            <div className="px-5 py-8 sm:px-7">
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
              >
                Mükerrer servis bulguları şu anda yüklenemedi. Sunucu
                yapılandırmasını ve veritabanı bağlantısını kontrol edin.
              </div>
            </div>
          ) : duplicateServiceFindings.length === 0 ? (
            <div className="px-5 py-12 text-center sm:px-7">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="m7.5 12.5 3 3 6-7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                Mükerrer servis kaydı adayı yok
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Mevcut servis kayıtlarında aynı güne ait yeterli eşleşme kanıtı
                taşıyan bir kayıt çifti bulunamadı.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <TableHeader>Neden</TableHeader>
                    <TableHeader>Lokasyon</TableHeader>
                    <TableHeader>Ekipman</TableHeader>
                    <TableHeader>Arıza türü</TableHeader>
                    <TableHeader>Servis tarihi</TableHeader>
                    <TableHeader>Güncel servis</TableHeader>
                    <TableHeader>Kanıt</TableHeader>
                    <TableHeader>İnceleme</TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {duplicateServiceFindings.map((finding) => (
                    <DuplicateServiceFindingRow
                      key={`${finding.currentRecordId}-${finding.previousRecordId}`}
                      finding={finding}
                      reviewStatus={reviewStatus(finding.findingKey)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}

        {(couldNotLoadAbnormalPriceFindings || !filtersActive || abnormalPriceFindings.length > 0) && (
        <section
          aria-labelledby="abnormal-prices-title"
          className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2
                id="abnormal-prices-title"
                className="text-lg font-semibold text-slate-950"
              >
                Anormal Servis Fiyatları
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Son 180 gündeki benzer servislerin medyanından en az %50 yüksek
                tutarlar inceleme adayı olarak gösterilir.
              </p>
            </div>
            {!couldNotLoadAbnormalPriceFindings && (
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800">
                <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" />
                {numberFormatter.format(abnormalPriceFindings.length)} bulgu
              </div>
            )}
          </div>

          {couldNotLoadAbnormalPriceFindings ? (
            <div className="px-5 py-8 sm:px-7">
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
              >
                Anormal fiyat bulguları şu anda yüklenemedi. Sunucu
                yapılandırmasını ve veritabanı bağlantısını kontrol edin.
              </div>
            </div>
          ) : abnormalPriceFindings.length === 0 ? (
            <div className="px-5 py-12 text-center sm:px-7">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="m7.5 12.5 3 3 6-7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                Anormal servis fiyatı bulgusu yok
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                En az üç karşılaştırılabilir geçmiş kaydı bulunan servislerde
                mevcut fiyat eşiğini aşan bir kayıt bulunamadı.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <TableHeader>Lokasyon</TableHeader>
                    <TableHeader>Servis profili</TableHeader>
                    <TableHeader>Servis</TableHeader>
                    <TableHeader>Fiyat karşılaştırması</TableHeader>
                    <TableHeader>Kanıt</TableHeader>
                    <TableHeader>İnceleme</TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {abnormalPriceFindings.map((finding) => (
                    <AbnormalPriceFindingRow
                      key={finding.currentRecordId}
                      finding={finding}
                      reviewStatus={reviewStatus(finding.findingKey)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}

        {(couldNotLoadWarrantyServiceFindings || !filtersActive || warrantyServiceFindings.length > 0) && (
        <section
          aria-labelledby="warranty-services-title"
          className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2
                id="warranty-services-title"
                className="text-lg font-semibold text-slate-950"
              >
                Garanti Süresinde Ücretli Servisler
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Servis tarihinde aynı ekipman için aktif garanti kaydı bulunan
                pozitif tutarlı servisler inceleme adayı olarak gösterilir.
              </p>
            </div>
            {!couldNotLoadWarrantyServiceFindings && (
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800">
                <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" />
                {numberFormatter.format(warrantyServiceFindings.length)} bulgu
              </div>
            )}
          </div>

          {couldNotLoadWarrantyServiceFindings ? (
            <div className="px-5 py-8 sm:px-7">
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
              >
                Garanti bulguları şu anda yüklenemedi. Sunucu yapılandırmasını,
                migration durumunu ve veritabanı bağlantısını kontrol edin.
              </div>
            </div>
          ) : warrantyServiceFindings.length === 0 ? (
            <div className="px-5 py-12 text-center sm:px-7">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="m7.5 12.5 3 3 6-7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                Garanti süresinde ücretli servis bulgusu yok
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Mevcut servis ve garanti kayıtlarında aktif garanti dönemine
                denk gelen pozitif tutarlı bir servis bulunamadı.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <TableHeader>Lokasyon</TableHeader>
                    <TableHeader>Ekipman</TableHeader>
                    <TableHeader>Servis</TableHeader>
                    <TableHeader>Garanti</TableHeader>
                    <TableHeader>Kanıt</TableHeader>
                    <TableHeader>İnceleme</TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {warrantyServiceFindings.map((finding) => (
                    <WarrantyServiceFindingRow
                      key={finding.serviceRecordId}
                      finding={finding}
                      reviewStatus={reviewStatus(finding.findingKey)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}
          </>
        )}
      </main>
    </div>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold first:pl-7 last:pr-7">
      {children}
    </th>
  );
}

function FindingRow({ finding, reviewStatus }: { finding: RepeatedFailureFinding; reviewStatus: ReviewStatus | null }) {
  return (
    <tr className="align-top hover:bg-slate-50/70">
      <td className="min-w-44 px-4 py-4 first:pl-7">
        <p className="font-semibold text-slate-900">
          {finding.locationName || finding.locationCode || "Belirtilmemiş"}
        </p>
        {finding.locationName && finding.locationCode && (
          <p className="mt-1 text-xs text-slate-500">{finding.locationCode}</p>
        )}
      </td>
      <td className="min-w-44 px-4 py-4">
        <p className="font-semibold text-slate-900">{finding.assetCode}</p>
        {finding.assetType && (
          <p className="mt-1 text-xs text-slate-500">{finding.assetType}</p>
        )}
      </td>
      <td className="min-w-44 px-4 py-4 font-medium text-slate-800">
        {finding.failureType}
      </td>
      <td className="min-w-52 px-4 py-4">
        <p className="whitespace-nowrap font-medium text-slate-900">
          {formatDate(finding.previousDate)}
          <span aria-hidden="true" className="mx-2 text-slate-400">→</span>
          {formatDate(finding.currentDate)}
        </p>
        <span className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
          {numberFormatter.format(finding.daysBetween)} gün
        </span>
      </td>
      <td className="min-w-48 px-4 py-4">
        <p className="font-medium text-slate-900">
          {finding.currentVendor || "Servis firması belirtilmemiş"}
        </p>
        {finding.currentAmount && (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500">
              İncelenecek tutar
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {formatAmount(finding.currentAmount, finding.currentCurrency)}
            </p>
          </div>
        )}
      </td>
      <td className="min-w-80 px-4 py-4 last:pr-7">
        <p className="leading-6 text-slate-700">{finding.explanation}</p>
        <dl className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
          <div>
            <dt className="inline font-semibold text-slate-600">Önceki: </dt>
            <dd className="inline">
              {formatSourceReference(
                finding.previousSourceFileName,
                finding.previousSourceRowNumber,
              )}
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-600">Güncel: </dt>
            <dd className="inline">
              {formatSourceReference(
                finding.currentSourceFileName,
                finding.currentSourceRowNumber,
              )}
            </dd>
          </div>
        </dl>
      </td>
      <FindingReviewAction findingKey={finding.findingKey} status={reviewStatus} />
    </tr>
  );
}

function DuplicateServiceFindingRow({
  finding,
  reviewStatus,
}: {
  finding: DuplicateServiceFinding;
  reviewStatus: ReviewStatus | null;
}) {
  const displayedInvoice =
    finding.currentInvoiceNumber || finding.previousInvoiceNumber;

  return (
    <tr className="align-top hover:bg-slate-50/70">
      <td className="min-w-44 px-4 py-4 first:pl-7">
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
          {formatDuplicateServiceReason(finding.reasonType)}
        </span>
      </td>
      <td className="min-w-44 px-4 py-4">
        <p className="font-semibold text-slate-900">
          {finding.locationName || finding.locationCode || "Belirtilmemiş"}
        </p>
        {finding.locationName && finding.locationCode && (
          <p className="mt-1 text-xs text-slate-500">{finding.locationCode}</p>
        )}
      </td>
      <td className="min-w-44 px-4 py-4">
        <p className="font-semibold text-slate-900">{finding.assetCode}</p>
        {finding.assetType && (
          <p className="mt-1 text-xs text-slate-500">{finding.assetType}</p>
        )}
      </td>
      <td className="min-w-44 px-4 py-4 font-medium text-slate-800">
        {finding.failureType}
      </td>
      <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-900">
        {formatDate(finding.serviceDate)}
      </td>
      <td className="min-w-52 px-4 py-4">
        <p className="font-medium text-slate-900">
          {finding.currentVendor || "Servis firması belirtilmemiş"}
        </p>
        {displayedInvoice && (
          <p className="mt-2 text-xs text-slate-500">
            Fatura no: <span className="font-medium text-slate-700">{displayedInvoice}</span>
          </p>
        )}
        {finding.currentAmount && (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500">
              İncelenecek tutar
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {formatAmount(finding.currentAmount, finding.currentCurrency)}
            </p>
          </div>
        )}
      </td>
      <td className="min-w-80 px-4 py-4 last:pr-7">
        <p className="leading-6 text-slate-700">{finding.explanation}</p>
        <dl className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
          <div>
            <dt className="inline font-semibold text-slate-600">Önceki: </dt>
            <dd className="inline">
              {formatSourceReference(
                finding.previousSourceFileName,
                finding.previousSourceRowNumber,
              )}
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-600">Güncel: </dt>
            <dd className="inline">
              {formatSourceReference(
                finding.currentSourceFileName,
                finding.currentSourceRowNumber,
              )}
            </dd>
          </div>
        </dl>
      </td>
      <FindingReviewAction findingKey={finding.findingKey} status={reviewStatus} />
    </tr>
  );
}

function formatDuplicateServiceReason(
  reasonType: DuplicateServiceReason,
): string {
  return reasonType === "sameInvoice"
    ? "Aynı fatura numarası"
    : "Aynı servis detayları";
}

function AbnormalPriceFindingRow({
  finding,
  reviewStatus,
}: {
  finding: AbnormalPriceFinding;
  reviewStatus: ReviewStatus | null;
}) {
  return (
    <tr className="align-top hover:bg-slate-50/70">
      <td className="min-w-44 px-4 py-4 first:pl-7">
        <p className="font-semibold text-slate-900">
          {finding.locationName || finding.locationCode || "Belirtilmemiş"}
        </p>
        {finding.locationName && finding.locationCode && (
          <p className="mt-1 text-xs text-slate-500">{finding.locationCode}</p>
        )}
      </td>
      <td className="min-w-52 px-4 py-4">
        <p className="font-semibold text-slate-900">{finding.assetType}</p>
        <p className="mt-1 text-xs text-slate-500">
          {finding.failureType}
        </p>
        {finding.assetCode && (
          <p className="mt-1 text-xs text-slate-500">
            Ekipman: {finding.assetCode}
          </p>
        )}
      </td>
      <td className="min-w-48 px-4 py-4">
        <p className="font-medium text-slate-900">{finding.vendorName}</p>
        <p className="mt-1 whitespace-nowrap text-xs text-slate-500">
          {formatDate(finding.serviceDate)}
        </p>
      </td>
      <td className="min-w-72 px-4 py-4">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
          <div>
            <dt className="text-xs font-medium text-slate-500">
              İncelenecek tutar
            </dt>
            <dd className="mt-1 font-semibold text-slate-950">
              {formatAmount(finding.currentAmount, finding.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">
              Geçmiş medyan
            </dt>
            <dd className="mt-1 font-semibold text-slate-950">
              {formatPreciseAmount(
                finding.historicalMedian,
                finding.currency,
              )}
            </dd>
          </div>
        </dl>
        <span className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
          Medyanın üzerinde %{formatPercentage(finding.percentageAboveMedian)}
        </span>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {numberFormatter.format(finding.historicalComparableRecordCount)} benzer
          kayıt · {formatDate(finding.oldestHistoricalDate)}–
          {formatDate(finding.newestHistoricalDate)}
        </p>
      </td>
      <td className="min-w-80 px-4 py-4 last:pr-7">
        <p className="leading-6 text-slate-700">{finding.explanation}</p>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          <span className="font-semibold text-slate-600">Kaynak: </span>
          {formatSourceReference(
            finding.sourceFileName,
            finding.sourceRowNumber,
          )}
        </p>
      </td>
      <FindingReviewAction findingKey={finding.findingKey} status={reviewStatus} />
    </tr>
  );
}

function WarrantyServiceFindingRow({
  finding,
  reviewStatus,
}: {
  finding: WarrantyServiceFinding;
  reviewStatus: ReviewStatus | null;
}) {
  return (
    <tr className="align-top hover:bg-slate-50/70">
      <td className="min-w-44 px-4 py-4 first:pl-7">
        <p className="font-semibold text-slate-900">
          {finding.locationName || finding.locationCode || "Belirtilmemiş"}
        </p>
        {finding.locationName && finding.locationCode && (
          <p className="mt-1 text-xs text-slate-500">{finding.locationCode}</p>
        )}
      </td>
      <td className="min-w-52 px-4 py-4">
        <p className="font-semibold text-slate-900">{finding.assetCode}</p>
        {finding.assetType && (
          <p className="mt-1 text-xs text-slate-500">{finding.assetType}</p>
        )}
        {finding.failureType && (
          <p className="mt-1 text-xs text-slate-500">
            {finding.failureType}
          </p>
        )}
      </td>
      <td className="min-w-52 px-4 py-4">
        <p className="font-medium text-slate-900">
          {finding.serviceVendor || "Servis firması belirtilmemiş"}
        </p>
        <p className="mt-1 whitespace-nowrap text-xs text-slate-500">
          {formatDate(finding.serviceDate)}
        </p>
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-500">
            İncelenecek tutar
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {formatAmount(
              finding.currentServiceAmount,
              finding.currency,
            )}
          </p>
        </div>
      </td>
      <td className="min-w-56 px-4 py-4">
        <p className="whitespace-nowrap font-medium text-slate-900">
          {formatDate(finding.warrantyStartDate)}
          <span aria-hidden="true" className="mx-2 text-slate-400">→</span>
          {formatDate(finding.warrantyEndDate)}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {finding.providerName || "Garanti sağlayıcı belirtilmemiş"}
        </p>
      </td>
      <td className="min-w-80 px-4 py-4 last:pr-7">
        <p className="leading-6 text-slate-700">{finding.explanation}</p>
        <dl className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
          <div>
            <dt className="inline font-semibold text-slate-600">Servis: </dt>
            <dd className="inline">
              {formatSourceReference(
                finding.serviceSourceFileName,
                finding.serviceSourceRowNumber,
              )}
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-600">Garanti: </dt>
            <dd className="inline">
              {formatSourceReference(
                finding.warrantySourceFileName,
                finding.warrantySourceRowNumber,
              )}
            </dd>
          </div>
        </dl>
      </td>
      <FindingReviewAction findingKey={finding.findingKey} status={reviewStatus} />
    </tr>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");

  return `${day}.${month}.${year}`;
}

function formatAmount(amount: string, currency: string | null): string {
  const numericAmount = Number(amount);
  const formattedAmount = Number.isFinite(numericAmount)
    ? amountFormatter.format(numericAmount)
    : amount;

  return currency ? `${formattedAmount} ${currency}` : formattedAmount;
}

function formatPreciseAmount(amount: string, currency: string): string {
  const numericAmount = Number(amount);
  const formattedAmount = Number.isFinite(numericAmount)
    ? preciseAmountFormatter.format(numericAmount)
    : amount;

  return `${formattedAmount} ${currency}`;
}

function formatPercentage(value: string): string {
  return value.replace(".", ",");
}

function formatSourceReference(
  fileName: string | null,
  rowNumber: number | null,
): string {
  const sourceFile = fileName || "Kaynak dosya belirtilmemiş";

  return rowNumber === null
    ? sourceFile
    : `${sourceFile} · Satır ${numberFormatter.format(rowNumber)}`;
}

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
