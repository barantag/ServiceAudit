import { normalizeFindingComparison } from "@/lib/findings/repeated-failure";

export type AbnormalPriceServiceRecord = {
  id: string;
  createdAt: Date;
  locationCode: string | null;
  locationName: string | null;
  assetCode: string | null;
  assetType: string | null;
  failureType: string | null;
  vendorName: string | null;
  serviceDate: string;
  amount: string | null;
  currency: string | null;
  sourceFileName: string | null;
  sourceRowNumber: number | null;
};

export type AbnormalPriceFinding = {
  findingKey: string;
  currentRecordId: string;
  locationCode: string | null;
  locationName: string | null;
  assetCode: string | null;
  assetType: string;
  failureType: string;
  vendorName: string;
  serviceDate: string;
  currentAmount: string;
  currency: string;
  historicalMedian: string;
  historicalComparableRecordCount: number;
  percentageAboveMedian: string;
  oldestHistoricalDate: string;
  newestHistoricalDate: string;
  sourceFileName: string | null;
  sourceRowNumber: number | null;
  explanation: string;
};

export type PreparedPriceRecord = {
  record: AbnormalPriceServiceRecord;
  assetTypeKey: string;
  failureTypeKey: string;
  vendorNameKey: string;
  currencyKey: string;
  serviceDay: number;
  amountInCents: bigint;
};

type MedianInCents = {
  numerator: bigint;
  denominator: bigint;
};

const MILLISECONDS_PER_DAY = 86_400_000;
export const HISTORICAL_WINDOW_DAYS = 180;
export const MINIMUM_HISTORICAL_RECORDS = 3;
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const BIGINT_TWO = BigInt(2);
const BIGINT_THREE = BigInt(3);
const BIGINT_FIVE = BigInt(5);
const BIGINT_TEN = BigInt(10);
const BIGINT_ONE_HUNDRED = BigInt(100);
const BIGINT_ONE_THOUSAND = BigInt(1_000);

export function detectAbnormalPriceFindings(
  records: readonly AbnormalPriceServiceRecord[],
): AbnormalPriceFinding[] {
  const preparedRecords = records
    .map(preparePriceRecord)
    .filter((record): record is PreparedPriceRecord => record !== null)
    .sort(comparePreparedRecords);
  const histories = new Map<string, PreparedPriceRecord[]>();
  const findings: AbnormalPriceFinding[] = [];

  for (const current of preparedRecords) {
    const profileKey = JSON.stringify([
      current.assetTypeKey,
      current.failureTypeKey,
      current.vendorNameKey,
      current.currencyKey,
    ]);
    const history = histories.get(profileKey) ?? [];
    const comparableRecords = findComparableHistoricalRecords(history, current);

    if (comparableRecords.length >= MINIMUM_HISTORICAL_RECORDS) {
      const median = calculateMedian(
        comparableRecords.map((record) => record.amountInCents),
      );

      if (isAtLeastFiftyPercentHigher(current.amountInCents, median)) {
        findings.push(createFinding(current, comparableRecords, median));
      }
    }

    history.push(current);
    histories.set(profileKey, history);
  }

  return findings;
}

export function preparePriceRecord(
  record: AbnormalPriceServiceRecord,
): PreparedPriceRecord | null {
  const assetTypeKey = normalizeRequiredComparison(record.assetType);
  const failureTypeKey = normalizeRequiredComparison(record.failureType);
  const vendorNameKey = normalizeRequiredComparison(record.vendorName);
  const currencyKey = normalizeRequiredComparison(record.currency);
  const serviceDay = parseIsoDateToUtc(record.serviceDate);
  const amountInCents = parseAmountInCents(record.amount);

  if (
    !assetTypeKey ||
    !failureTypeKey ||
    !vendorNameKey ||
    !currencyKey ||
    serviceDay === null ||
    amountInCents === null ||
    amountInCents <= BIGINT_ZERO
  ) {
    return null;
  }

  return {
    record,
    assetTypeKey,
    failureTypeKey,
    vendorNameKey,
    currencyKey,
    serviceDay,
    amountInCents,
  };
}

