import type { CurrentFinding } from "./current-finding";
import type { FindingReview, ReviewStatus } from "./review-contract";

export const MANAGER_FINDING_TYPE_LABELS = {
  "repeated-failure": "Tekrarlayan Arıza",
  "duplicate-service": "Mükerrer Servis Kaydı",
  "abnormal-price": "Anormal Servis Fiyatı",
  "warranty-service": "Garanti Süresinde Ücretli Servis",
} satisfies Record<CurrentFinding["type"], string>;

const FINDING_TYPE_ORDER = [
  "repeated-failure",
  "duplicate-service",
  "abnormal-price",
  "warranty-service",
] as const satisfies readonly CurrentFinding["type"][];

const BIGINT_ONE_HUNDRED = BigInt(100);

type StatusCounts = Record<ReviewStatus, number>;

export type ManagerFindingTypeSummary = StatusCounts & {
  type: CurrentFinding["type"];
  label: string;
  total: number;
};

export type ManagerReviewAmount = {
  currency: string;
  amount: string;
};

export type ManagerPriorityFinding = {
  findingKey: string;
  type: CurrentFinding["type"];
  typeLabel: string;
  explanation: string;
  currentServiceRecordId: string;
  currentAmount: string | null;
  currency: string | null;
  status: "open";
};

export type ManagerSummary = {
  totalFindingCount: number;
  statusCounts: StatusCounts;
  uniqueServiceRecordCount: number;
  reviewAmounts: ManagerReviewAmount[];
  typeBreakdown: ManagerFindingTypeSummary[];
  priorityFindings: ManagerPriorityFinding[];
};

type CurrentServiceReference = {
  id: string;
  amount: string | null;
  currency: string | null;
  explanation: string;
};

export function createManagerSummary(
  findings: readonly CurrentFinding[],
  reviews: ReadonlyMap<string, Pick<FindingReview, "status">>,
): ManagerSummary {
  const sortedFindings = [...findings].sort((left, right) =>
    compareStableText(left.finding.findingKey, right.finding.findingKey),
  );
  const statusCounts = createEmptyStatusCounts();
  const typeBreakdown = new Map(
    FINDING_TYPE_ORDER.map((type) => [
      type,
      {
        type,
        label: MANAGER_FINDING_TYPE_LABELS[type],
        total: 0,
        ...createEmptyStatusCounts(),
      },
    ]),
  );
  const services = new Map<string, CurrentServiceReference>();
  const priorityFindings: ManagerPriorityFinding[] = [];

  for (const currentFinding of sortedFindings) {
    const findingKey = currentFinding.finding.findingKey;
    const status = reviews.get(findingKey)?.status ?? "open";
    const service = getCurrentServiceReference(currentFinding);
    const breakdown = typeBreakdown.get(currentFinding.type);

    statusCounts[status] += 1;
    if (breakdown) {
      breakdown.total += 1;
      breakdown[status] += 1;
    }

    const existingService = services.get(service.id);
    if (!existingService || (!hasSummableAmount(existingService) && hasSummableAmount(service))) {
      services.set(service.id, service);
    }

    if (status === "open") {
      priorityFindings.push({
        findingKey,
        type: currentFinding.type,
        typeLabel: MANAGER_FINDING_TYPE_LABELS[currentFinding.type],
        explanation: service.explanation,
        currentServiceRecordId: service.id,
        currentAmount: service.amount,
        currency: normalizeCurrency(service.currency),
        status,
      });
    }
  }

  priorityFindings.sort((left, right) => {
    const amountPriority = Number(hasDisplayAmount(right.currentAmount))
      - Number(hasDisplayAmount(left.currentAmount));

    return amountPriority !== 0
      ? amountPriority
      : compareStableText(left.findingKey, right.findingKey);
  });

  return {
    totalFindingCount: findings.length,
    statusCounts,
    uniqueServiceRecordCount: services.size,
    reviewAmounts: calculateReviewAmounts(services.values()),
    typeBreakdown: FINDING_TYPE_ORDER.map((type) => {
      const summary = typeBreakdown.get(type);
      if (!summary) {
        throw new Error(`Missing finding type summary: ${type}`);
      }
      return summary;
    }),
    priorityFindings: priorityFindings.slice(0, 5),
  };
}

function getCurrentServiceReference(
  currentFinding: CurrentFinding,
): CurrentServiceReference {
  switch (currentFinding.type) {
    case "repeated-failure":
      return {
        id: currentFinding.finding.currentRecordId,
        amount: currentFinding.finding.currentAmount,
        currency: currentFinding.finding.currentCurrency,
        explanation: currentFinding.finding.explanation,
      };
    case "duplicate-service":
      return {
        id: currentFinding.finding.currentRecordId,
        amount: currentFinding.finding.currentAmount,
        currency: currentFinding.finding.currentCurrency,
        explanation: currentFinding.finding.explanation,
      };
    case "abnormal-price":
      return {
        id: currentFinding.finding.currentRecordId,
        amount: currentFinding.finding.currentAmount,
        currency: currentFinding.finding.currency,
        explanation: currentFinding.finding.explanation,
      };
    case "warranty-service":
      return {
        id: currentFinding.finding.serviceRecordId,
        amount: currentFinding.finding.currentServiceAmount,
        currency: currentFinding.finding.currency,
        explanation: currentFinding.finding.explanation,
      };
  }
}

function calculateReviewAmounts(
  services: Iterable<CurrentServiceReference>,
): ManagerReviewAmount[] {
  const totals = new Map<string, bigint>();

  for (const service of services) {
    const amountInCents = parseAmountInCents(service.amount);
    const currency = normalizeCurrency(service.currency);

    if (amountInCents === null || currency === null) {
      continue;
    }

    totals.set(currency, (totals.get(currency) ?? BigInt(0)) + amountInCents);
  }

  return [...totals.entries()]
    .sort(([leftCurrency], [rightCurrency]) =>
      compareStableText(leftCurrency, rightCurrency),
    )
    .map(([currency, amountInCents]) => ({
      currency,
      amount: formatAmountInCents(amountInCents),
    }));
}

function createEmptyStatusCounts(): StatusCounts {
  return { open: 0, confirmed: 0, dismissed: 0 };
}

function hasSummableAmount(service: CurrentServiceReference): boolean {
  return parseAmountInCents(service.amount) !== null
    && normalizeCurrency(service.currency) !== null;
}

function hasDisplayAmount(amount: string | null): boolean {
  return amount !== null && amount.trim().length > 0;
}

function parseAmountInCents(value: string | null): bigint | null {
  if (value === null) {
    return null;
  }

  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const amountInCents = BigInt(match[2]) * BIGINT_ONE_HUNDRED
    + BigInt((match[3] ?? "").padEnd(2, "0"));

  return match[1] === "-" ? -amountInCents : amountInCents;
}

function formatAmountInCents(value: bigint): string {
  const isNegative = value < BigInt(0);
  const absoluteValue = isNegative ? -value : value;
  const integerPart = absoluteValue / BIGINT_ONE_HUNDRED;
  const fractionalPart = (absoluteValue % BIGINT_ONE_HUNDRED)
    .toString()
    .padStart(2, "0");

  return `${isNegative ? "-" : ""}${integerPart}.${fractionalPart}`;
}

function normalizeCurrency(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim().toLocaleUpperCase("tr-TR");
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function compareStableText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
