import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EV Muvment Driver",
    short_name: "EV Driver",
    description: "Driver onboarding and auth for EV Muvment.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f8fd",
    theme_color: "#f6f8fd",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Full-bleed with the marks kept inside the safe zone, so Android can crop it to any shape.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
