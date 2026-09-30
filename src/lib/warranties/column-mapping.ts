import { normalizeColumnName } from "@/lib/imports/column-mapping";

export type WarrantyField =
  | "assetCode"
  | "locationCode"
  | "warrantyStartDate"
  | "warrantyEndDate"
  | "providerName"
  | "description";

export type WarrantyColumnMappingTarget = WarrantyField | "ignore";

export type WarrantyColumnMapping = {
  sourceColumn: string;
  target: WarrantyColumnMappingTarget;
  suggestedTarget: WarrantyField | null;
};

export type SubmittedWarrantyColumnMapping = {
  sourceColumn: string;
  target: WarrantyColumnMappingTarget;
};

export type SubmittedWarrantyColumnMappingResult =
  | { ok: true; mappings: WarrantyColumnMapping[] }
  | { ok: false; message: string };

export type WarrantyFieldDefinition = {
  key: WarrantyField;
  label: string;
  required: boolean;
  aliases: readonly string[];
};

export const WARRANTY_FIELDS = [
  {
    key: "assetCode",
    label: "Ekipman Kodu",
    required: true,
    aliases: ["Ekipman Kodu", "Asset Code", "Asset ID", "Equipment Code"],
  },
  {
    key: "locationCode",
    label: "Lokasyon Kodu",
    required: false,
    aliases: ["Lokasyon Kodu", "Location Code", "Branch ID"],
  },
  {
    key: "warrantyStartDate",
    label: "Garanti Başlangıç Tarihi",
    required: true,
    aliases: [
      "Garanti Başlangıç Tarihi",
      "Garanti Başlangıcı",
      "Warranty Start",
      "Warranty Start Date",
    ],
  },
  {
    key: "warrantyEndDate",
    label: "Garanti Bitiş Tarihi",
    required: true,
    aliases: [
      "Garanti Bitiş Tarihi",
      "Garanti Bitişi",
      "Warranty End",
      "Warranty End Date",
    ],
  },
  {
    key: "providerName",
    label: "Garanti Sağlayıcı",
    required: false,
    aliases: [
      "Garanti Sağlayıcı",
      "Sağlayıcı",
      "Provider",
      "Warranty Provider",
    ],
  },
  {
    key: "description",
    label: "Açıklama",
    required: false,
    aliases: ["Açıklama", "Description", "Notes", "Not"],
  },
] as const satisfies readonly WarrantyFieldDefinition[];

const aliasLookup = createAliasLookup();

export function createWarrantyColumnMappings(
  columns: readonly string[],
): WarrantyColumnMapping[] {
  const assignedTargets = new Set<WarrantyField>();

  return columns.map((sourceColumn) => {
    const suggestedTarget = aliasLookup.get(normalizeColumnName(sourceColumn));
    const canUseSuggestion =
      suggestedTarget !== undefined && !assignedTargets.has(suggestedTarget);
    const target = canUseSuggestion ? suggestedTarget : "ignore";

    if (target !== "ignore") {
      assignedTargets.add(target);
    }

    return {
      sourceColumn,
      target,
      suggestedTarget: target === "ignore" ? null : target,
    };
  });
}

export function setWarrantyColumnMappingTarget(
  mappings: readonly WarrantyColumnMapping[],
  mappingIndex: number,
  target: WarrantyColumnMappingTarget,
): WarrantyColumnMapping[] {
  if (
    mappingIndex < 0 ||
    mappingIndex >= mappings.length ||
    isWarrantyTargetMappedToAnotherColumn(mappings, mappingIndex, target)
  ) {
    return [...mappings];
  }

  return mappings.map((mapping, index) =>
    index === mappingIndex ? { ...mapping, target } : mapping,
  );
}

export function createSubmittedWarrantyColumnMappings(
  mappings: readonly WarrantyColumnMapping[],
): SubmittedWarrantyColumnMapping[] {
  return mappings.map((mapping) => ({
    sourceColumn: mapping.sourceColumn,
    target: mapping.target,
  }));
}

export function validateSubmittedWarrantyColumnMappings(
  value: unknown,
  columns: readonly string[],
): SubmittedWarrantyColumnMappingResult {
  if (!Array.isArray(value) || value.length !== columns.length) {
    return {
      ok: false,
      message: "Sütun eşleme bilgisi dosya sütunlarıyla uyuşmuyor.",
    };
  }

  const assignedTargets = new Set<WarrantyField>();
  const mappings: WarrantyColumnMapping[] = [];

  for (const [index, candidate] of value.entries()) {
    if (!isPlainRecord(candidate)) {
      return { ok: false, message: "Sütun eşleme bilgisi geçersiz." };
    }

    const keys = Object.keys(candidate);

    if (
      keys.length !== 2 ||
      !keys.includes("sourceColumn") ||
      !keys.includes("target")
    ) {
      return { ok: false, message: "Sütun eşleme bilgisi geçersiz." };
    }

    const sourceColumn = candidate.sourceColumn;
    const target = candidate.target;

    if (typeof sourceColumn !== "string" || sourceColumn !== columns[index]) {
      return {
        ok: false,
        message: "Eşlenen sütunlar dosyayla uyuşmuyor.",
      };
    }

    if (typeof target !== "string" || !isWarrantyColumnMappingTarget(target)) {
      return {
        ok: false,
        message: "İzin verilmeyen bir garanti alanı gönderildi.",
      };
    }

    if (target !== "ignore") {
      if (assignedTargets.has(target)) {
        return {
          ok: false,
          message: "Bir garanti alanı birden fazla sütuna atanamaz.",
        };
      }

      assignedTargets.add(target);
    }

    mappings.push({ sourceColumn, target, suggestedTarget: null });
  }

  return { ok: true, mappings };
}

export function getMissingRequiredWarrantyFields(
  mappings: readonly WarrantyColumnMapping[],
): WarrantyFieldDefinition[] {
  return WARRANTY_FIELDS.filter(
    (field) =>
      field.required &&
      !mappings.some((mapping) => mapping.target === field.key),
  );
}

export function isWarrantyTargetMappedToAnotherColumn(
  mappings: readonly WarrantyColumnMapping[],
  mappingIndex: number,
  target: WarrantyColumnMappingTarget,
): boolean {
  return (
    target !== "ignore" &&
    mappings.some(
      (mapping, index) => index !== mappingIndex && mapping.target === target,
    )
  );
}

export function isWarrantyColumnMappingTarget(
  value: string,
): value is WarrantyColumnMappingTarget {
  return (
    value === "ignore" ||
    WARRANTY_FIELDS.some((field) => field.key === value)
  );
}

function createAliasLookup(): Map<string, WarrantyField> {
  const lookup = new Map<string, WarrantyField>();

  for (const field of WARRANTY_FIELDS) {
    for (const alias of field.aliases) {
      lookup.set(normalizeColumnName(alias), field.key);
    }
  }

  return lookup;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
