"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";

export default function ApplicationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("ServiceAudit route error", error);
  }, [error]);

  return (
    <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <section role="alert" className="max-w-3xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-red-700">İŞLEM TAMAMLANAMADI</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sayfa şu anda yüklenemiyor</h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">Beklenmeyen bir sorun oluştu. İşlemi yeniden deneyebilir veya güvenli bir başlangıç noktası olarak yönetici özetine dönebilirsiniz.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">Tekrar Dene</button>
            <Link href="/" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100">Yönetici Özetine Dön</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
