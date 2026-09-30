import Link from "next/link";

export type AppNavigationKey =
  | "summary"
  | "findings"
  | "imports"
  | "service-import"
  | "warranty-import"
  | "organization-settings";

export const APPLICATION_NAVIGATION = [
  { key: "summary", label: "Yönetici Özeti", href: "/" },
  { key: "findings", label: "Bulgular", href: "/findings" },
  { key: "imports", label: "İçe Aktarımlar", href: "/imports" },
  { key: "service-import", label: "Servis Verisi Yükle", href: "/imports/new" },
  { key: "warranty-import", label: "Garanti Verisi Yükle", href: "/warranties/new" },
] as const satisfies readonly {
  key: AppNavigationKey;
  label: string;
  href: string;
}[];

export function AppHeader({
  activeItem,
  contextLabel,
  organizationName,
}: {
  activeItem?: AppNavigationKey;
  contextLabel?: string;
  organizationName?: string;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex min-h-16 w-full max-w-[1440px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-6 lg:px-8">
        <Link
          href="/"
          aria-label="ServiceAudit yönetici özetine git"
          className="flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">SA</span>
          <span>
            <span className="block text-base font-semibold tracking-tight text-slate-950">ServiceAudit</span>
            <span className="block text-xs text-slate-500">Servis harcaması inceleme</span>
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
          <nav aria-label="Ana navigasyon" className="flex flex-wrap gap-1.5">
            {APPLICATION_NAVIGATION.map((item) => {
              const isCurrent = item.key === activeItem;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={isCurrent
                    ? "inline-flex min-h-10 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700"
                    : "inline-flex min-h-10 items-center rounded-lg border border-transparent px-3 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {contextLabel && (
            <p className="w-fit shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">{contextLabel}</p>
          )}

          {organizationName && (
            <Link
              href="/settings/organization"
              aria-current={activeItem === "organization-settings" ? "page" : undefined}
              className={activeItem === "organization-settings"
                ? "w-fit shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                : "w-fit shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Aktif kuruluş</span>
              <span className="mt-0.5 block max-w-48 truncate">{organizationName}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}