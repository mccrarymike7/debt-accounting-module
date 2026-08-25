import Link from "next/link";

const tabs = [
  { href: "/guide", label: "Guide" },
  { href: "/plan", label: "Plan" },
  { href: "/reference-rates", label: "Rates" },
  { href: "/gl-mapping", label: "G/L Map" },
  { href: "/reports", label: "Reports" },
  { href: "/admin", label: "Admin" },
  { href: "/covenants", label: "Covenants" },
];

export function SetupTabs({
  active,
  entityId,
}: {
  active:
    | "guide"
    | "plan"
    | "reference-rates"
    | "gl-mapping"
    | "reports"
    | "admin"
    | "covenants";
  entityId?: string;
}) {
  const q = entityId ? `?entityId=${entityId}` : "";
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => {
      const id = (t.href.startsWith("/") ? t.href.slice(1) : t.href) as typeof active;
        const isActive = active === id;
        return (
          <Link
            key={t.href}
            href={`${t.href}${q}`}
            className={`px-3 py-2 text-nav ${
              isActive
                ? "border-b-2 border-primary text-primary"
                : "text-body hover:text-secondary"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
