import type { Metadata } from "next";
import { connection } from "next/server";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/feedback-state";
import { WarrantyCsvImport } from "@/components/warranties/warranty-csv-import";
import { loadCurrentOrganization } from "@/lib/organizations/current-organization";

export const metadata: Metadata = {
  title: "Garanti Verisi Yükle | ServiceAudit",
  description: "Garanti kayıtlarını Excel (.xlsx) veya CSV (.csv) dosyasından doğrulayarak içe aktarın.",
};

export default async function NewWarrantyImportPage() {
  await connection();
  let organizationName: string | null = null;
  try {
    organizationName = (await loadCurrentOrganization()).name;
  } catch (error: unknown) {
    console.error("Warranty import organization could not be loaded", error);
  }

  if (organizationName === null) {
    return (
      <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
        <AppHeader activeItem="warranty-import" />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <ErrorState
            title="Garanti verisi yükleme ekranı açılamadı"
            description="Aktif kuruluş bilgisi şu anda alınamıyor. Sunucu yapılandırmasını kontrol edip yeniden deneyin."
            actions={[{ href: "/warranties/new", label: "Tekrar Dene", primary: true }]}
          />
        </main>
      </div>
    );
  }

  return <WarrantyCsvImport organizationName={organizationName} />;
}
