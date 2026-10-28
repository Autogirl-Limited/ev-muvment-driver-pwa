import type { MetadataRoute } from "next";

// Icons match the Muvment customer app so both installs share the same branding.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "EV Muvment Driver",
    short_name: "EV Driver",
    description: "Driver onboarding and auth for EV Muvment.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f8fd",
    theme_color: "#f6f8fd",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
