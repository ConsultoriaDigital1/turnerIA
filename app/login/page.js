// Aca monto la pantalla de acceso y le paso el estado basico de auth al formulario.

import { LoginForm } from "@/components/login-form";
import { getAuthConfig, isAuthConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const authConfig = getAuthConfig();

  return <LoginForm authConfigured={isAuthConfigured()} defaultEmail={authConfig.loginEmail} />;
}
