import { AppHeader } from "@/components/app-header";
import Link from "next/link";
export default function FindingNotFound() {
  return <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
    <AppHeader activeItem="findings" />
    <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-blue-700">BULGU İNCELEMESİ</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Bulgu bulunamadı</h1>
        <p className="mt-3 leading-7 text-slate-600">Bu anahtara ait güncel bir bulgu yok. Kaynak kayıtlar değişmiş olabilir.</p>
        <Link href="/findings" className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100">Bulgulara Dön</Link>
      </section>
    </main>
  </div>;
}
