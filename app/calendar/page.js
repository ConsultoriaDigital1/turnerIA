// Aca conecto la ruta de calendario con el shell y los datos del consultorio.

import { CalendarPage } from "@/components/calendar-page";
import { DashboardShell } from "@/components/dashboard-shell";
import { getClinicViewModel } from "@/lib/clinic-view-model";
import { getGoogleCalendarAgenda } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export default async function CalendarRoutePage() {
  const baseData = await getClinicViewModel();
  const agenda = await getGoogleCalendarAgenda(baseData.calendar);

  return (
    <DashboardShell>
      <CalendarPage
        calendar={agenda.calendar}
        googleCalendar={baseData.integrations.googleCalendar}
        agendaMeta={agenda.meta}
      />
    </DashboardShell>
  );
}

