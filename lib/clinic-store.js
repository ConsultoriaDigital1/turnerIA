import { CLINIC_DASHBOARD } from "@/lib/clinic-data";

function cloneSeedDashboard() {
  return JSON.parse(JSON.stringify(CLINIC_DASHBOARD));
}

export async function getClinicDashboardData() {
  return cloneSeedDashboard();
}