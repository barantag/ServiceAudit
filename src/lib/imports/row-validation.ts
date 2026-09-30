import {
  getMissingRequiredFields,
  SERVICE_AUDIT_FIELDS,
  type ColumnMapping,
  type ServiceAuditField,
} from "@/lib/imports/column-mapping";
import type { CsvSourceRow } from "@/lib/imports/parse-csv";

export type RowValidationIssue = {
  sourceRowNumber: number;
  field: ServiceAuditField;
  fieldLabel: string;
  originalValue: string;
  message: string;
};

export type NormalizedServiceRow = {
  sourceRowNumber: number;
  rawValues: string[];
  normalizedValues: Partial<
    Record<ServiceAuditField, string | number | null>
  >;
  issues: RowValidationIssue[];
};

export type MappedRowsValidationResult =
  | {
      ready: false;
      totalRowCount: number;
    }
  | {
      ready: true;
      totalRowCount: number;
      validRowCount: number;
      invalidRowCount: number;
      issueCount: number;
      rows: NormalizedServiceRow[];
      issues: RowValidationIssue[];
    };

export function validateMappedRows(
  sourceRows: readonly CsvSourceRow[],
  mappings: readonly ColumnMapping[],
): MappedRowsValidationResult {
  if (getMissingRequiredFields(mappings).length > 0) {
    return {
      ready: false,
      totalRowCount: sourceRows.length,
    };
  }

  const issues: RowValidationIssue[] = [];
  const rows = sourceRows.map((sourceRow) => {
    const normalizedValues: NormalizedServiceRow["normalizedValues"] = {};
    const rowIssues: RowValidationIssue[] = [];

    mappings.forEach((mapping, mappingIndex) => {
      if (mapping.target === "ignore") {
        return;
      }

      const originalValue = sourceRow.values[mappingIndex] ?? "";
      const trimmedValue = originalValue.trim();
      const fieldDefinition = SERVICE_AUDIT_FIELDS.find(
        (field) => field.key === mapping.target,
      );

      if (!fieldDefinition) {
        return;
      }

      const sourceCellIssue = sourceRow.cellIssues?.find(
        (issue) => issue.columnIndex === mappingIndex,
      );
      if (sourceCellIssue) {
        rowIssues.push(
          createIssue(
            sourceRow.sourceRowNumber,
            mapping.target,
            fieldDefinition.label,
            originalValue,
            sourceCellIssue.message,
          ),
        );
        return;
      }

      if (mapping.target === "serviceDate") {
        if (trimmedValue.length === 0) {
          rowIssues.push(
            createIssue(
              sourceRow.sourceRowNumber,
              mapping.target,
              fieldDefinition.label,
              originalValue,
              "Servis tarihi boş bırakılamaz.",
            ),
          );
          return;
        }

        const normalizedDate = normalizeServiceDate(trimmedValue);

        if (normalizedDate === null) {
          rowIssues.push(
            createIssue(
              sourceRow.sourceRowNumber,
              mapping.target,
              fieldDefinition.label,
              originalValue,
              "Geçerli bir tarih değil.",
            ),
          );
          return;
        }

        normalizedValues.serviceDate = normalizedDate;
        return;
      }

      if (mapping.target === "amount") {
        if (trimmedValue.length === 0) {
          normalizedValues.amount = null;
          return;
        }

        const normalizedAmount = normalizeAmount(trimmedValue);

        if (normalizedAmount === null) {
          rowIssues.push(
            createIssue(
              sourceRow.sourceRowNumber,
              mapping.target,
              fieldDefinition.label,
              originalValue,
              "Sayısal bir tutara dönüştürülemedi.",
            ),
          );
          return;
        }

        normalizedValues.amount = normalizedAmount;
        return;
      }

      if (mapping.target === "currency") {
        if (trimmedValue.length === 0) {
          normalizedValues.currency = "";
          return;
        }

        if (!/^[A-Za-z]{3}$/.test(trimmedValue)) {
          rowIssues.push(
            createIssue(
              sourceRow.sourceRowNumber,
              mapping.target,
              fieldDefinition.label,
              originalValue,
              "Üç harfli bir para birimi kodu olmalıdır.",
            ),
          );
          return;
        }

        normalizedValues.currency = trimmedValue.toUpperCase();
        return;
      }

      normalizedValues[mapping.target] = trimmedValue;
    });

    issues.push(...rowIssues);

    return {
      sourceRowNumber: sourceRow.sourceRowNumber,
      rawValues: [...sourceRow.values],
      normalizedValues,
      issues: rowIssues,
    };
  });

  const invalidRowCount = rows.filter((row) => row.issues.length > 0).length;

  return {
    ready: true,
    totalRowCount: rows.length,
    validRowCount: rows.length - invalidRowCount,
    invalidRowCount,
    issueCount: issues.length,
    rows,
    issues,
  };
}

