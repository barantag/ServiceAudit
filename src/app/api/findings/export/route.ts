import { getCurrentOrganizationId } from "@/lib/organizations/current-organization";
import { loadFindingsOperations } from "@/lib/findings/load-findings-operations";
import { parseFindingFilters } from "@/lib/findings/findings-operations";
import { createFindingsWorkbook } from "@/lib/findings/findings-workbook";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters = parseFindingFilters({
      status: url.searchParams.get("status"),
      type: url.searchParams.get("type"),
      query: url.searchParams.get("q"),
    });
    const organizationId = getCurrentOrganizationId();
    const { db } = await import("@/db");
    const result = await db.transaction(
      (transaction) => loadFindingsOperations(transaction, organizationId, filters),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    const workbookBody = await createFindingsWorkbook(result.findings);
    const exportDate = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    return new Response(workbookBody, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="ServiceAudit-bulgular-${exportDate}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch {
    return new Response(
      "Bulgular şu anda dışa aktarılamadı. Lütfen tekrar deneyin.",
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }
}
