export type RepeatedFailureServiceRecord = {
  id: string;
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

export type RepeatedFailureFinding = {
  findingKey: string;
  currentRecordId: string;
  previousRecordId: string;
  locationCode: string | null;
  locationName: string | null;
  assetCode: string;
  assetType: string | null;
  failureType: string;
  previousDate: string;
  currentDate: string;
  daysBetween: number;
  previousVendor: string | null;
  currentVendor: string | null;
  previousAmount: string | null;
  previousCurrency: string | null;
  currentAmount: string | null;
  currentCurrency: string | null;
  previousSourceFileName: string | null;
  previousSourceRowNumber: number | null;
  currentSourceFileName: string | null;
  currentSourceRowNumber: number | null;
  explanation: string;
};

export type PreparedServiceRecord = {
  record: RepeatedFailureServiceRecord;
  assetKey: string;
  failureKey: string;
  locationKey: string | null;
  serviceDay: number;
};

const MILLISECONDS_PER_DAY = 86_400_000;
export const MAX_REPEAT_INTERVAL_DAYS = 30;

export function detectRepeatedFailureFindings(
  records: readonly RepeatedFailureServiceRecord[],
): RepeatedFailureFinding[] {
  const preparedRecords = records
    .map(prepareServiceRecord)
    .filter((record): record is PreparedServiceRecord => record !== null)
    .sort(comparePreparedRecords);
  const histories = new Map<string, PreparedServiceRecord[]>();
  const findings: RepeatedFailureFinding[] = [];

  for (const current of preparedRecords) {
    const historyKey = JSON.stringify([current.assetKey, current.failureKey]);
    const history = histories.get(historyKey) ?? [];
    const previous = findNearestPreviousRecord(history, current);

    if (previous) {
      const daysBetween = calculateDaysBetween(
        previous.serviceDay,
        current.serviceDay,
      );

      findings.push(createFinding(previous, current, daysBetween));
    }

    history.push(current);
    histories.set(historyKey, history);
  }

  return findings;
}

export function normalizeFindingComparison(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ");
}

export function prepareServiceRecord(
  record: RepeatedFailureServiceRecord,
): PreparedServiceRecord | null {
  const assetKey = normalizeOptionalComparison(record.assetCode);
  const failureKey = normalizeOptionalComparison(record.failureType);
  const serviceDay = parseIsoDateToUtc(record.serviceDate);

  if (!assetKey || !failureKey || serviceDay === null) {
    return null;
  }

  return {
    record,
    assetKey,
    failureKey,
    locationKey: normalizeOptionalComparison(record.locationCode),
    serviceDay,
  };
}

function findNearestPreviousRecord(
  history: readonly PreparedServiceRecord[],
  current: PreparedServiceRecord,
): PreparedServiceRecord | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const candidate = history[index];
    const daysBetween = calculateDaysBetween(
      candidate.serviceDay,
      current.serviceDay,
    );

    if (daysBetween > MAX_REPEAT_INTERVAL_DAYS) {
      break;
    }

    if (daysBetween >= 1 && locationsCanMatch(candidate, current)) {
      return candidate;
    }
  }

  return null;
}

export function locationsCanMatch(
  previous: PreparedServiceRecord,
  current: PreparedServiceRecord,
): boolean {
  return (
    previous.locationKey === null ||
    current.locationKey === null ||
    previous.locationKey === current.locationKey
  );
}

function createFinding(
  previous: PreparedServiceRecord,
  current: PreparedServiceRecord,
  daysBetween: number,
): RepeatedFailureFinding {
  return {
    currentRecordId: current.record.id,
    findingKey: `repeated-failure:${previous.record.id}:${current.record.id}`,
    previousRecordId: previous.record.id,
    locationCode: current.record.locationCode,
    locationName: current.record.locationName,
    assetCode: current.record.assetCode ?? "",
    assetType: current.record.assetType,
    failureType: current.record.failureType ?? "",
    previousDate: previous.record.serviceDate,
    currentDate: current.record.serviceDate,
    daysBetween,
    previousVendor: previous.record.vendorName,
    currentVendor: current.record.vendorName,
    previousAmount: previous.record.amount,
    previousCurrency: previous.record.currency,
    currentAmount: current.record.amount,
    currentCurrency: current.record.currency,
    previousSourceFileName: previous.record.sourceFileName,
    previousSourceRowNumber: previous.record.sourceRowNumber,
    currentSourceFileName: current.record.sourceFileName,
    currentSourceRowNumber: current.record.sourceRowNumber,
    explanation: `Aynı ekipmanda aynı arıza ${daysBetween} gün içinde tekrarlandı.`,
  };
}

function normalizeOptionalComparison(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = normalizeFindingComparison(value);

  return normalizedValue.length > 0 ? normalizedValue : null;
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

export function calculateDaysBetween(previousDay: number, currentDay: number): number {
  return (currentDay - previousDay) / MILLISECONDS_PER_DAY;
}

function comparePreparedRecords(
  left: PreparedServiceRecord,
  right: PreparedServiceRecord,
): number {
  if (left.serviceDay !== right.serviceDay) {
    return left.serviceDay - right.serviceDay;
  }

  if (left.record.id === right.record.id) {
    return 0;
  }

  return left.record.id < right.record.id ? -1 : 1;
}
