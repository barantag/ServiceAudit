import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { createColumnMappings } from "../src/lib/imports/column-mapping";
import { createImportFingerprint } from "../src/lib/imports/import-fingerprint";
import { parseImportFileBytes } from "../src/lib/imports/parse-import-file";
import { validateMappedRows } from "../src/lib/imports/row-validation";
import { MAX_IMPORT_ROW_COUNT } from "../src/lib/imports/import-limits";
import { createWarrantyColumnMappings } from "../src/lib/warranties/column-mapping";
import { validateWarrantyRows } from "../src/lib/warranties/row-validation";

test.describe("CSV and Excel import parsing", () => {
  test("CSV Service and Warranty data still feed their validation pipelines", async () => {
    const service = await parseImportFileBytes(
      "service.csv",
      bytes("Servis Tarihi,Tutar\n2026-09-01,1500\n"),
      null,
    );
    expect(service.ok).toBe(true);
    if (service.ok) {
      const validation = validateMappedRows(
        service.preview.sourceRows,
        createColumnMappings(service.preview.columns),
      );
      expect(validation.ready && validation.issueCount).toBe(0);
    }

    const warranty = await parseImportFileBytes(
      "warranty.csv",
      bytes(
        "Ekipman Kodu,Garanti Başlangıç Tarihi,Garanti Bitiş Tarihi\nEQ-1,2026-01-01,2026-12-31\n",
      ),
      null,
    );
    expect(warranty.ok).toBe(true);
    if (warranty.ok) {
      const validation = validateWarrantyRows(
        warranty.preview.sourceRows,
        createWarrantyColumnMappings(warranty.preview.columns),
      );
      expect(validation.ready && validation.issueCount).toBe(0);
    }
  });

  test("single-sheet XLSX Service and Warranty data validate", async () => {
    const serviceBytes = await workbookBytes([
      {
        name: "Servis",
        rows: [
          ["Servis Tarihi", "Tutar", "Para Birimi"],
          [new Date(Date.UTC(2026, 8, 1)), 1500.5, "TRY"],
        ],
      },
    ]);
    const service = await parseImportFileBytes("service.xlsx", serviceBytes, null);
    expect(service.ok).toBe(true);
    if (service.ok) {
      expect(service.selectedWorksheetName).toBe("Servis");
      const validation = validateMappedRows(
        service.preview.sourceRows,
        createColumnMappings(service.preview.columns),
      );
      expect(validation.ready && validation.issueCount).toBe(0);
    }

    const warrantyBytes = await workbookBytes([
      {
        name: "Garanti",
        rows: [
          ["Ekipman Kodu", "Garanti Başlangıç Tarihi", "Garanti Bitiş Tarihi"],
          ["EQ-1", new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31))],
        ],
      },
    ]);
    const warranty = await parseImportFileBytes(
      "warranty.xlsx",
      warrantyBytes,
      null,
    );
    expect(warranty.ok).toBe(true);
    if (warranty.ok) {
      const validation = validateWarrantyRows(
        warranty.preview.sourceRows,
        createWarrantyColumnMappings(warranty.preview.columns),
      );
      expect(validation.ready && validation.issueCount).toBe(0);
    }
  });

  test("selected worksheet controls parsing and preserves worksheet row numbers", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Boş");
    const first = workbook.addWorksheet("İlk");
    first.addRow(["Servis Tarihi"]);
    first.addRow(["2026-09-01"]);
    const selected = workbook.addWorksheet("Seçilen");
    selected.getCell("A3").value = "Servis Tarihi";
    selected.getCell("A5").value = "geçersiz-tarih";
    const fileBytes = new Uint8Array(await workbook.xlsx.writeBuffer());

    const withoutSelection = await parseImportFileBytes(
      "multi.xlsx",
      fileBytes,
      null,
    );
    expect(withoutSelection).toMatchObject({
      ok: false,
      message: "İçe aktarılacak Excel çalışma sayfasını seçin.",
    });

    const parsed = await parseImportFileBytes(
      "multi.xlsx",
      fileBytes,
      "Seçilen",
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.preview.sourceRows[0].sourceRowNumber).toBe(5);
      const validation = validateMappedRows(
        parsed.preview.sourceRows,
        createColumnMappings(parsed.preview.columns),
      );
      expect(validation.ready && validation.issues[0].sourceRowNumber).toBe(5);
    }
  });

  test("formulas are not executed and require a safe cached result", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Servis");
    sheet.addRow(["Servis Tarihi"]);
    sheet.addRow([{ formula: "TODAY()" }]);
    sheet.addRow([
      {
        formula: "DATE(2026,9,1)",
        result: new Date(Date.UTC(2026, 8, 1)),
      },
    ]);
    const fileBytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const parsed = await parseImportFileBytes("formula.xlsx", fileBytes, null);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.preview.fileName).toBe("formula.xlsx");
      expect(parsed.preview.sourceRows[1].values[0]).toBe("2026-09-01");
      const validation = validateMappedRows(
        parsed.preview.sourceRows,
        createColumnMappings(parsed.preview.columns),
      );
      expect(validation.ready && validation.issues[0].message).toContain(
        "Formül çalıştırılmadı",
      );
    }
  });

  test("XLSX row limit is enforced without truncation", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Servis");
    sheet.addRow(["Servis Tarihi"]);
    for (let index = 0; index <= MAX_IMPORT_ROW_COUNT; index += 1) {
      sheet.addRow(["2026-09-01"]);
    }
    const fileBytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const parsed = await parseImportFileBytes("limit.xlsx", fileBytes, null);
    expect(parsed).toMatchObject({
      ok: false,
      message: expect.stringContaining("25.000"),
    });
  });

  test("same workbook and sheet has duplicate identity while another sheet is distinct", async () => {
    const fileBytes = await workbookBytes([
      { name: "Bir", rows: [["Servis Tarihi"], ["2026-09-01"]] },
      { name: "İki", rows: [["Servis Tarihi"], ["2026-09-02"]] },
    ]);
    const first = createImportFingerprint(fileBytes, "Bir");
    const knownImports = new Set([first]);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(knownImports.has(createImportFingerprint(fileBytes, "Bir"))).toBe(true);
    expect(knownImports.has(createImportFingerprint(fileBytes, "İki"))).toBe(false);
  });
});

