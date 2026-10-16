import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    // The Recall bot renders /bridge as its camera; it's a standalone static page.
    return [{ source: "/bridge", destination: "/bridge.html" }];
  },
  async headers() {
    return [
      {
        source: "/bridge",
        headers: [
          // The bridge page needs the mic (meeting audio) and autoplay for the tutor's voice.
          { key: "Permissions-Policy", value: "microphone=(self), autoplay=(self)" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default nextConfig;
