import { redirect } from "next/navigation";

/** Setup hub redirects to Implementation Plan (first setup tab). */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const { entityId } = await searchParams;
  redirect(entityId ? `/guide?entityId=${entityId}` : "/guide");
}