function findComparableHistoricalRecords(
  history: readonly PreparedPriceRecord[],
  current: PreparedPriceRecord,
): PreparedPriceRecord[] {
  const comparableRecords: PreparedPriceRecord[] = [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const candidate = history[index];
    const daysBetween =
      (current.serviceDay - candidate.serviceDay) / MILLISECONDS_PER_DAY;

    if (daysBetween > HISTORICAL_WINDOW_DAYS) {
      break;
    }

    if (daysBetween >= 1) {
      comparableRecords.push(candidate);
    }
  }

  return comparableRecords;
}

function calculateMedian(amounts: readonly bigint[]): MedianInCents {
  const sortedAmounts = [...amounts].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const middleIndex = Math.floor(sortedAmounts.length / 2);

  if (sortedAmounts.length % 2 === 1) {
    return {
      numerator: sortedAmounts[middleIndex],
      denominator: BIGINT_ONE,
    };
  }

  return {
    numerator:
      sortedAmounts[middleIndex - 1] + sortedAmounts[middleIndex],
    denominator: BIGINT_TWO,
  };
}

function isAtLeastFiftyPercentHigher(
  currentAmountInCents: bigint,
  median: MedianInCents,
): boolean {
  return (
    currentAmountInCents * BIGINT_TWO * median.denominator >=
    median.numerator * BIGINT_THREE
  );
}

function createFinding(
  current: PreparedPriceRecord,
  comparableRecords: readonly PreparedPriceRecord[],
  median: MedianInCents,
): AbnormalPriceFinding {
  const percentageAboveMedian = calculatePercentageAboveMedian(
    current.amountInCents,
    median,
  );
  const oldestHistoricalRecord = comparableRecords.at(-1);
  const newestHistoricalRecord = comparableRecords[0];

  if (!oldestHistoricalRecord || !newestHistoricalRecord) {
    throw new Error("Comparable historical records are missing");
  }

  return {
    currentRecordId: current.record.id,
    findingKey: `abnormal-price:${current.record.id}`,
    locationCode: current.record.locationCode,
    locationName: current.record.locationName,
    assetCode: current.record.assetCode,
    assetType: current.record.assetType ?? "",
    failureType: current.record.failureType ?? "",
    vendorName: current.record.vendorName ?? "",
    serviceDate: current.record.serviceDate,
    currentAmount: current.record.amount ?? "",
    currency: current.record.currency ?? "",
    historicalMedian: formatMedianAmount(median),
    historicalComparableRecordCount: comparableRecords.length,
    percentageAboveMedian,
    oldestHistoricalDate: oldestHistoricalRecord.record.serviceDate,
    newestHistoricalDate: newestHistoricalRecord.record.serviceDate,
    sourceFileName: current.record.sourceFileName,
    sourceRowNumber: current.record.sourceRowNumber,
    explanation: `Bu servis tutarı, son 180 gündeki ${comparableRecords.length} benzer kaydın medyanından %${percentageAboveMedian.replace(".", ",")} daha yüksek. İncelenmesi önerilir.`,
  };
}

function normalizeRequiredComparison(value: string | null): string | null {
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

function calculatePercentageAboveMedian(
  currentAmountInCents: bigint,
  median: MedianInCents,
): string {
  const increaseNumerator =
    currentAmountInCents * median.denominator - median.numerator;
  const tenthsOfAPercent = divideAndRound(
    increaseNumerator * BIGINT_ONE_THOUSAND,
    median.numerator,
  );

  return `${tenthsOfAPercent / BIGINT_TEN}.${tenthsOfAPercent % BIGINT_TEN}`;
}

function divideAndRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / BIGINT_TWO) / denominator;
}

function formatMedianAmount(median: MedianInCents): string {
  if (median.denominator === BIGINT_ONE) {
    return formatScaledInteger(median.numerator, 2);
  }

  return formatScaledInteger(median.numerator * BIGINT_FIVE, 3);
}

function formatScaledInteger(value: bigint, scale: number): string {
  const scaleFactor = BIGINT_TEN ** BigInt(scale);
  const integerPart = value / scaleFactor;
  let fractionalPart = (value % scaleFactor).toString().padStart(scale, "0");

  while (fractionalPart.length > 2 && fractionalPart.endsWith("0")) {
    fractionalPart = fractionalPart.slice(0, -1);
  }

  return `${integerPart}.${fractionalPart}`;
}

function comparePreparedRecords(
  left: PreparedPriceRecord,
  right: PreparedPriceRecord,
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
