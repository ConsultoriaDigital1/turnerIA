// Aca dejo los datos semilla que usa la app mientras no haya persistencia real.

export const CLINIC_DASHBOARD = {
  clinic: {
    name: "Consultoría Digital",
    city: "Corrientes",
    address: "Campus Tecnologico",
    specialties: ["Clinica medica", "Cardiologia", "Pediatria", "Nutricion"]
  },
  patients: [
    {
      id: "pat-001",
      name: "Lucia Fernandez",
      age: 34,
      insurance: "OSDE 210",
      plan: "Plan A",
      doctor: "Dra. Paula Torres",
      specialty: "Clinica medica",
      phone: "+54 11 5555 1320",
      lastVisit: "2026-03-10",
      status: "active"
    },
    {
      id: "pat-002",
      name: "Mateo Rivas",
      age: 9,
      insurance: "Swiss Medical",
      plan: "Plan B",
      doctor: "Dr. Ignacio Vera",
      specialty: "Pediatria",
      phone: "+54 11 5555 1488",
      lastVisit: "2026-03-14",
      status: "follow_up"
    },
    {
      id: "pat-003",
      name: "Claudia Benitez",
      age: 57,
      insurance: "Medicus",
      plan: "Plan C",
      doctor: "Dr. Santiago Ferrer",
      specialty: "Cardiologia",
      phone: "+54 11 5555 2001",
      lastVisit: "2026-03-12",
      status: "priority"
    },
    {
      id: "pat-004",
      name: "Ramiro Campos",
      age: 41,
      insurance: "Particular",
      plan: "OSDE 2100",
      doctor: "Lic. Sofia Barrenechea",
      specialty: "Nutricion",
      phone: "+54 11 5555 1804",
      lastVisit: "2026-03-11",
      status: "waiting_docs"
    },
    {
      id: "pat-005",
      name: "Julieta Molina",
      age: 28,
      insurance: "Galeno",
      plan: "Plan A",
      doctor: "Dra. Paula Torres",
      specialty: "Clinica medica",
      phone: "+54 11 5555 1742",
      lastVisit: "2026-03-16",
      status: "active"
    }
  ],
  calendar: [
    {
      id: "day-001",
      label: "Hoy",
      date: "2026-03-17",
      slots: [
        {
          time: "09:30",
          patient: "Lucia Fernandez",
          doctor: "Dra. Paula Torres",
          type: "Control general",
          status: "confirmed"
        },
        {
          time: "11:00",
          patient: "Mateo Rivas",
          doctor: "Dr. Ignacio Vera",
          type: "Consulta pediatrica",
          status: "pending"
        },
        {
          time: "16:00",
          patient: "Claudia Benitez",
          doctor: "Dr. Santiago Ferrer",
          type: "Seguimiento cardiologico",
          status: "confirmed"
        }
      ]
    },
    {
      id: "day-002",
      label: "Manana",
      date: "2026-03-18",
      slots: [
        {
          time: "10:15",
          patient: "Ramiro Campos",
          doctor: "Lic. Sofia Barrenechea",
          type: "Plan alimentario",
          status: "pending"
        },
        {
          time: "15:45",
          patient: "Julieta Molina",
          doctor: "Dra. Paula Torres",
          type: "Chequeo clinico",
          status: "confirmed"
        }
      ]
    }
  ],
  doctors: [
    {
      id: "doc-001",
      name: "Dra. Paula Torres",
      specialty: "Clinica medica",
      room: "Consultorio 2",
      shift: "Lunes a viernes 08:00 - 16:00",
      plan: "Plan A",
      insurances: ["OSDE", "Galeno", "Medicus", "Particular"],
      notes: "Realiza chequeos generales, seguimiento y derivaciones."
    },
    {
      id: "doc-002",
      name: "Dr. Ignacio Vera",
      specialty: "Pediatria",
      room: "Consultorio 4",
      shift: "Lunes, miercoles y viernes 09:00 - 18:00",
      plan: "Plan B",
      insurances: ["Swiss Medical", "OSDE", "Particular"],
      notes: "Atiende control de nino sano y demanda espontanea."
    },
    {
      id: "doc-003",
      name: "Dr. Santiago Ferrer",
      specialty: "Cardiologia",
      room: "Consultorio 1",
      shift: "Martes y jueves 10:00 - 19:00",
      plan: "Plan C",
      insurances: ["Medicus", "OSDE", "Omint", "Particular"],
      notes: "Hace estudios de control y seguimiento de riesgo cardiovascular."
    },
    {
      id: "doc-004",
      name: "Lic. Sofia Barrenechea",
      specialty: "Nutricion",
      room: "Consultorio 5",
      shift: "Lunes a jueves 08:30 - 14:30",
      plan: "OSDE 2100",
      insurances: ["Galeno", "Swiss Medical", "Particular"],
      notes: "Trabaja con adultos, deportistas y planes alimentarios personalizados."
    }
  ]
};
