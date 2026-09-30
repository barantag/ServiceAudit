import { normalizeFindingComparison } from "@/lib/findings/repeated-failure";

export type WarrantyFindingServiceRecord = {
  id: string;
  createdAt: Date;
  locationCode: string | null;
  locationName: string | null;
  assetCode: string | null;
  assetType: string | null;
  failureType: string | null;
  serviceDate: string;
  vendorName: string | null;
  amount: string | null;
  currency: string | null;
  sourceFileName: string | null;
  sourceRowNumber: number | null;
};

export type WarrantyFindingWarrantyRecord = {
  id: string;
  locationCode: string | null;
  assetCode: string;
  warrantyStartDate: string;
  warrantyEndDate: string;
  providerName: string | null;
  sourceFileName: string | null;
  sourceRowNumber: number | null;
};

export type WarrantyServiceFinding = {
  findingKey: string;
  serviceRecordId: string;
  warrantyRecordId: string;
  locationCode: string | null;
  locationName: string | null;
  assetCode: string;
  assetType: string | null;
  failureType: string | null;
  serviceDate: string;
  serviceVendor: string | null;
  currentServiceAmount: string;
  currency: string | null;
  warrantyStartDate: string;
  warrantyEndDate: string;
  providerName: string | null;
  serviceSourceFileName: string | null;
  serviceSourceRowNumber: number | null;
  warrantySourceFileName: string | null;
  warrantySourceRowNumber: number | null;
  explanation: string;
};

export type PreparedServiceRecord = {
  record: WarrantyFindingServiceRecord;
  assetKey: string;
  locationKey: string | null;
  serviceDay: number;
};

export type PreparedWarrantyRecord = {
  record: WarrantyFindingWarrantyRecord;
  assetKey: string;
  locationKey: string | null;
  startDay: number;
  endDay: number;
};

const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE_HUNDRED = BigInt(100);

export function detectWarrantyServiceFindings(
  serviceRecords: readonly WarrantyFindingServiceRecord[],
  warrantyRecords: readonly WarrantyFindingWarrantyRecord[],
): WarrantyServiceFinding[] {
  const warrantiesByAsset = groupWarrantiesByAsset(warrantyRecords);
  const preparedServices = serviceRecords
    .map(prepareServiceRecord)
    .filter((record): record is PreparedServiceRecord => record !== null)
    .sort(compareServiceRecords);

  return preparedServices.flatMap((service) => {
    const warranty = findBestActiveWarranty(
      warrantiesByAsset.get(service.assetKey) ?? [],
      service,
    );

    return warranty ? [createFinding(service, warranty)] : [];
  });
}

function groupWarrantiesByAsset(
  warrantyRecords: readonly WarrantyFindingWarrantyRecord[],
): Map<string, PreparedWarrantyRecord[]> {
  const warrantiesByAsset = new Map<string, PreparedWarrantyRecord[]>();

  for (const record of warrantyRecords) {
    const prepared = prepareWarrantyRecord(record);

    if (!prepared) {
      continue;
    }

    const warranties = warrantiesByAsset.get(prepared.assetKey) ?? [];
    warranties.push(prepared);
    warrantiesByAsset.set(prepared.assetKey, warranties);
  }

  for (const warranties of warrantiesByAsset.values()) {
    warranties.sort(compareWarrantyPriority);
  }

  return warrantiesByAsset;
}

export function prepareServiceRecord(
  record: WarrantyFindingServiceRecord,
): PreparedServiceRecord | null {
  const assetKey = normalizeOptionalComparison(record.assetCode);
  const locationKey = normalizeOptionalComparison(record.locationCode);
  const serviceDay = parseIsoDateToUtc(record.serviceDate);
  const amountInCents = parseAmountInCents(record.amount);

  if (
    !assetKey ||
    serviceDay === null ||
    amountInCents === null ||
    amountInCents <= BIGINT_ZERO
  ) {
    return null;
  }

  return { record, assetKey, locationKey, serviceDay };
}

