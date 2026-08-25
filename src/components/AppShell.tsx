import Link from "next/link";
import { Suspense } from "react";
import { auth, signOut } from "@/auth";
import { EntitySwitcher } from "./EntitySwitcher";

const primaryNav = [
  { href: "/instruments", label: "Debt" },
  { href: "/documents", label: "Agreements" },
  { href: "/monthly", label: "Monthly" },
  { href: "/journals", label: "Journals" },
  { href: "/setup", label: "Setup" },
];

export async function AppShell({
  children,
  entityOptions,
  entityId,
}: {
  children: React.ReactNode;
  entityOptions: { id: string; code: string; name: string }[];
  entityId?: string;
}) {
  const session = await auth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-6">
            <Link href="/instruments" className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary">A</span>
              <span className="text-sm font-extrabold tracking-[0.18em] text-secondary uppercase">
                Debt
              </span>
            </Link>
            <nav className="flex items-center gap-4">
              {primaryNav.map((item) => (
                <Link
                  key={item.href}
                  href={entityId ? `${item.href}?entityId=${entityId}` : item.href}
                  className="text-nav text-secondary hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Suspense fallback={null}>
              <EntitySwitcher entities={entityOptions} value={entityId} />
            </Suspense>
            <div className="hidden text-right text-xs text-body sm:block">
              <div className="font-semibold text-secondary">{session?.user?.name}</div>
              <div className="uppercase tracking-wide">{session?.user?.role}</div>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="border border-primary px-3 py-1.5 text-nav text-primary hover:bg-primary hover:text-white"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>
    </div>
  );
}
