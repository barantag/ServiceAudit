import { expect, test, type Page } from "@playwright/test";

const navigation = [
  { path: "/", label: "Yönetici Özeti", heading: "Yönetici Özeti" },
  { path: "/findings", label: "Bulgular", heading: "Bulgular" },
  { path: "/imports", label: "İçe Aktarımlar", heading: "İçe Aktarımlar" },
  { path: "/imports/new", label: "Servis Verisi Yükle", heading: "Servis verisi dosyasını yükleyin" },
  { path: "/warranties/new", label: "Garanti Verisi Yükle", heading: "Garanti verisi yükleyin" },
] as const;

async function expectOrganizationIdentity(page: Page) {
  const identity = page.getByRole("link", { name: /Aktif kuruluş/ });
  await expect(identity).toBeVisible();
  await expect(identity).toHaveAttribute("href", "/settings/organization");
}
async function expectSharedNavigation(page: Page, activeLabel: string) {
  const nav = page.getByRole("navigation", { name: "Ana navigasyon" });
  await expect(nav).toBeVisible();

  for (const item of navigation) {
    await expect(nav.getByRole("link", { name: item.label, exact: true })).toHaveAttribute("href", item.path);
  }

  await expect(nav.getByRole("link", { name: activeLabel, exact: true })).toHaveAttribute("aria-current", "page");
}

