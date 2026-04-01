import Image from "next/image";

import turneriaLogo from "@/public/turneria-logo.png";

const BRAND_LOGO_ALT = "TurnerIA Agenda Medica Inteligente";

export function BrandLogo({ className, priority = false, sizes = "100vw" }) {
  return (
    <Image
      src={turneriaLogo}
      alt={BRAND_LOGO_ALT}
      priority={priority}
      sizes={sizes}
      className={className}
    />
  );
}
