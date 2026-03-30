// Aca conecto la ruta de doctores con el shell y los datos del consultorio.

import { DashboardShell } from "@/components/dashboard-shell";
import { DoctorsPage } from "@/components/doctors-page";
import { getClinicDoctorsRouteData } from "@/lib/clinic-store";

export const dynamic = "force-dynamic";

export default async function DoctorsRoutePage() {
  const data = await getClinicDoctorsRouteData();

  return (
    <DashboardShell>
      <DoctorsPage doctors={data.doctors} storage={data.storage} />
    </DashboardShell>
  );
}
