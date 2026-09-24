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
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
