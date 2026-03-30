// Aca conecto la ruta de pacientes con el shell y los datos agregados del consultorio.

import { DashboardShell } from "@/components/dashboard-shell";
import { PatientsPage } from "@/components/patients-page";
import { buildClinicFilters } from "@/lib/clinic-view-model";
import { getClinicPatientsRouteData } from "@/lib/clinic-store";

export const dynamic = "force-dynamic";

export default async function PatientsRoutePage() {
  const data = await getClinicPatientsRouteData();

  return (
    <DashboardShell>
      <PatientsPage
        patients={data.patients}
        filters={buildClinicFilters(data.patients)}
        doctors={data.doctors}
        storage={data.storage}
      />
    </DashboardShell>
  );
}
