// Aca conecto la ruta de integraciones con el shell y el estado de las conexiones.

import { DashboardShell } from "@/components/dashboard-shell";
import { IntegrationsPage } from "@/components/integrations-page";
import { getClinicViewModel } from "@/lib/clinic-view-model";

export const dynamic = "force-dynamic";

export default async function IntegrationsRoutePage() {
  const data = await getClinicViewModel();

  return (
    <DashboardShell>
      <IntegrationsPage integrations={data.integrations} />
    </DashboardShell>
  );
}

