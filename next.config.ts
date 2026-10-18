import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Card export (satori, sharp, pdf-lib) runs in Node.js as plain packages, not bundled.
  serverExternalPackages: ["sharp", "satori", "pdf-lib"],
  // The card exporter reads font files at runtime; file tracing cannot see that, so include them.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@fontsource/*/files/*-latin-*-normal.woff", "./node_modules/@fontsource/*/files/*-latin-ext-*-normal.woff"],
  },
  async headers() {
    // Personal guest links: never in a Referer header sent elsewhere, never in a search index.
    return [{ source: "/antwort/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  experimental: {
    // Uploads are capped at 10 MB (src/domain/images.ts); leave room for multipart overhead.
    serverActions: { bodySizeLimit: "12mb" },
    proxyClientMaxBodySize: "12mb",
  },
};

export default withNextIntl(nextConfig);
