import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/feedback-state";

export default function NotFound() {
  return (
    <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <EmptyState
          title="Sayfa bulunamadı"
          description="Aradığınız sayfa kaldırılmış, taşınmış veya adresi hatalı yazılmış olabilir."
          actions={[
            { href: "/", label: "Yönetici Özetine Dön", primary: true },
            { href: "/findings", label: "Bulguları Gör" },
          ]}
        />
      </main>
    </div>
  );
}
