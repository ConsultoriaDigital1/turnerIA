// Aca conecto la ruta de pacientes con el shell y los datos agregados del consultorio.

import { DashboardShell } from "@/components/dashboard-shell";
import { PatientsPage } from "@/components/patients-page";
import { getClinicViewModel } from "@/lib/clinic-view-model";

export default async function PatientsRoutePage() {
  const data = await getClinicViewModel();

  return (
    <DashboardShell>
      <PatientsPage patients={data.patients} filters={data.filters} />
    </DashboardShell>
  );
}