export function normalizeServiceDate(value: string): string | null {
  const trimmedValue = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);

  if (isoMatch) {
    return createNormalizedDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const dayFirstMatch = /^(\d{2})([./])(\d{2})\2(\d{4})$/.exec(
    trimmedValue,
  );

  if (!dayFirstMatch) {
    return null;
  }

  return createNormalizedDate(
    Number(dayFirstMatch[4]),
    Number(dayFirstMatch[3]),
    Number(dayFirstMatch[1]),
  );
}

export function normalizeAmount(value: string): string | null {
  const trimmedValue = value.trim();

  if (!/^[+-]?\d[\d.,]*$/.test(trimmedValue)) {
    return null;
  }

  const hasSign = trimmedValue.startsWith("-") || trimmedValue.startsWith("+");
  const sign = hasSign ? trimmedValue[0] : "";
  const unsignedValue = hasSign ? trimmedValue.slice(1) : trimmedValue;
  const hasComma = unsignedValue.includes(",");
  const hasDot = unsignedValue.includes(".");
  let canonicalValue: string | null;

  if (hasComma && hasDot) {
    const decimalSeparator =
      unsignedValue.lastIndexOf(",") > unsignedValue.lastIndexOf(".")
        ? ","
        : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    const decimalParts = unsignedValue.split(decimalSeparator);

    if (decimalParts.length !== 2) {
      return null;
    }

    const [integerPart, fractionPart] = decimalParts;

    if (
      !/^\d+$/.test(fractionPart) ||
      !isValidGroupedInteger(integerPart, groupingSeparator)
    ) {
      return null;
    }

    canonicalValue = `${integerPart.replaceAll(groupingSeparator, "")}.${fractionPart}`;
  } else if (hasComma || hasDot) {
    const separator = hasComma ? "," : ".";
    const parts = unsignedValue.split(separator);

    if (parts.some((part) => !/^\d+$/.test(part))) {
      return null;
    }

    if (parts.length > 2) {
      canonicalValue = isValidGroupedInteger(unsignedValue, separator)
        ? parts.join("")
        : null;
    } else {
      const [integerPart, fractionOrGroup] = parts;
      const looksLikeGrouping =
        fractionOrGroup.length === 3 && integerPart.length <= 3;

      canonicalValue = looksLikeGrouping
        ? `${integerPart}${fractionOrGroup}`
        : `${integerPart}.${fractionOrGroup}`;
    }
  } else {
    canonicalValue = unsignedValue;
  }

  if (canonicalValue === null) {
    return null;
  }

  return createCanonicalAmount(sign, canonicalValue);
}

function createCanonicalAmount(
  sign: string,
  canonicalValue: string,
): string | null {
  const [rawIntegerPart, fractionPart] = canonicalValue.split(".");
  const integerPart = rawIntegerPart.replace(/^0+(?=\d)/, "");

  if (
    integerPart.length > 12 ||
    (fractionPart !== undefined && fractionPart.length > 2)
  ) {
    return null;
  }

  const isZero =
    /^0+$/.test(integerPart) &&
    (fractionPart === undefined || /^0+$/.test(fractionPart));
  const normalizedSign = sign === "-" && !isZero ? "-" : "";

  return `${normalizedSign}${integerPart}${
    fractionPart === undefined ? "" : `.${fractionPart}`
  }`;
}

function createNormalizedDate(
  year: number,
  month: number,
  day: number,
): string | null {
  if (!isValidDate(year, month, day)) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return day <= daysInMonth[month - 1];
}

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function isValidGroupedInteger(
  value: string,
  separator: string,
): boolean {
  const groups = value.split(separator);

  return (
    groups.length > 1 &&
    /^\d{1,3}$/.test(groups[0]) &&
    groups.slice(1).every((group) => /^\d{3}$/.test(group))
  );
}

function createIssue(
  sourceRowNumber: number,
  field: ServiceAuditField,
  fieldLabel: string,
  originalValue: string,
  message: string,
): RowValidationIssue {
  return {
    sourceRowNumber,
    field,
    fieldLabel,
    originalValue,
    message,
  };
}
