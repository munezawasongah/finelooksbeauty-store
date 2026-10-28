/** Photos from the Garner store, used in the gallery and in the 3D store. Files live in /public/store-photos. */
/** `tile` sets the gallery cell: big (2×2), tall (1×2) or square (1×1). */
export type StorePhoto = { src: string; alt: string; caption: string; width: number; height: number; tile: "big" | "tall" | "square" };

export const STORE_PHOTOS: StorePhoto[] = [
  {
    src: "/store-photos/store-wig-wall.webp",
    tile: "big",
    alt: "The wig wall at Fine Looks: a row of wigs on display heads above walls of packaged hair, with glass counters below",
    caption: "The wig wall",
    width: 960,
    height: 720,
  },
  {
    src: "/store-photos/store-braid-wall.webp",
    tile: "square",
    alt: "Braiding hair wall stocked with pre-stretched and Easy Ready Soft braid packs under a shelf of wigs",
    caption: "Braiding hair, every brand and shade",
    width: 960,
    height: 720,
  },
  {
    src: "/store-photos/wig-goddess-locs.webp",
    tile: "tall",
    alt: "Goddess locs wig on a display head",
    caption: "Goddess locs wig",
    width: 600,
    height: 800,
  },
  {
    src: "/store-photos/store-braid-corner.webp",
    tile: "square",
    alt: "Corner of the store with colourful braiding hair, packaged extensions and a row of display heads",
    caption: "Colours for every style",
    width: 960,
    height: 720,
  },
  {
    src: "/store-photos/store-haircare-aisle.webp",
    tile: "tall",
    alt: "Hair care aisle with sprays, oils and gels on white shelves and braiding hair stacked below",
    caption: "The hair care aisle",
    width: 960,
    height: 720,
  },
  {
    src: "/store-photos/wig-fake-scalp-body-wave.webp",
    tile: "tall",
    alt: "Long body wave lace wig with a fake scalp part on a display head",
    caption: "Body wave lace wigs",
    width: 600,
    height: 800,
  },
  {
    src: "/store-photos/store-sleep-caps.webp",
    tile: "tall",
    alt: "Display stand of satin sleep caps, bonnets, wig caps and mesh wraps",
    caption: "Bonnets, caps & wraps",
    width: 960,
    height: 720,
  },
  {
    src: "/store-photos/store-front-door.webp",
    tile: "tall",
    alt: "The Fine Looks Hair & Beauty Store front door with the logo, phone number and opening hours",
    caption: "Find us at 106 Bratton Dr, Suite 5",
    width: 720,
    height: 960,
  },
];
