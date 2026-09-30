import ExcelJS from "exceljs";
import {
  createFindingExportRecords,
  type FindingExportRecord,
  type ReviewedCurrentFinding,
} from "./findings-operations";

export const FINDINGS_WORKSHEET_NAME = "Bulgular";

export const FINDINGS_WORKBOOK_HEADERS = [
  "Bulgu Anahtarı",
  "Bulgu Türü",
  "İnceleme Durumu",
  "Açıklama",
  "Bulgu Nedeni",
  "Ekipman Kodu",
  "Ekipman Türü",
  "Lokasyon Kodu",
  "Lokasyon Adı",
  "Arıza Türü",
  "Servis Firması",
  "İlgili Tarih",
  "İncelenecek Tutar",
  "Para Birimi",
  "Fatura No",
  "Garanti Sağlayıcı",
  "Güncel Kaynak Dosya",
  "Güncel Kaynak Satır",
  "Karşılaştırma Kaynak Dosya",
  "Karşılaştırma Kaynak Satır",
  "Garanti Kaynak Dosya",
  "Garanti Kaynak Satır",
] as const;

const COLUMN_WIDTHS = [
  42, 34, 20, 72, 25, 22, 22, 20, 26, 24, 26,
  17, 21, 16, 20, 28, 34, 18, 34, 18, 34, 18,
] as const;

const WRAPPED_COLUMN_NUMBERS = [4, 17, 19, 21] as const;
const DATE_COLUMN_NUMBER = 12;
const AMOUNT_COLUMN_NUMBER = 13;

export async function createFindingsWorkbook(
  findings: readonly ReviewedCurrentFinding[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ServiceAudit";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(FINDINGS_WORKSHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1, activeCell: "A2" }],
  });
  worksheet.properties.defaultRowHeight = 20;
  worksheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));
  worksheet.addRow([...FINDINGS_WORKBOOK_HEADERS]);
  worksheet.autoFilter = `A1:V1`;

  const headerRow = worksheet.getRow(1);
  headerRow.height = 30;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  headerRow.alignment = { vertical: "middle", wrapText: true };

  for (const record of createFindingExportRecords(findings)) {
    const row = worksheet.addRow(toWorksheetRow(record));
    row.alignment = { vertical: "top" };
  }

  worksheet.getColumn(DATE_COLUMN_NUMBER).numFmt = "dd.mm.yyyy";
  worksheet.getColumn(AMOUNT_COLUMN_NUMBER).numFmt = "#,##0.00";

  for (const columnNumber of WRAPPED_COLUMN_NUMBERS) {
    worksheet.getColumn(columnNumber).alignment = {
      vertical: "top",
      wrapText: true,
    };
  }

  const output = await workbook.xlsx.writeBuffer();
  return output;
}

function toWorksheetRow(record: FindingExportRecord): (string | number | Date | null)[] {
  return [
    record.findingKey,
    record.findingType,
    record.reviewStatus,
    record.explanation,
    record.reason,
    record.assetCode,
    record.assetType,
    record.locationCode,
    record.locationName,
    record.failureType,
    record.vendorName,
    parseIsoDate(record.relevantDate),
    parseAmount(record.amount),
    record.currency,
    record.invoiceNumber,
    record.warrantyProvider,
    record.currentSourceFileName,
    record.currentSourceRowNumber,
    record.comparisonSourceFileName,
    record.comparisonSourceRowNumber,
    record.warrantySourceFileName,
    record.warrantySourceRowNumber,
  ];
}

function parseAmount(value: string | null): number | null {
  if (value === null || !/^[+-]?\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function parseIsoDate(value: string | null): Date | null {
  if (value === null) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? date
    : null;
}
