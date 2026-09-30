import type { serviceRecords, warranties } from "@/db/schema";

import {
  prepareServiceRecord as prepareRepeatedFailureRecord,
  calculateDaysBetween,
  locationsCanMatch as repeatedFailureLocationsCanMatch
} from "./repeated-failure";

import {
  prepareDuplicateServiceRecord,
  locationsCanMatch as duplicateServiceLocationsCanMatch
} from "./duplicate-service";

import {
  preparePriceRecord,
  MINIMUM_HISTORICAL_RECORDS,
  HISTORICAL_WINDOW_DAYS
} from "./abnormal-price";

import {
  prepareServiceRecord as prepareWarrantyServiceRecord,
  prepareWarrantyRecord,
  locationsCanMatch as warrantyServiceLocationsCanMatch
} from "./warranty-service";

type ServiceRecord = typeof serviceRecords.$inferSelect;
type WarrantyRecord = typeof warranties.$inferSelect;

export type AnalysisReadinessStatus = "Hazır" | "Sınırlı" | "Veri gerekli";

export type AnalysisReadiness = {
  type: "repeated-failure" | "duplicate-service" | "abnormal-price" | "warranty-service";
  name: string;
  status: AnalysisReadinessStatus;
  reason: string;
};

export function calculateAnalysisReadiness(
  records: readonly ServiceRecord[],
  warrantiesData: readonly WarrantyRecord[]
): AnalysisReadiness[] {
  return [
    evaluateRepeatedFailure(records),
    evaluateDuplicateService(records),
    evaluateAbnormalPrice(records),
    evaluateWarrantyService(records, warrantiesData),
  ];
}

function evaluateRepeatedFailure(records: readonly ServiceRecord[]): AnalysisReadiness {
  const preparedRecords = records
    .map(r => prepareRepeatedFailureRecord(r))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((left, right) => left.serviceDay - right.serviceDay);

  if (preparedRecords.length === 0) {
    return {
      type: "repeated-failure",
      name: "Tekrarlayan Arıza",
      status: "Veri gerekli",
      reason: "Tekrarlayan arızaları karşılaştırmak için ekipman, arıza türü ve geçmiş servis kayıtları gerekir."
    };
  }

  let hasReady = false;
  const histories = new Map<string, typeof preparedRecords>();

  for (const current of preparedRecords) {
    const historyKey = JSON.stringify([current.assetKey, current.failureKey]);
    const history = histories.get(historyKey) ?? [];

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const candidate = history[index];
      const daysBetween = calculateDaysBetween(candidate.serviceDay, current.serviceDay);

      // We only require that there is a chronological comparison history
      // (at least 1 day apart) for the same asset/failure/location.
      // We DO NOT require them to be within MAX_REPEAT_INTERVAL_DAYS.
      if (daysBetween >= 1 && repeatedFailureLocationsCanMatch(candidate, current)) {
        hasReady = true;
        break;
      }
    }

    if (hasReady) break;

    history.push(current);
    histories.set(historyKey, history);
  }

  if (hasReady) {
    return {
      type: "repeated-failure",
      name: "Tekrarlayan Arıza",
      status: "Hazır",
      reason: "Ekipman ve arıza geçmişi kullanılarak tekrarlayan arızalar karşılaştırılabilir."
    };
  }

  return {
    type: "repeated-failure",
    name: "Tekrarlayan Arıza",
    status: "Sınırlı",
    reason: "Karşılaştırma yapabilmek için aynı ekipman ve arızayı içeren, farklı tarihli daha fazla kayıt gerekiyor."
  };
}

function evaluateDuplicateService(records: readonly ServiceRecord[]): AnalysisReadiness {
  const preparedRecords = records
    .map(r => prepareDuplicateServiceRecord(r))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (preparedRecords.length === 0) {
    return {
      type: "duplicate-service",
      name: "Mükerrer Servis",
      status: "Veri gerekli",
      reason: "Mükerrer kontrolü için fatura numarası veya firma, tutar, para birimi bilgileri gerekir."
    };
  }

  let hasReady = false;
  const histories = new Map<string, typeof preparedRecords>();

  for (const current of preparedRecords) {
    const historyKey = JSON.stringify([
      current.record.serviceDate,
      current.assetKey,
      current.failureKey,
    ]);
    const history = histories.get(historyKey) ?? [];

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const candidate = history[index];

      if (candidate.record.id === current.record.id || !duplicateServiceLocationsCanMatch(candidate, current)) {
        continue;
      }

      // We DO NOT require the invoice numbers or details to match exactly.
      // We just need them to both contain sufficient basis data to make a comparison.
      const hasInvoicePath = candidate.invoiceKey !== null && current.invoiceKey !== null;
      const hasDetailsPath =
        candidate.vendorKey !== null && current.vendorKey !== null &&
        candidate.amountKey !== null && current.amountKey !== null &&
        candidate.currencyKey !== null && current.currencyKey !== null;

      if (hasInvoicePath || hasDetailsPath) {
        hasReady = true;
        break;
      }
    }

    if (hasReady) break;

    history.push(current);
    histories.set(historyKey, history);
  }

  if (hasReady) {
    return {
      type: "duplicate-service",
      name: "Mükerrer Servis",
      status: "Hazır",
      reason: "Fatura numarası veya firma-tutar-para birimi yapıları ile mükerrer kontrolü yapılabilir."
    };
  }

  return {
    type: "duplicate-service",
    name: "Mükerrer Servis",
    status: "Sınırlı",
    reason: "Eşleşme bulabilmek için aynı gün ve ekipmanda daha fazla detaylı servis kaydı gerekiyor."
  };
}

