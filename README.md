# turnerIA
by Consultoría Digital

Agenda médica inteligente con integración de Google Calendar y automatizaciones n8n.

turnerIA es una base de trabajo para un consultorio hecha con Next.js 15 y React 19.
La app hoy resuelve login con JWT, dashboard operativo, pacientes, doctores, agenda interna,
integracion con Google Calendar y disparos hacia n8n.

## Estado del proyecto

Este proyecto es nuevo.
Todavia no hay una base de datos persistente activa por defecto, no hay tests y gran parte de la informacion base sigue viniendo de datos semilla.
La idea de esta version es dejar una base clara, ordenada y lista para seguir creciendo sin arrancar de cero.

## Stack

- Next.js 15
- React 19
- Route Handlers de Next.js para la parte backend
- JWT con `jose`
- CSS global propio, sin framework visual externo
- Integracion opcional con Google Calendar
- Integracion opcional con n8n

## Que hace hoy

- Protege casi toda la app con login por cookie `httpOnly` y JWT.
- Muestra un dashboard principal con resumen operativo del consultorio.
- Tiene rutas separadas para pacientes, doctores, calendario e integraciones.
- Permite ver Google Calendar embebido si esta configurado.
- Permite crear eventos desde la app si existe OAuth compartido de Google.
- Si no existe OAuth, prepara el evento y abre Google Calendar para terminarlo alla.
- Permite disparar payloads a n8n por webhook o por API.
- Guarda ajustes visuales simples del lado del navegador: tema y densidad.

## Rutas principales

- `/login`: acceso a la app.
- `/`: overview general del consultorio.
- `/patients`: listado y filtros de pacientes.
- `/doctors`: fichas de profesionales.
- `/calendar`: agenda rapida + Google Calendar.
- `/integrations`: estado tecnico de integraciones.

## Endpoints principales

- `POST /api/auth/login`: inicia sesion y deja cookie JWT.
- `POST /api/auth/logout`: cierra sesion.
- `GET /api/clinic`: devuelve el view model agregado del dashboard.
- `GET /api/calendar/agenda`: devuelve la agenda rapida.
- `POST /api/calendar/events`: crea un evento real en Google Calendar si hay credenciales.
- `GET /api/integrations/google-calendar`: expone el estado de Google Calendar.
- `GET /api/integrations/n8n`: expone el estado de n8n.

## Estructura

- `app/`: rutas, layouts y endpoints.
- `components/`: vistas y piezas de UI.
- `lib/`: logica de negocio, auth, settings, integraciones y utilidades.
- `data/`: archivos de datos locales.
- `middleware.js`: proteccion de rutas privadas.

## Variables de entorno

### Auth

- `AUTH_LOGIN_EMAIL`: email permitido para iniciar sesion.
- `AUTH_LOGIN_PASSWORD`: password permitido para iniciar sesion.
- `AUTH_JWT_SECRET`: secreto para firmar y validar el JWT.
- `AUTH_JWT_EXPIRES_IN`: expiracion del token. Ejemplos: `30m`, `12h`, `7d`.
- `AUTH_COOKIE_NAME`: nombre de la cookie de sesion.

### Google Calendar

- `GOOGLE_CALENDAR_ID`: ID del calendario.
- `GOOGLE_CALENDAR_TIMEZONE`: zona horaria operativa.
- `GOOGLE_CALENDAR_CLIENT_ID`: client id OAuth para acceso compartido.
- `GOOGLE_CALENDAR_CLIENT_SECRET`: client secret OAuth.
- `GOOGLE_CALENDAR_REFRESH_TOKEN`: refresh token de la cuenta compartida.
- `GOOGLE_CALENDAR_ICS_URL`: feed iCal para lectura rapida sin OAuth.
- `NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_URL`: URL embebible del calendario.
- `NEXT_PUBLIC_GOOGLE_CALENDAR_OPEN_URL`: URL publica para abrir Google Calendar.

### n8n

- `N8N_MODE`: `webhook` o `api`.
- `N8N_WEBHOOK_URL`: URL del webhook si usas modo webhook.
- `N8N_API_BASE_URL`: base URL del API de n8n.
- `N8N_API_KEY`: token para el API de n8n.
- `N8N_API_PATH`: path del endpoint a disparar en modo API.
- `N8N_TIMEOUT_MS`: timeout de las llamadas salientes.

### UI

- `NEXT_PUBLIC_USER_EMAIL`: mail operativo que se muestra en el header.

## Desarrollo local

```bash
npm install
npm run dev
```

La app queda disponible en `http://localhost:3000`.

## Build

```bash
npm run build
npm run start
```

## Deploy

La app puede desplegarse en cualquier entorno compatible con Next.js. Si la despliegas en Vercel, asegurate de cargar primero las variables de entorno de auth, Google Calendar y n8n que realmente uses.

## Datos actuales

- La base del dashboard vive en `lib/clinic-data.js`.
- Parte de la agenda puede venir de Google Calendar segun configuracion.
- Las preferencias visuales se guardan en `localStorage`.

## Limitaciones actuales

- No hay persistencia real para pacientes o doctores desde la UI.
- No hay panel administrativo real para configurar integraciones.
- No hay tests automatizados.
- El proyecto sirve como base fuerte, no como producto medico terminado.

## Recomendacion honesta

Si esto va a crecer en serio, los siguientes pasos correctos son:

1. Endurecer el auth actual.
2. Agregar alta y edicion persistente de pacientes, doctores y agenda.
3. Agregar tests basicos de auth, calendario e integraciones.
4. Definir un flujo formal de despliegue y manejo de secretos.