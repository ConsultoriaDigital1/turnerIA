// Aca monto el layout global y aplico los ajustes visuales antes de hidratar la app.

import "./globals.css";

import { getAppSettingsInitScript } from "@/lib/app-settings";

export const metadata = {
  title: "turnerIA | Gestion de consultorios",
  description: "Dashboard para pacientes, Google Calendar, doctores e integracion segura con n8n.",
  other: {
    google: "notranslate"
  }
};

const appSettingsInitScript = getAppSettingsInitScript();

export default function RootLayout({ children }) {
  return (
    <html lang="es" translate="no" suppressHydrationWarning className="notranslate">
      <body suppressHydrationWarning className="notranslate">
        <script id="turneria-app-settings" dangerouslySetInnerHTML={{ __html: appSettingsInitScript }} />
        {children}
      </body>
    </html>
  );
}