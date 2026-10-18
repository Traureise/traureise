import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
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
