import type { Metadata } from "next";
import { connection } from "next/server";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/feedback-state";
import { CsvImportPreview } from "@/components/imports/csv-import-preview";
import { loadCurrentOrganization } from "@/lib/organizations/current-organization";

export const metadata: Metadata = {
  title: "Servis Verisi Yükle | ServiceAudit",
  description: "Servis kayıtlarını Excel (.xlsx) veya CSV (.csv) dosyasından önizleyin.",
};

export default async function NewImportPage() {
  await connection();
  let organizationName: string | null = null;
  try {
    organizationName = (await loadCurrentOrganization()).name;
  } catch (error: unknown) {
    console.error("Service import organization could not be loaded", error);
  }

  if (organizationName === null) {
    return (
      <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
        <AppHeader activeItem="service-import" />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <ErrorState
            title="Servis verisi yükleme ekranı açılamadı"
            description="Aktif kuruluş bilgisi şu anda alınamıyor. Sunucu yapılandırmasını kontrol edip yeniden deneyin."
            actions={[{ href: "/imports/new", label: "Tekrar Dene", primary: true }]}
          />
        </main>
      </div>
    );
  }

  return <CsvImportPreview organizationName={organizationName} />;
}
