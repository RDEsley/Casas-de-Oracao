import type { NextConfig } from "next";

// BUILD_TARGET=mobile gera o site estático embarcado no app Capacitor.
// O export não aceita route handlers com POST; "route.ts" sai do build ao
// restringir as extensões de página a "tsx", e o app consome a API publicada.
const isMobileBuild = process.env.BUILD_TARGET === "mobile";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
];

const nextConfig: NextConfig = isMobileBuild
  ? {
      output: "export",
      pageExtensions: ["tsx"],
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      poweredByHeader: false,
      headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
    };

export default nextConfig;