test.describe("ServiceAudit read-only pilot QA", () => {
  for (const item of navigation) {
    test(`${item.path} renders shared navigation and active state`, async ({ page }) => {
      const response = await page.goto(item.path);
      expect(response?.ok()).toBeTruthy();
      await expect(page.getByRole("heading", { name: item.heading, exact: true })).toBeVisible();
      await expectSharedNavigation(page, item.label);
      await expectOrganizationIdentity(page);
    });
  }


  test("organization settings renders current identity and validates empty names", async ({ page }) => {
    const response = await page.goto("/settings/organization");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Kuruluş Ayarları" })).toBeVisible();
    const identity = page.getByRole("link", { name: /Aktif kuruluş/ });
    await expect(identity).toHaveAttribute("aria-current", "page");
    const nameInput = page.getByLabel("Kuruluş adı");
    await expect(nameInput).not.toHaveValue("");
    await nameInput.fill("   ");
    await page.getByRole("button", { name: "Değişiklikleri Kaydet" }).click();
    await expect(page.getByText("Kuruluş adı boş bırakılamaz.", { exact: true })).toBeVisible();
  });

  test("organization save sends only a trimmed display name without persistent mutation", async ({ page }) => {
    let submittedBody: unknown;
    await page.route("**/api/organization", async (route) => {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          organization: { name: "QA Görünüm" },
          message: "Kuruluş adı güncellendi.",
        }),
      });
    });
    await page.goto("/settings/organization");
    await page.getByLabel("Kuruluş adı").fill("  QA Görünüm  ");
    await page.getByRole("button", { name: "Değişiklikleri Kaydet" }).click();
    await expect(page.getByRole("status")).toContainText("Kuruluş adı güncellendi.");
    expect(submittedBody).toEqual({ name: "QA Görünüm" });
  });

  test("normal finding detail retains organization context when findings exist", async ({ page }) => {
    await page.goto("/findings");
    const reviewLink = page.getByRole("link", { name: "İncele" }).first();
    if (await reviewLink.count() === 0) {
      await expect(page.getByRole("heading", { name: "Güncel inceleme bulgusu yok" })).toBeVisible();
      return;
    }
    await reviewLink.click();
    await expect(page).toHaveURL(/\/findings\/detail\?key=/);
    await expectOrganizationIdentity(page);
  });
  test("findings guaranteed no-match keeps filters and clears them", async ({ page }) => {
    await page.goto("/findings?status=open&type=repeated-failure&q=__serviceaudit_qa_no_match_7f8b4e20__");

    await expect(page.getByRole("heading", { name: "Bulguları Daralt" })).toBeVisible();
    await expect(page.getByLabel("İnceleme durumu")).toHaveValue("open");
    await expect(page.getByLabel("Bulgu türü")).toHaveValue("repeated-failure");
    await expect(page.getByRole("searchbox", { name: "Ara" })).toHaveValue("__serviceaudit_qa_no_match_7f8b4e20__");
    await expect(page.getByRole("heading", { name: "Filtrelerle eşleşen bulgu yok" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Güncel inceleme bulgusu yok" })).toHaveCount(0);

    await page.getByRole("link", { name: "Filtreleri Temizle" }).first().click();
    await expect(page).toHaveURL(/\/findings$/);
    await expect(page.getByRole("searchbox", { name: "Ara" })).toHaveValue("");
  });

  test("import history guaranteed no-match keeps filters and clears them", async ({ page }) => {
    await page.goto("/imports?type=service&q=__serviceaudit_qa_no_match_7f8b4e20__");

    await expect(page.getByRole("heading", { name: "İçe Aktarımları Daralt" })).toBeVisible();
    await expect(page.getByLabel("Veri türü")).toHaveValue("service");
    await expect(page.getByLabel("Dosya adı")).toHaveValue("__serviceaudit_qa_no_match_7f8b4e20__");
    await expect(page.getByRole("heading", { name: "Filtrelerle eşleşen içe aktarım yok" })).toBeVisible();

    await page.getByRole("link", { name: "Filtreleri Temizle" }).first().click();
    await expect(page).toHaveURL(/\/imports$/);
    await expect(page.getByLabel("Dosya adı")).toHaveValue("");
  });

  test("import history exposes safe analysis-state confirmation without writing data", async ({ page }) => {
    await page.goto("/imports");

    const excludeButton = page.getByRole("button", { name: "Analizden Çıkar" }).first();
    const restoreButton = page.getByRole("button", { name: "Analize Geri Al" }).first();
    const noImports = page.getByRole("heading", { name: "Henüz içe aktarım yok" });
    const excludeCount = await excludeButton.count();
    const restoreCount = await restoreButton.count();

    if (excludeCount === 0 && restoreCount === 0) {
      await expect(noImports).toBeVisible();
      return;
    }

    await expect(page.getByText(/Analizde|Analiz Dışı/, { exact: true }).first()).toBeVisible();
    const actionButton = excludeCount > 0 ? excludeButton : restoreButton;
    await page.route("**/api/imports/*/analysis-state", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          code: "ACTIVE_DUPLICATE_EXISTS",
          message: "Aynı dosyanın başka bir içe aktarımı şu anda analizde.",
        }),
      });
    });
    await actionButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Güncel bulgular ve yönetici özeti");
    if (excludeCount > 0) {
      await expect(dialog).toContainText("Kaynak kayıtlar, ham satır değerleri ve inceleme kararları silinmez");
      const submitButton = dialog.getByRole("button", { name: "Analizden Çıkar" });
      await expect(submitButton).toBeDisabled();
      await dialog.getByLabel("Analizden çıkarma gerekçesi").fill("Playwright salt-okunur onay kontrolü");
      await expect(submitButton).toBeEnabled();
    }

    await dialog.getByRole("button", {
      name: excludeCount > 0 ? "Analizden Çıkar" : "Analize Geri Al",
    }).click();
    await expect(dialog.getByRole("alert")).toContainText("Aynı dosyanın başka bir içe aktarımı şu anda analizde.");
    await dialog.getByRole("button", { name: "Vazgeç" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("analysis-state API rejects an unknown import without creating data", async ({ request }) => {
    const response = await request.post(
      "/api/imports/00000000-0000-0000-0000-000000000000/analysis-state",
      {
        data: { action: "restore", reason: null },
        headers: { Origin: "http://localhost:3000" },
      },
    );
    expect(response.status()).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "IMPORT_NOT_FOUND",
    });
  });

  test("state-changing API rejects a cross-origin browser request", async ({ request }) => {
    const response = await request.post(
      "/api/imports/00000000-0000-0000-0000-000000000000/analysis-state",
      {
        data: { action: "restore", reason: null },
        headers: {
          Origin: "https://attacker.example",
          "Sec-Fetch-Site": "cross-site",
        },
      },
    );
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "INVALID_REQUEST",
    });
  });

  test("finding-specific not-found uses the ServiceAudit recovery state", async ({ page }) => {
    const response = await page.goto("/findings/detail?key=qa-nonexistent-finding-key");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Bulgu bulunamadı" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Bulgulara Dön" })).toHaveAttribute("href", "/findings");
    await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Internal Server Error|stack trace/i);
  });

  test("general not-found uses ServiceAudit recovery navigation", async ({ page }) => {
    const response = await page.goto("/__serviceaudit_qa_missing_page__");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Yönetici Özetine Dön" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "Bulguları Gör" })).toHaveAttribute("href", "/findings");
    await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Internal Server Error|stack trace/i);
  });

  test("findings page retains filters, Excel export, and a valid data state", async ({ page }) => {
    await page.goto("/findings");
    await expect(page.getByLabel("İnceleme durumu")).toBeVisible();
    await expect(page.getByLabel("Bulgu türü")).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Ara" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Filtrelenen Sonuçları Excel Olarak İndir" })).toHaveAttribute("href", "/api/findings/export");
    await expect(page.getByText(/Toplam [\d.]+ bulgu/)).toBeVisible();
    await expect(page.getByRole("heading", {
      name: /Tekrarlayan Arızalar|Mükerrer Servis Kayıtları|Anormal Servis Fiyatları|Garanti Süresinde Ücretli Servisler|Güncel inceleme bulgusu yok/,
    }).first()).toBeVisible();
  });

  for (const importPage of [
    { path: "/imports/new", active: "Servis Verisi Yükle" },
    { path: "/warranties/new", active: "Garanti Verisi Yükle" },
  ] as const) {
    test(`${importPage.path} exposes Excel and CSV selection without uploading`, async ({ page }) => {
      await page.goto(importPage.path);
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeVisible();
      await expect(fileInput).toHaveAttribute("accept", ".xlsx,.csv");
      await expectSharedNavigation(page, importPage.active);
    });
  }
});
