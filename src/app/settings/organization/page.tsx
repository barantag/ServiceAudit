import type { Metadata } from "next";
import { connection } from "next/server";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/feedback-state";
import { OrganizationNameForm } from "@/components/organizations/organization-name-form";
import { loadCurrentOrganization } from "@/lib/organizations/current-organization";

export const metadata: Metadata = {
  title: "Kuruluş Ayarları | ServiceAudit",
  description: "ServiceAudit aktif kuruluş görünen adını yönetin.",
};

export default async function OrganizationSettingsPage() {
  await connection();
  let organizationName: string | null = null;
  try {
    organizationName = (await loadCurrentOrganization()).name;
  } catch (error: unknown) {
    console.error("Organization settings could not be loaded", error);
  }

  if (organizationName === null) {
    return (
      <PageShell>
        <ErrorState
          title="Kuruluş ayarları yüklenemedi"
          description="Aktif kuruluş bilgisi şu anda alınamıyor. Sunucu yapılandırmasını kontrol edip yeniden deneyin."
          actions={[
            { href: "/settings/organization", label: "Tekrar Dene", primary: true },
            { href: "/", label: "Yönetici Özetine Dön" },
          ]}
        />
      </PageShell>
    );
  }

  return (
    <PageShell organizationName={organizationName}>
      <div className="max-w-3xl">
        <p className="mb-2 text-sm font-semibold text-blue-700">AKTİF KURULUŞ</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Kuruluş Ayarları</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">
          Uygulamada görünen kuruluş adını yönetin. Bu değişiklik veri kapsamını,
          içe aktarımları veya mevcut inceleme kayıtlarını değiştirmez.
        </p>
      </div>
      <section className="mt-8 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Aktif kuruluş</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{organizationName}</p>
        </div>
        <OrganizationNameForm initialName={organizationName} />
      </section>
    </PageShell>
  );
}

function PageShell({ organizationName, children }: { organizationName?: string; children: React.ReactNode }) {
  return (
    <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
      <AppHeader activeItem="organization-settings" organizationName={organizationName} />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">{children}</main>
    </div>
  );
}