test.describe("Excel import UI", () => {
  test("Service keeps the multi-sheet selector and safely replaces preview and mappings", async ({ page }) => {
    const fileBytes = await workbookBytes([
      {
        name: "Servis A",
        rows: [["Servis Tarihi", "Tutar"], ["2026-09-01", 111]],
      },
      { name: "Boş", rows: [] },
      {
        name: "Servis B",
        rows: [["Servis Tarihi", "Para Birimi"], ["2026-09-02", "TRY"]],
      },
    ]);
    await page.goto("/imports/new");
    await uploadWorkbook(page, "service-multi.xlsx", fileBytes);
    const selector = worksheetSelector(page);
    await expect(selector).toBeVisible();
    await expect(selector.locator("option")).toHaveCount(3);
    await expect(selector).not.toContainText("Boş");
    await selector.selectOption("Servis A");
    await expect(selector).toBeVisible();
    await expect(selector).toHaveValue("Servis A");
    await page.getByLabel("Tutar").selectOption("description");

    await selector.selectOption("Servis B");
    await expect(selector).toBeVisible();
    await expect(selector).toHaveValue("Servis B");
    const preview = importPreview(page);
    await expect(preview).toContainText("2026-09-02");
    await expect(preview).toContainText("TRY");
    await expect(preview).not.toContainText("2026-09-01");
    await expect(preview).not.toContainText("111");
    await expect(page.getByLabel("Tutar")).toHaveCount(0);
    await expect(page.getByLabel("Para Birimi")).toHaveValue("currency");
  });

  test("Warranty keeps the multi-sheet selector and safely replaces preview and mappings", async ({ page }) => {
    const fileBytes = await workbookBytes([
      {
        name: "Garanti A",
        rows: [
          [
            "Ekipman Kodu",
            "Garanti Başlangıç Tarihi",
            "Garanti Bitiş Tarihi",
            "Garanti Sağlayıcı",
          ],
          ["EQ-A", "2026-01-01", "2026-12-31", "Sağlayıcı A"],
        ],
      },
      { name: "Boş", rows: [] },
      {
        name: "Garanti B",
        rows: [
          [
            "Ekipman Kodu",
            "Garanti Başlangıç Tarihi",
            "Garanti Bitiş Tarihi",
            "Açıklama",
          ],
          ["EQ-B", "2027-01-01", "2027-12-31", "Yeni sayfa"],
        ],
      },
    ]);
    await page.goto("/warranties/new");
    await uploadWorkbook(page, "warranty-multi.xlsx", fileBytes);
    const selector = worksheetSelector(page);
    await expect(selector).toBeVisible();
    await expect(selector.locator("option")).toHaveCount(3);
    await expect(selector).not.toContainText("Boş");
    await selector.selectOption("Garanti A");
    await expect(selector).toBeVisible();
    await expect(selector).toHaveValue("Garanti A");
    await page.getByLabel("Garanti Sağlayıcı").selectOption("description");

    await selector.selectOption("Garanti B");
    await expect(selector).toBeVisible();
    await expect(selector).toHaveValue("Garanti B");
    const preview = importPreview(page);
    await expect(preview).toContainText("EQ-B");
    await expect(preview).toContainText("Yeni sayfa");
    await expect(preview).not.toContainText("EQ-A");
    await expect(preview).not.toContainText("Sağlayıcı A");
    await expect(page.getByLabel("Garanti Sağlayıcı")).toHaveCount(0);
    await expect(page.getByLabel("Açıklama")).toHaveValue("description");
  });

  for (const singleSheetCase of [
    {
      path: "/imports/new",
      name: "service-single.xlsx",
      rows: [["Servis Tarihi"], ["2026-09-01"]],
    },
    {
      path: "/warranties/new",
      name: "warranty-single.xlsx",
      rows: [
        ["Ekipman Kodu", "Garanti Başlangıç Tarihi", "Garanti Bitiş Tarihi"],
        ["EQ-1", "2026-01-01", "2026-12-31"],
      ],
    },
  ] as const) {
    test(`${singleSheetCase.path} skips selection for a single-sheet XLSX`, async ({ page }) => {
      await page.goto(singleSheetCase.path);
      const fileBytes = await workbookBytes([
        { name: "Tek Sayfa", rows: singleSheetCase.rows },
      ]);
      await uploadWorkbook(page, singleSheetCase.name, fileBytes);
      await expect(worksheetSelector(page)).toHaveCount(0);
      await expect(importPreview(page)).toBeVisible();
    });
  }

  for (const csvCase of [
    {
      path: "/imports/new",
      name: "service.csv",
      content: "Servis Tarihi\n2026-09-01\n",
    },
    {
      path: "/warranties/new",
      name: "warranty.csv",
      content: "Ekipman Kodu,Garanti Başlangıç Tarihi,Garanti Bitiş Tarihi\nEQ-1,2026-01-01,2026-12-31\n",
    },
  ] as const) {
    test(`${csvCase.path} shows no worksheet selector for CSV`, async ({ page }) => {
      await page.goto(csvCase.path);
      await page.locator('input[type="file"]').setInputFiles({
        name: csvCase.name,
        mimeType: "text/csv",
        buffer: Buffer.from(csvCase.content),
      });
      await expect(worksheetSelector(page)).toHaveCount(0);
      await expect(importPreview(page)).toBeVisible();
    });
  }

  test("unsupported XLS and oversized files show clear errors before parsing", async ({ page }) => {
    await page.goto("/warranties/new");
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: "legacy.xls",
      mimeType: "application/vnd.ms-excel",
      buffer: Buffer.from("legacy"),
    });
    const fileAlert = page.locator(
      'div[role="alert"]:not(#__next-route-announcer__)',
    );
    await expect(fileAlert).toContainText(".xls desteklenmez");

    await input.setInputFiles({
      name: "oversized.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    });
    await expect(fileAlert).toContainText("en fazla 10 MB");
  });
});

function worksheetSelector(page: import("@playwright/test").Page) {
  return page.getByRole("combobox", {
    name: "Çalışma sayfası",
    exact: true,
  });
}

function importPreview(page: import("@playwright/test").Page) {
  return page.getByRole("region", {
    name: "2. Algılanan sütunlar / Önizleme",
    exact: true,
  });
}

async function uploadWorkbook(
  page: import("@playwright/test").Page,
  name: string,
  fileBytes: Uint8Array,
) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(fileBytes),
  });
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function workbookBytes(
  sheets: readonly {
    name: string;
    rows: readonly (readonly ExcelJS.CellValue[])[];
  }[],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      worksheet.addRow([...row]);
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
