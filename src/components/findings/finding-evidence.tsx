import type { CurrentFinding } from "@/lib/findings/current-finding";

type EvidenceItem = { label: string; value: string | number | null };
const item = (label: string, value: EvidenceItem["value"]): EvidenceItem => ({ label, value });
const date = (value: string) => value.split("-").reverse().join(".");
const money = (amount: string | null, currency: string | null) =>
  amount === null ? null : `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(Number(amount))}${currency ? ` ${currency}` : ""}`;
const source = (file: string | null, row: number | null) =>
  `${file || "Kaynak dosya belirtilmemiş"}${row === null ? "" : ` · Satır ${row}`}`;

function evidenceFor(entry: CurrentFinding): EvidenceItem[] {
  switch (entry.type) {
    case "repeated-failure": {
      const f = entry.finding;
      return [
        item("Karşılaştırılan geçmiş kayıt", f.previousRecordId), item("Güncel servis kaydı", f.currentRecordId),
        item("Önceki tarih", date(f.previousDate)), item("Güncel tarih", date(f.currentDate)),
        item("Gün aralığı", f.daysBetween), item("Önceki servis firması", f.previousVendor),
        item("Güncel servis firması", f.currentVendor), item("Önceki tutar", money(f.previousAmount, f.previousCurrency)),
        item("İncelenecek tutar", money(f.currentAmount, f.currentCurrency)),
        item("Önceki kaynak", source(f.previousSourceFileName, f.previousSourceRowNumber)),
        item("Güncel kaynak", source(f.currentSourceFileName, f.currentSourceRowNumber)),
      ];
    }
    case "duplicate-service": {
      const f = entry.finding;
      const isInvoice = f.reasonType === "sameInvoice";
      return [
        item("Karşılaştırılan geçmiş kayıt", f.previousRecordId), item("Güncel servis kaydı", f.currentRecordId),
        item("Servis tarihi", date(f.serviceDate)),
        ...(isInvoice ? [
          item("Önceki fatura no", f.previousInvoiceNumber), item("Güncel fatura no", f.currentInvoiceNumber),
          item("Önceki servis firması", f.previousVendor), item("Güncel servis firması", f.currentVendor),
        ] : [
          item("Önceki servis firması", f.previousVendor), item("Güncel servis firması", f.currentVendor),
          item("Önceki tutar", money(f.previousAmount, f.previousCurrency)), item("İncelenecek tutar", money(f.currentAmount, f.currentCurrency)),
        ]),
        item("Önceki kaynak", source(f.previousSourceFileName, f.previousSourceRowNumber)),
        item("Güncel kaynak", source(f.currentSourceFileName, f.currentSourceRowNumber)),
      ];
    }
    case "abnormal-price": {
      const f = entry.finding;
      return [
        item("Servis kaydı", f.currentRecordId), item("Servis tarihi", date(f.serviceDate)),
        item("Servis firması", f.vendorName), item("İncelenecek tutar", money(f.currentAmount, f.currency)),
        item("Benzer geçmiş kayıtların medyanı", money(f.historicalMedian, f.currency)),
        item("Medyanın üzerinde", `%${f.percentageAboveMedian.replace(".", ",")}`),
        item("Karşılaştırılan geçmiş kayıt sayısı", f.historicalComparableRecordCount),
        item("Geçmiş kayıt inceleme süresi", "Son 180 gün"),
        item("Karşılaştırma dönemi", `${date(f.oldestHistoricalDate)} → ${date(f.newestHistoricalDate)}`),
        item("Karşılaştırma kriterleri", "Ekipman türü, arıza türü, servis firması, para birimi"),
        item("Kaynak", source(f.sourceFileName, f.sourceRowNumber)),
      ];
    }
    case "warranty-service": {
      const f = entry.finding;
      return [
        item("Servis kaydı", f.serviceRecordId), item("Garanti kaydı", f.warrantyRecordId),
        item("Servis tarihi", date(f.serviceDate)), item("Servis firması", f.serviceVendor),
        item("İncelenecek tutar", money(f.currentServiceAmount, f.currency)),
        item("Sisteme aktarılan garanti dönemi", `${date(f.warrantyStartDate)} → ${date(f.warrantyEndDate)}`),
        item("Garanti sağlayıcı", f.providerName),
        item("Servis kaynağı", source(f.serviceSourceFileName, f.serviceSourceRowNumber)),
        item("Garanti kaynağı", source(f.warrantySourceFileName, f.warrantySourceRowNumber)),
      ];
    }
  }
}

export function FindingEvidence({ entry }: { entry: CurrentFinding }) {
  const f = entry.finding;
  const evidence = [
    item("Lokasyon adı", f.locationName), item("Lokasyon kodu", f.locationCode),
    item("Ekipman kodu", f.assetCode), item("Ekipman türü", f.assetType),
    item("Arıza türü", f.failureType), ...evidenceFor(entry),
  ];
  return (
    <section aria-labelledby="evidence-title" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="evidence-title" className="text-lg font-semibold">Neden bu kayıt incelemeye alındı?</h2>

      <div className="mt-4 rounded-lg bg-blue-50/50 p-4 border border-blue-100">
        <p className="text-sm font-medium text-blue-900 leading-6">{f.explanation}</p>
        {entry.type === "abnormal-price" && (
          <p className="mt-2 text-sm text-blue-800">
            <strong>Not:</strong> Bu karşılaştırma piyasa fiyatına göre değil, şirketin kendi geçmiş benzer servis kayıtlarına göre yapılır.
          </p>
        )}
      </div>

      <h3 className="mt-8 text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">Destekleyici kanıtlar</h3>
      <dl className="mt-5 grid gap-5 sm:grid-cols-2">
        {evidence.map(({ label, value }) => <div key={label}>
          <dt className="text-sm text-slate-500">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-900">{value === null || value === "" ? "Belirtilmemiş" : value}</dd>
        </div>)}
      </dl>
    </section>
  );
}
