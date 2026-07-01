import { getDashboardSnapshot } from "@/lib/dashboard";
import { Workbench } from "@/components/workbench";
import { AuthChip } from "@/components/auth-chip";
import { getCurrentUser, hasSupabaseAuthConfig } from "@/lib/supabase-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const authEnabled = hasSupabaseAuthConfig();
  const currentUser = await getCurrentUser();

  if (authEnabled && !currentUser) {
    redirect("/login");
  }

  const snapshot = await getDashboardSnapshot();

  return (
    <>
      <div className="fixed right-4 top-4 z-50">
        <AuthChip authEnabled={authEnabled} email={currentUser?.email ?? null} />
      </div>
      <Workbench initialSnapshot={snapshot} />
    </>
  );
}
