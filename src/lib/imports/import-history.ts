export const IMPORT_TYPE_FILTER_OPTIONS = [
  { value: "service", label: "Servis Verisi" },
  { value: "warranty", label: "Garanti Verisi" },
] as const;

export type ImportHistoryType = "service" | "warranty" | "unknown";
export type ImportHistoryTypeFilter = "all" | Exclude<ImportHistoryType, "unknown">;
export type ImportHistoryStatusFilter = "all" | string;

export type ImportHistorySourceRecord = {
  id: string;
  fileName: string;
  rowCount: number;
  status: string;
  excludedAt: Date | null;
  exclusionReason: string | null;
  createdAt: Date;
  serviceRecordCount: number;
  warrantyRecordCount: number;
};

export type ImportHistoryItem = ImportHistorySourceRecord & {
  type: ImportHistoryType;
};

export type ImportHistoryFilters = {
  type: ImportHistoryTypeFilter;
  status: ImportHistoryStatusFilter;
  query: string;
};

export type ImportHistoryFilterInput = {
  type?: unknown;
  status?: unknown;
  query?: unknown;
};

export type ImportHistoryResult = {
  totalImportCount: number;
  items: ImportHistoryItem[];
  availableStatuses: string[];
  filters: ImportHistoryFilters;
};

const MAX_SEARCH_LENGTH = 200;

export function createImportHistory(
  sourceRecords: readonly ImportHistorySourceRecord[],
  filterInput: ImportHistoryFilterInput,
): ImportHistoryResult {
  const allItems = sourceRecords
    .map((record): ImportHistoryItem => ({
      ...record,
      type: classifyImportType(record.serviceRecordCount, record.warrantyRecordCount),
    }))
    .sort(compareNewestFirst);
  const availableStatuses = [...new Set(allItems.map((item) => item.status))]
    .sort(compareStableText);
  const filters = parseImportHistoryFilters(filterInput, availableStatuses);
  const queryTokens = normalizeComparableText(filters.query)
    .split(" ")
    .filter((token) => token.length > 0);

  const items = allItems.filter((item) => {
    if (filters.type !== "all" && item.type !== filters.type) {
      return false;
    }
    if (filters.status !== "all" && item.status !== filters.status) {
      return false;
    }

    const normalizedFileName = normalizeComparableText(item.fileName);
    return queryTokens.every((token) => normalizedFileName.includes(token));
  });

  return {
    totalImportCount: allItems.length,
    items,
    availableStatuses,
    filters,
  };
}

export function classifyImportType(
  serviceRecordCount: number,
  warrantyRecordCount: number,
): ImportHistoryType {
  if (serviceRecordCount > 0 && warrantyRecordCount === 0) {
    return "service";
  }
  if (warrantyRecordCount > 0 && serviceRecordCount === 0) {
    return "warranty";
  }
  return "unknown";
}

export function hasActiveImportHistoryFilters(filters: ImportHistoryFilters): boolean {
  return filters.type !== "all" || filters.status !== "all" || filters.query.length > 0;
}

function parseImportHistoryFilters(
  input: ImportHistoryFilterInput,
  availableStatuses: readonly string[],
): ImportHistoryFilters {
  return {
    type: input.type === "service" || input.type === "warranty" ? input.type : "all",
    status: typeof input.status === "string" && availableStatuses.includes(input.status)
      ? input.status
      : "all",
    query: normalizeDisplayQuery(input.query),
  };
}

function normalizeDisplayQuery(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH);
}

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ");
}

function compareNewestFirst(left: ImportHistoryItem, right: ImportHistoryItem): number {
  const dateDifference = right.createdAt.getTime() - left.createdAt.getTime();
  return dateDifference !== 0 ? dateDifference : compareStableText(left.id, right.id);
}

function compareStableText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
