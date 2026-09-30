import Link from "next/link";

export type FeedbackAction = {
  href: string;
  label: string;
  primary?: boolean;
};

type FeedbackStateProps = {
  title: string;
  description: string;
  actions?: readonly FeedbackAction[];
  className?: string;
};

export function EmptyState({
  title,
  description,
  actions = [],
  className = "",
}: FeedbackStateProps) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm sm:px-7 ${className}`}>
      <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 8h10M7 12h7M7 16h4" strokeLinecap="round" />
          <rect x="4" y="3" width="16" height="18" rx="2" />
        </svg>
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
      <FeedbackActions actions={actions} />
    </section>
  );
}

export function ErrorState({
  title,
  description,
  actions = [],
  className = "",
}: FeedbackStateProps) {
  return (
    <section role="alert" className={`rounded-2xl border border-red-200 bg-white px-5 py-8 shadow-sm sm:px-7 ${className}`}>
      <div className="max-w-2xl">
        <p className="text-base font-semibold text-red-800">{title}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <FeedbackActions actions={actions} align="start" />
    </section>
  );
}

function FeedbackActions({
  actions,
  align = "center",
}: {
  actions: readonly FeedbackAction[];
  align?: "center" | "start";
}) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className={`mt-5 flex flex-wrap gap-3 ${align === "center" ? "justify-center" : "justify-start"}`}>
      {actions.map((action) => (
        <Link
          key={`${action.href}-${action.label}`}
          href={action.href}
          className={action.primary
            ? "inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700"
            : "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100"}
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}
