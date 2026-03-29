import { CLINIC_DASHBOARD } from "@/lib/clinic-data";
import { getClinicFirestoreId, getFirestoreDb, isFirestoreEnabled } from "@/lib/firebase-admin";

function cloneSeedDashboard() {
  return JSON.parse(JSON.stringify(CLINIC_DASHBOARD));
}

function sortByName(left, right) {
  return String(left?.name || "").localeCompare(String(right?.name || ""));
}

function sortByDate(left, right) {
  return String(left?.date || "").localeCompare(String(right?.date || ""));
}

async function getFirestoreClinicData() {
  const db = getFirestoreDb();
  const clinicId = getClinicFirestoreId();
  const clinicRef = db.collection("clinics").doc(clinicId);

  const [clinicSnapshot, patientsSnapshot, doctorsSnapshot, calendarSnapshot] = await Promise.all([
    clinicRef.get(),
    clinicRef.collection("patients").get(),
    clinicRef.collection("doctors").get(),
    clinicRef.collection("calendar").get()
  ]);

  if (!clinicSnapshot.exists) {
    throw new Error(
      `Firestore esta habilitado pero falta clinics/${clinicId}. Corre npm run seed:firestore antes de depender de Firestore.`
    );
  }

  return {
    clinic: clinicSnapshot.data(),
    patients: patientsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })).sort(sortByName),
    doctors: doctorsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })).sort(sortByName),
    calendar: calendarSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })).sort(sortByDate)
  };
}

export async function getClinicDashboardData() {
  if (!isFirestoreEnabled()) {
    return cloneSeedDashboard();
  }

  return getFirestoreClinicData();
}
