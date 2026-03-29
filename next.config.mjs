// Aca dejo la configuracion minima de Next.js para el proyecto.

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  webpack: (config, { dev, isServer }) => {
    // Desactivamos el cache de Webpack en desarrollo para evitar el error de Buffer
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
