// Aca conecto la ruta de doctores con el shell y los datos del consultorio.

import { DashboardShell } from "@/components/dashboard-shell";
import { DoctorsPage } from "@/components/doctors-page";
import { getClinicViewModel } from "@/lib/clinic-view-model";

export const dynamic = "force-dynamic";

export default async function DoctorsRoutePage() {
  const data = await getClinicViewModel();

  return (
    <DashboardShell>
      <DoctorsPage doctors={data.doctors} storage={data.storage} />
    </DashboardShell>
  );
}