export function prepareWarrantyRecord(
  record: WarrantyFindingWarrantyRecord,
): PreparedWarrantyRecord | null {
  const assetKey = normalizeOptionalComparison(record.assetCode);
  const locationKey = normalizeOptionalComparison(record.locationCode);
  const startDay = parseIsoDateToUtc(record.warrantyStartDate);
  const endDay = parseIsoDateToUtc(record.warrantyEndDate);

  if (
    !assetKey ||
    startDay === null ||
    endDay === null ||
    endDay < startDay
  ) {
    return null;
  }

  return { record, assetKey, locationKey, startDay, endDay };
}

function findBestActiveWarranty(
  warranties: readonly PreparedWarrantyRecord[],
  service: PreparedServiceRecord,
): PreparedWarrantyRecord | null {
  return (
    warranties.find(
      (warranty) =>
        warranty.startDay <= service.serviceDay &&
        service.serviceDay <= warranty.endDay &&
        locationsCanMatch(service.locationKey, warranty.locationKey),
    ) ?? null
  );
}

export function locationsCanMatch(
  serviceLocation: string | null,
  warrantyLocation: string | null,
): boolean {
  return (
    serviceLocation === null ||
    warrantyLocation === null ||
    serviceLocation === warrantyLocation
  );
}

function createFinding(
  service: PreparedServiceRecord,
  warranty: PreparedWarrantyRecord,
): WarrantyServiceFinding {
  return {
    serviceRecordId: service.record.id,
    findingKey: `warranty-service:${service.record.id}:${warranty.record.id}`,
    warrantyRecordId: warranty.record.id,
    locationCode: service.record.locationCode,
    locationName: service.record.locationName,
    assetCode: service.record.assetCode ?? "",
    assetType: service.record.assetType,
    failureType: service.record.failureType,
    serviceDate: service.record.serviceDate,
    serviceVendor: service.record.vendorName,
    currentServiceAmount: service.record.amount ?? "",
    currency: service.record.currency,
    warrantyStartDate: warranty.record.warrantyStartDate,
    warrantyEndDate: warranty.record.warrantyEndDate,
    providerName: warranty.record.providerName,
    serviceSourceFileName: service.record.sourceFileName,
    serviceSourceRowNumber: service.record.sourceRowNumber,
    warrantySourceFileName: warranty.record.sourceFileName,
    warrantySourceRowNumber: warranty.record.sourceRowNumber,
    explanation:
      "Bu ücretli servis kaydının tarihinde ekipman için aktif bir garanti kaydı bulunuyor. Garanti kapsamının kontrol edilmesi önerilir.",
  };
}

function normalizeOptionalComparison(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = normalizeFindingComparison(value);

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function parseAmountInCents(value: string | null): bigint | null {
  if (value === null) {
    return null;
  }

  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const integerPart = BigInt(match[2]);
  const fractionalPart = BigInt((match[3] ?? "").padEnd(2, "0"));
  const amountInCents =
    integerPart * BIGINT_ONE_HUNDRED + fractionalPart;

  return match[1] === "-" ? -amountInCents : amountInCents;
}

function parseIsoDateToUtc(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = Date.UTC(year, month - 1, day);
  const parsedDate = new Date(utcDate);

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return null;
  }

  return utcDate;
}

function compareWarrantyPriority(
  left: PreparedWarrantyRecord,
  right: PreparedWarrantyRecord,
): number {
  if (left.startDay !== right.startDay) {
    return right.startDay - left.startDay;
  }

  if (left.record.id === right.record.id) {
    return 0;
  }

  return left.record.id < right.record.id ? -1 : 1;
}

function compareServiceRecords(
  left: PreparedServiceRecord,
  right: PreparedServiceRecord,
): number {
  if (left.serviceDay !== right.serviceDay) {
    return left.serviceDay - right.serviceDay;
  }

  const createdAtComparison =
    left.record.createdAt.getTime() - right.record.createdAt.getTime();

  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  const sourceFileComparison = (
    left.record.sourceFileName ?? ""
  ).localeCompare(right.record.sourceFileName ?? "");

  if (sourceFileComparison !== 0) {
    return sourceFileComparison;
  }

  const sourceRowComparison =
    (left.record.sourceRowNumber ?? Number.MAX_SAFE_INTEGER) -
    (right.record.sourceRowNumber ?? Number.MAX_SAFE_INTEGER);

  if (sourceRowComparison !== 0) {
    return sourceRowComparison;
  }

  if (left.record.id === right.record.id) {
    return 0;
  }

  return left.record.id < right.record.id ? -1 : 1;
}
