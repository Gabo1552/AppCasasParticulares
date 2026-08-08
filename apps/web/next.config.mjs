/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@casas/contracts'],
  // `next dev` genera y reescribe apps/web/AGENTS.md y apps/web/CLAUDE.md en cada
  // arranque. Son instrucciones de Next para asistentes de IA, no documentación
  // del proyecto: aparecían como archivos sin seguimiento en cada sesión de
  // desarrollo. La documentación del repositorio vive en docs/.
  agentRules: false,
  async headers() {
    // Headers de seguridad (docs/security-model.md §5).
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // La geolocalización se habilita sólo donde el fichaje la usa (FIC-09).
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