function evaluateAbnormalPrice(records: readonly ServiceRecord[]): AnalysisReadiness {
  const preparedRecords = records
    .map(r => preparePriceRecord(r))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((left, right) => left.serviceDay - right.serviceDay);

  if (preparedRecords.length === 0) {
    return {
      type: "abnormal-price",
      name: "Anormal Fiyat",
      status: "Veri gerekli",
      reason: "Karşılaştırma için servis türü, firma, tutar ve para birimi bilgilerini içeren geçmiş kayıtlar gerekir."
    };
  }

  let hasSufficientHistory = false;
  const cohorts = new Map<string, typeof preparedRecords>();

  for (const record of preparedRecords) {
    const profileKey = JSON.stringify([
      record.assetTypeKey,
      record.failureTypeKey,
      record.vendorNameKey,
      record.currencyKey,
    ]);
    const history = cohorts.get(profileKey) ?? [];

    let comparableCount = 0;
    const MILLISECONDS_PER_DAY = 86_400_000;

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const candidate = history[index];
      const daysBetween = (record.serviceDay - candidate.serviceDay) / MILLISECONDS_PER_DAY;

      if (daysBetween > HISTORICAL_WINDOW_DAYS) {
        break;
      }

      if (daysBetween >= 1) {
        comparableCount++;
      }
    }

    if (comparableCount >= MINIMUM_HISTORICAL_RECORDS) {
      hasSufficientHistory = true;
      break;
    }

    history.push(record);
    cohorts.set(profileKey, history);
  }

  if (!hasSufficientHistory) {
    return {
      type: "abnormal-price",
      name: "Anormal Fiyat",
      status: "Sınırlı",
      reason: `Fiyat karşılaştırması için yeterli sayıda benzer geçmiş servis kaydı (en az ${MINIMUM_HISTORICAL_RECORDS}) bulunamadı.`
    };
  }

  return {
    type: "abnormal-price",
    name: "Anormal Fiyat",
    status: "Hazır",
    reason: "Fiyatlar şirketin kendi geçmiş verilerindeki medyan değerlere göre karşılaştırılabilir."
  };
}

function evaluateWarrantyService(records: readonly ServiceRecord[], warrantiesData: readonly WarrantyRecord[]): AnalysisReadiness {
  const preparedWarranties = warrantiesData
    .map(w => prepareWarrantyRecord(w))
    .filter((w): w is NonNullable<typeof w> => w !== null);

  if (preparedWarranties.length === 0) {
    return {
      type: "warranty-service",
      name: "Garanti Kontrolü",
      status: "Veri gerekli",
      reason: "Garanti kontrolü için sisteme aktarılmış kullanılabilir garanti dönemi bilgisi gerekir."
    };
  }

  const preparedServices = records
    .map(r => prepareWarrantyServiceRecord(r))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let hasReady = false;

  for (const service of preparedServices) {
    for (const warranty of preparedWarranties) {
      // We DO NOT require the service date to be inside the warranty interval.
      // We just need them to be meaningfully joinable by equipment and location.
      if (
        warranty.assetKey === service.assetKey &&
        warrantyServiceLocationsCanMatch(service.locationKey, warranty.locationKey)
      ) {
        hasReady = true;
        break;
      }
    }
    if (hasReady) break;
  }

  if (hasReady) {
    return {
      type: "warranty-service",
      name: "Garanti Kontrolü",
      status: "Hazır",
      reason: "Sisteme aktarılan garanti bilgileri kullanılarak servis kayıtları kontrol edilebilir."
    };
  }

  return {
    type: "warranty-service",
    name: "Garanti Kontrolü",
    status: "Sınırlı",
    reason: "Garanti verileri mevcut, ancak servis kayıtlarıyla ekipman ve lokasyon bilgileri üzerinden anlamlı eşleşme kurulamıyor."
  };
}
