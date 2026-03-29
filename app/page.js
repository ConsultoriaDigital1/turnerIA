// Aca levanto la home operativa usando el shell principal y el view model del consultorio.

import { OverviewPage } from "@/components/overview-page";
import { DashboardShell } from "@/components/dashboard-shell";
import { getClinicViewModel } from "@/lib/clinic-view-model";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getClinicViewModel();

  return (
    <DashboardShell>
      <OverviewPage data={data} />
    </DashboardShell>
  );
}

