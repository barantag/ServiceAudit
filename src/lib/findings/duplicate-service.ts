import { normalizeFindingComparison } from "@/lib/findings/repeated-failure";

export type DuplicateServiceReason = "sameInvoice" | "sameServiceDetails";

export type DuplicateServiceRecord = {
  id: string;
  createdAt: Date;
  locationCode: string | null;
  locationName: string | null;
  assetCode: string | null;
  assetType: string | null;
  failureType: string | null;
  serviceDate: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  amount: string | null;
  currency: string | null;
  sourceFileName: string | null;
  sourceRowNumber: number | null;
};

export type DuplicateServiceFinding = {
  findingKey: string;
  currentRecordId: string;
  previousRecordId: string;
  reasonType: DuplicateServiceReason;
  locationCode: string | null;
  locationName: string | null;
  assetCode: string;
  assetType: string | null;
  failureType: string;
  serviceDate: string;
  previousVendor: string | null;
  currentVendor: string | null;
  previousInvoiceNumber: string | null;
  currentInvoiceNumber: string | null;
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

export type PreparedDuplicateServiceRecord = {
  record: DuplicateServiceRecord;
  assetKey: string;
  failureKey: string;
  locationKey: string | null;
  vendorKey: string | null;
  invoiceKey: string | null;
  amountKey: string | null;
  currencyKey: string | null;
};

export function detectDuplicateServiceFindings(
  records: readonly DuplicateServiceRecord[],
): DuplicateServiceFinding[] {
  const preparedRecords = records
    .map(prepareDuplicateServiceRecord)
    .filter(
      (record): record is PreparedDuplicateServiceRecord => record !== null,
    )
    .sort(comparePreparedRecords);
  const histories = new Map<string, PreparedDuplicateServiceRecord[]>();
  const findings: DuplicateServiceFinding[] = [];

  for (const current of preparedRecords) {
    const historyKey = JSON.stringify([
      current.record.serviceDate,
      current.assetKey,
      current.failureKey,
    ]);
    const history = histories.get(historyKey) ?? [];
    const match = findNearestQualifyingRecord(history, current);

    if (match) {
      findings.push(createFinding(match.record, current, match.reasonType));
    }

    history.push(current);
    histories.set(historyKey, history);
  }

  return findings;
}

export function prepareDuplicateServiceRecord(
  record: DuplicateServiceRecord,
): PreparedDuplicateServiceRecord | null {
  const assetKey = normalizeOptionalComparison(record.assetCode);
  const failureKey = normalizeOptionalComparison(record.failureType);

  if (!assetKey || !failureKey || !isIsoDate(record.serviceDate)) {
    return null;
  }

  return {
    record,
    assetKey,
    failureKey,
    locationKey: normalizeOptionalComparison(record.locationCode),
    vendorKey: normalizeOptionalComparison(record.vendorName),
    invoiceKey: normalizeOptionalComparison(record.invoiceNumber),
    amountKey: normalizeAmount(record.amount),
    currencyKey: normalizeOptionalComparison(record.currency),
  };
}

function findNearestQualifyingRecord(
  history: readonly PreparedDuplicateServiceRecord[],
  current: PreparedDuplicateServiceRecord,
): {
  record: PreparedDuplicateServiceRecord;
  reasonType: DuplicateServiceReason;
} | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const candidate = history[index];

    if (
      candidate.record.id === current.record.id ||
      !locationsCanMatch(candidate, current)
    ) {
      continue;
    }

    const reasonType = getMatchingReason(candidate, current);

    if (reasonType) {
      return { record: candidate, reasonType };
    }
  }

  return null;
}

export function getMatchingReason(
  previous: PreparedDuplicateServiceRecord,
  current: PreparedDuplicateServiceRecord,
): DuplicateServiceReason | null {
  if (
    previous.invoiceKey !== null &&
    current.invoiceKey !== null &&
    previous.invoiceKey === current.invoiceKey &&
    knownValuesCanMatch(previous.vendorKey, current.vendorKey)
  ) {
    return "sameInvoice";
  }

  if (
    previous.vendorKey !== null &&
    current.vendorKey !== null &&
    previous.vendorKey === current.vendorKey &&
    previous.amountKey !== null &&
    current.amountKey !== null &&
    previous.amountKey === current.amountKey &&
    previous.currencyKey !== null &&
    current.currencyKey !== null &&
    previous.currencyKey === current.currencyKey
  ) {
    return "sameServiceDetails";
  }

  return null;
}

export function locationsCanMatch(
  previous: PreparedDuplicateServiceRecord,
  current: PreparedDuplicateServiceRecord,
): boolean {
  return knownValuesCanMatch(previous.locationKey, current.locationKey);
}

function knownValuesCanMatch(
  previous: string | null,
  current: string | null,
): boolean {
  return previous === null || current === null || previous === current;
}

function createFinding(
  previous: PreparedDuplicateServiceRecord,
  current: PreparedDuplicateServiceRecord,
  reasonType: DuplicateServiceReason,
): DuplicateServiceFinding {
  return {
    currentRecordId: current.record.id,
    findingKey: `duplicate-service:${previous.record.id}:${current.record.id}`,
    previousRecordId: previous.record.id,
    reasonType,
    locationCode: current.record.locationCode,
    locationName: current.record.locationName,
    assetCode: current.record.assetCode ?? "",
    assetType: current.record.assetType,
    failureType: current.record.failureType ?? "",
    serviceDate: current.record.serviceDate,
    previousVendor: previous.record.vendorName,
    currentVendor: current.record.vendorName,
    previousInvoiceNumber: previous.record.invoiceNumber,
    currentInvoiceNumber: current.record.invoiceNumber,
    previousAmount: previous.record.amount,
    previousCurrency: previous.record.currency,
    currentAmount: current.record.amount,
    currentCurrency: current.record.currency,
    previousSourceFileName: previous.record.sourceFileName,
    previousSourceRowNumber: previous.record.sourceRowNumber,
    currentSourceFileName: current.record.sourceFileName,
    currentSourceRowNumber: current.record.sourceRowNumber,
    explanation:
      reasonType === "sameInvoice"
        ? "Aynı fatura numarası aynı ekipman için aynı gün tekrar kullanılmış. Kayıtların incelenmesi önerilir."
        : "Aynı ekipman, arıza, servis firması ve tutarla aynı gün birden fazla kayıt bulundu. Kayıtların incelenmesi önerilir.",
  };
}

function normalizeOptionalComparison(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = normalizeFindingComparison(value);

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeAmount(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const integerPart = match[2].replace(/^0+(?=\d)/, "");
  const fractionalPart = (match[3] ?? "").replace(/0+$/, "");
  const isZero = /^0+$/.test(integerPart) && fractionalPart.length === 0;
  const sign = match[1] === "-" && !isZero ? "-" : "";

  return fractionalPart.length > 0
    ? `${sign}${integerPart}.${fractionalPart}`
    : `${sign}${integerPart}`;
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  );
}

function comparePreparedRecords(
  left: PreparedDuplicateServiceRecord,
  right: PreparedDuplicateServiceRecord,
): number {
  const dateComparison = left.record.serviceDate.localeCompare(
    right.record.serviceDate,
  );

  if (dateComparison !== 0) {
    return dateComparison;
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
