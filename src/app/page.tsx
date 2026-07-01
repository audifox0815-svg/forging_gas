import { Workbench } from "@/components/workbench";
import { AuthChip } from "@/components/auth-chip";
import { getManagedProfiles, hasAnyAdminProfiles } from "@/lib/admin";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { getCurrentAuthContext, hasSupabaseAuthConfig } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const authEnabled = hasSupabaseAuthConfig();
  const currentUser = await getCurrentAuthContext();

  const [snapshot, adminBootstrapStatus, adminProfiles] = await Promise.all([
    getDashboardSnapshot(),
    hasAnyAdminProfiles(),
    currentUser?.role === "admin" ? getManagedProfiles(currentUser) : Promise.resolve([]),
  ]);

  return (
    <>
      <div className="fixed right-4 top-4 z-50">
        <AuthChip
          authEnabled={authEnabled}
          email={currentUser?.email ?? null}
          role={currentUser?.role ?? null}
        />
      </div>
      <Workbench
        initialSnapshot={snapshot}
        authEnabled={authEnabled}
        role={currentUser?.role ?? null}
        adminProfiles={adminProfiles}
        adminBootstrapStatus={adminBootstrapStatus}
        currentUserId={currentUser?.id ?? null}
      />
    </>
  );
}
