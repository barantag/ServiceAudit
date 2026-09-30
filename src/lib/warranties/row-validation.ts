import { normalizeServiceDate } from "@/lib/imports/row-validation";
import type { CsvSourceRow } from "@/lib/imports/parse-csv";
import {
  getMissingRequiredWarrantyFields,
  WARRANTY_FIELDS,
  type WarrantyColumnMapping,
  type WarrantyField,
} from "@/lib/warranties/column-mapping";

export type WarrantyRowValidationIssue = {
  sourceRowNumber: number;
  field: WarrantyField;
  fieldLabel: string;
  originalValue: string;
  message: string;
};

export type NormalizedWarrantyRow = {
  sourceRowNumber: number;
  rawValues: string[];
  normalizedValues: Partial<Record<WarrantyField, string | null>>;
  issues: WarrantyRowValidationIssue[];
};

export type WarrantyRowsValidationResult =
  | { ready: false; totalRowCount: number }
  | {
      ready: true;
      totalRowCount: number;
      validRowCount: number;
      invalidRowCount: number;
      issueCount: number;
      rows: NormalizedWarrantyRow[];
      issues: WarrantyRowValidationIssue[];
    };

export function validateWarrantyRows(
  sourceRows: readonly CsvSourceRow[],
  mappings: readonly WarrantyColumnMapping[],
): WarrantyRowsValidationResult {
  if (getMissingRequiredWarrantyFields(mappings).length > 0) {
    return { ready: false, totalRowCount: sourceRows.length };
  }

  const issues: WarrantyRowValidationIssue[] = [];
  const rows = sourceRows.map((sourceRow) => {
    const normalizedValues: NormalizedWarrantyRow["normalizedValues"] = {};
    const rowIssues: WarrantyRowValidationIssue[] = [];

    mappings.forEach((mapping, mappingIndex) => {
      if (mapping.target === "ignore") {
        return;
      }

      const originalValue = sourceRow.values[mappingIndex] ?? "";
      const trimmedValue = originalValue.trim();
      const fieldDefinition = WARRANTY_FIELDS.find(
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

      if (mapping.target === "assetCode") {
        if (trimmedValue.length === 0) {
          rowIssues.push(
            createIssue(
              sourceRow.sourceRowNumber,
              mapping.target,
              fieldDefinition.label,
              originalValue,
              "Ekipman kodu boş bırakılamaz.",
            ),
          );
          return;
        }

        normalizedValues.assetCode = trimmedValue;
        return;
      }

      if (
        mapping.target === "warrantyStartDate" ||
        mapping.target === "warrantyEndDate"
      ) {
        if (trimmedValue.length === 0) {
          rowIssues.push(
            createIssue(
              sourceRow.sourceRowNumber,
              mapping.target,
              fieldDefinition.label,
              originalValue,
              mapping.target === "warrantyStartDate"
                ? "Garanti başlangıç tarihi boş bırakılamaz."
                : "Garanti bitiş tarihi boş bırakılamaz.",
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

        normalizedValues[mapping.target] = normalizedDate;
        return;
      }

      normalizedValues[mapping.target] = trimmedValue;
    });

    const warrantyStartDate = normalizedValues.warrantyStartDate;
    const warrantyEndDate = normalizedValues.warrantyEndDate;

    if (
      typeof warrantyStartDate === "string" &&
      typeof warrantyEndDate === "string" &&
      warrantyEndDate < warrantyStartDate
    ) {
      const endDateMappingIndex = mappings.findIndex(
        (mapping) => mapping.target === "warrantyEndDate",
      );
      const originalEndDate =
        endDateMappingIndex === -1
          ? ""
          : (sourceRow.values[endDateMappingIndex] ?? "");

      rowIssues.push(
        createIssue(
          sourceRow.sourceRowNumber,
          "warrantyEndDate",
          "Garanti Bitiş Tarihi",
          originalEndDate,
          "Garanti bitiş tarihi başlangıç tarihinden önce olamaz.",
        ),
      );
    }

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

function createIssue(
  sourceRowNumber: number,
  field: WarrantyField,
  fieldLabel: string,
  originalValue: string,
  message: string,
): WarrantyRowValidationIssue {
  return { sourceRowNumber, field, fieldLabel, originalValue, message };
}
