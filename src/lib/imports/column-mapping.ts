export type ServiceAuditField =
  | "locationCode"
  | "locationName"
  | "assetCode"
  | "assetType"
  | "vendorName"
  | "serviceDate"
  | "failureType"
  | "description"
  | "amount"
  | "currency"
  | "invoiceNumber";

export type ColumnMappingTarget = ServiceAuditField | "ignore";

export type ColumnMapping = {
  sourceColumn: string;
  target: ColumnMappingTarget;
  suggestedTarget: ServiceAuditField | null;
};

export type SubmittedColumnMapping = {
  sourceColumn: string;
  target: ColumnMappingTarget;
};

export type SubmittedColumnMappingResult =
  | { ok: true; mappings: ColumnMapping[] }
  | { ok: false; message: string };

type ServiceAuditFieldDefinition = {
  key: ServiceAuditField;
  label: string;
  required: boolean;
  aliases: readonly string[];
};

export const SERVICE_AUDIT_FIELDS = [
  {
    key: "locationCode",
    label: "Lokasyon Kodu",
    required: false,
    aliases: ["AY Kodu", "Lokasyon Kodu", "Branch ID", "Location Code"],
  },
  {
    key: "locationName",
    label: "Lokasyon Adı",
    required: false,
    aliases: [
      "İstasyon",
      "Lokasyon",
      "Lokasyon Adı",
      "Şube",
      "Location",
      "Branch",
    ],
  },
  {
    key: "assetCode",
    label: "Ekipman Kodu",
    required: false,
    aliases: ["Ekipman Kodu", "Asset ID", "Asset Code", "Equipment Code"],
  },
  {
    key: "assetType",
    label: "Ekipman Türü",
    required: false,
    aliases: ["Ekipman Türü", "Asset Type", "Equipment Type"],
  },
  {
    key: "vendorName",
    label: "Servis Firması",
    required: false,
    aliases: [
      "Firma",
      "Servis Firması",
      "Vendor",
      "Supplier",
      "Service Company",
    ],
  },
  {
    key: "serviceDate",
    label: "Servis Tarihi",
    required: true,
    aliases: ["Servis Tarihi", "Arıza Tarihi", "Service Date"],
  },
  {
    key: "failureType",
    label: "Arıza Türü",
    required: false,
    aliases: ["Arıza Türü", "Failure Type", "Fault Type", "Problem"],
  },
  {
    key: "description",
    label: "Açıklama",
    required: false,
    aliases: ["Açıklama", "Description", "Not", "Notes"],
  },
  {
    key: "amount",
    label: "Tutar",
    required: false,
    aliases: ["Tutar", "Amount", "Cost", "Service Cost"],
  },
  {
    key: "currency",
    label: "Para Birimi",
    required: false,
    aliases: ["Para Birimi", "Currency"],
  },
  {
    key: "invoiceNumber",
    label: "Fatura No",
    required: false,
    aliases: [
      "Fatura No",
      "Fatura Numarası",
      "Invoice No",
      "Invoice Number",
    ],
  },
] as const satisfies readonly ServiceAuditFieldDefinition[];

const aliasLookup = createAliasLookup();

export function createColumnMappings(
  columns: readonly string[],
): ColumnMapping[] {
  const assignedTargets = new Set<ServiceAuditField>();

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

export function setColumnMappingTarget(
  mappings: readonly ColumnMapping[],
  mappingIndex: number,
  target: ColumnMappingTarget,
): ColumnMapping[] {
  if (
    mappingIndex < 0 ||
    mappingIndex >= mappings.length ||
    isTargetMappedToAnotherColumn(mappings, mappingIndex, target)
  ) {
    return [...mappings];
  }

  return mappings.map((mapping, index) =>
    index === mappingIndex ? { ...mapping, target } : mapping,
  );
}

export function createSubmittedColumnMappings(
  mappings: readonly ColumnMapping[],
): SubmittedColumnMapping[] {
  return mappings.map((mapping) => ({
    sourceColumn: mapping.sourceColumn,
    target: mapping.target,
  }));
}

export function validateSubmittedColumnMappings(
  value: unknown,
  columns: readonly string[],
): SubmittedColumnMappingResult {
  if (!Array.isArray(value) || value.length !== columns.length) {
    return {
      ok: false,
      message: "Sütun eşleme bilgisi dosya sütunlarıyla uyuşmuyor.",
    };
  }

  const assignedTargets = new Set<ServiceAuditField>();
  const mappings: ColumnMapping[] = [];

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

    if (typeof target !== "string" || !isColumnMappingTarget(target)) {
      return {
        ok: false,
        message: "İzin verilmeyen bir ServiceAudit alanı gönderildi.",
      };
    }

    if (target !== "ignore") {
      if (assignedTargets.has(target)) {
        return {
          ok: false,
          message: "Bir ServiceAudit alanı birden fazla sütuna atanamaz.",
        };
      }

      assignedTargets.add(target);
    }

    mappings.push({
      sourceColumn,
      target,
      suggestedTarget: null,
    });
  }

  return { ok: true, mappings };
}

export function isTargetMappedToAnotherColumn(
  mappings: readonly ColumnMapping[],
  mappingIndex: number,
  target: ColumnMappingTarget,
): boolean {
  return (
    target !== "ignore" &&
    mappings.some(
      (mapping, index) => index !== mappingIndex && mapping.target === target,
    )
  );
}

export function getMissingRequiredFields(
  mappings: readonly ColumnMapping[],
): ServiceAuditFieldDefinition[] {
  return SERVICE_AUDIT_FIELDS.filter(
    (field) =>
      field.required &&
      !mappings.some((mapping) => mapping.target === field.key),
  );
}

export function isColumnMappingTarget(
  value: string,
): value is ColumnMappingTarget {
  return (
    value === "ignore" ||
    SERVICE_AUDIT_FIELDS.some((field) => field.key === value)
  );
}

export function normalizeColumnName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createAliasLookup(): Map<string, ServiceAuditField> {
  const lookup = new Map<string, ServiceAuditField>();

  for (const field of SERVICE_AUDIT_FIELDS) {
    for (const alias of field.aliases) {
      lookup.set(normalizeColumnName(alias), field.key);
    }
  }

  return lookup;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
