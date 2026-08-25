import { redirect } from "next/navigation";

/** Overview merged into Debt list — keep URL for bookmarks. */
export default async function DashboardRedirect({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const { entityId } = await searchParams;
  redirect(entityId ? `/instruments?entityId=${entityId}` : "/instruments");
}
