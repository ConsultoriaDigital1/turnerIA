// Aca conecto la ruta de calendario con el shell y los datos del consultorio.

import { CalendarPage } from "@/components/calendar-page";
import { DashboardShell } from "@/components/dashboard-shell";
import { getClinicViewModel } from "@/lib/clinic-view-model";

export const dynamic = "force-dynamic";

export default async function CalendarRoutePage() {
  const data = await getClinicViewModel({ syncGoogleAgenda: true });

  return (
    <DashboardShell>
      <CalendarPage
        calendar={data.calendar}
        googleCalendar={data.integrations.googleCalendar}
        agendaMeta={data.calendarMeta}
      />
    </DashboardShell>
  );
}