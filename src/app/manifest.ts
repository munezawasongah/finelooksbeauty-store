import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fine Looks Hair & Beauty",
    short_name: "Fine Looks",
    description: "Wigs, hair and beauty supply in Garner, NC.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#5238de",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
