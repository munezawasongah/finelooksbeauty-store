/**
 * The 3D store: builds the shop floor, fixtures and stocked shelves, and runs the
 * walk/look controls, picking, guided tour and camera glides. React only talks to it
 * through the TourHandle returned by createTour().
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SECTIONS, usd, type SectionKey, type TourProduct } from "./catalog";
import { acquireModelCache, buildProductModel, releaseModelCache, type BuiltModel } from "./models";
import {
  BRAND,
  aisleSignTexture,
  counterFrontTexture,
  endCapTexture,
  doorVinylTexture,
  fasciaTexture,
  featureWallTexture,
  floorDecalTexture,
  floorTexture,
  loadFonts,
  priceTagTexture,
  resolveFonts,
  scriptSignTexture,
  setMaxAnisotropy,
} from "./textures";

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type Quality = "high" | "low";

export type MapRect = { x: number; z: number; w: number; d: number; section?: SectionKey; kind: "fixture" | "counter" | "podium" | "door" };

export type TourLayout = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  rects: MapRect[];
  labels: { section: SectionKey; x: number; z: number }[];
};

export type TourOptions = {
  products: TourProduct[];
  quality: Quality;
  reducedMotion: boolean;
  onProgress: (fraction: number, label: string) => void;
  onSelect: (id: string | null) => void;
  onHover: (h: { id: string; x: number; y: number } | null) => void;
  onPose: (p: { x: number; z: number; yaw: number }) => void;
  onSection: (key: SectionKey | null) => void;
  onAutoTour: (on: boolean, section: SectionKey | null) => void;
  onInteract: () => void;
};

export type TourHandle = {
  layout: TourLayout;
  goTo: (key: SectionKey | "entrance") => void;
  focusProduct: (id: string) => void;
  teleport: (x: number, z: number) => void;
  setMove: (forward: number, turn: number) => void;
  setAutoTour: (on: boolean) => void;
  select: (id: string | null) => void;
  cloneProduct: (id: string) => THREE.Group | null;
  resize: () => void;
  dispose: () => void;
};

/* ------------------------------------------------------------------ */
/* Store dimensions (metres)                                           */
/* ------------------------------------------------------------------ */

const WALL_X = 9.3;
const BACK_Z = -14.3;
const FRONT_Z = 14;
const CEIL = 3.8;
const EYE = 1.62;
const WALL_FACE_X = 8.75;
const BACK_FACE_Z = -13.75;
const GONDOLA_X = 3;
const GONDOLA_HALF = 0.6;
const GONDOLA_Z0 = -9.5;
const GONDOLA_Z1 = 5;
const WALL_Z0 = -11;
const WALL_Z1 = 5.5;

type Row = { y: number; kind: "shelf" | "peg"; depth: number };

type Face = {
  section: SectionKey;
  /** Distance from the face plane back to the pegboard (for hanging stock). */
  pegInset: number;
  origin: THREE.Vector3; // floor-level point where the face starts
  along: THREE.Vector3;
  normal: THREE.Vector3; // points into the aisle
  length: number;
  rows: Row[];
  products: TourProduct[];
  aisle: string;
  /** Where the camera stands to look at this face. */
  view: { pos: [number, number]; look: [number, number, number] };
};

type Slot = { pid: string; center: THREE.Vector3; size: THREE.Vector3; quat: THREE.Quaternion; normal: THREE.Vector3 };

/* ------------------------------------------------------------------ */
/* createTour                                                          */
/* ------------------------------------------------------------------ */

export async function createTour(canvas: HTMLCanvasElement, opts: TourOptions): Promise<TourHandle> {
  const high = opts.quality === "high";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e9e2f4");
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 80);
  camera.rotation.order = "YXZ";

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  const disposables: { dispose(): void }[] = [envTex, pmrem];

  opts.onProgress(0.04, "Opening the doors");
  const fonts = resolveFonts();
  await loadFonts(fonts);
  const emblem = await loadImage("/brand/emblem.png");

  /* --------------------------- lighting --------------------------- */
  scene.add(new THREE.HemisphereLight("#ffffff", "#c9bde0", 0.95));
  const sun = new THREE.DirectionalLight("#fff3e6", 1.7);
  sun.position.set(-7, 11, 8);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = high;
  if (high) {
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 17;
    sc.bottom = -17;
    sc.near = 1;
    sc.far = 40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
  }
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight("#f1e8ff", 0.45);
  fill.position.set(6, 6, -8);
  scene.add(fill);

  /* ---------------------------- materials ------------------------- */
  const M = {
    wall: new THREE.MeshStandardMaterial({ color: "#ece4f7", roughness: 0.92 }),
    ceiling: new THREE.MeshStandardMaterial({ color: "#f1edf7", roughness: 1 }),
    melamine: new THREE.MeshStandardMaterial({ color: "#fbfaff", roughness: 0.55 }),
    shelf: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }),
    ink: new THREE.MeshStandardMaterial({ color: BRAND.ink, roughness: 0.4, metalness: 0.2 }),
    iris: new THREE.MeshStandardMaterial({ color: BRAND.iris, roughness: 0.35 }),
    orchid: new THREE.MeshStandardMaterial({ color: BRAND.orchid, roughness: 0.35 }),
    chrome: new THREE.MeshStandardMaterial({ color: "#e4e1ec", roughness: 0.18, metalness: 1 }),
    light: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    cove: new THREE.MeshBasicMaterial({ color: "#d9a6ff" }),
    glass: new THREE.MeshStandardMaterial({ color: "#cfe0ff", roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false }),
    quartz: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.15 }),
    plantPot: new THREE.MeshStandardMaterial({ color: "#efe7dc", roughness: 0.6 }),
    leaf: new THREE.MeshStandardMaterial({ color: "#3f7a4f", roughness: 0.65 }),
  };
  disposables.push(...Object.values(M));

  const peg = pegboardTexture();
  const pegMat = new THREE.MeshStandardMaterial({ map: peg, roughness: 0.7 });
  disposables.push(peg, pegMat);

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, opt: { cast?: boolean; receive?: boolean; parent?: THREE.Object3D; ry?: number; rx?: number } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (opt.ry) m.rotation.y = opt.ry;
    if (opt.rx) m.rotation.x = opt.rx;
    m.castShadow = Boolean(opt.cast) && high;
    m.receiveShadow = opt.receive ?? high;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    (opt.parent ?? scene).add(m);
    disposables.push(geo);
    return m;
  };
  const texPlane = (tex: THREE.Texture, w: number, h: number, opt: { transparent?: boolean; emissive?: boolean; double?: boolean } = {}) => {
    const mat = opt.emissive
      ? new THREE.MeshBasicMaterial({ map: tex, transparent: Boolean(opt.transparent), side: opt.double ? THREE.DoubleSide : THREE.FrontSide, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, transparent: Boolean(opt.transparent), side: opt.double ? THREE.DoubleSide : THREE.FrontSide });
    disposables.push(tex, mat);
    return { geo: new THREE.PlaneGeometry(w, h), mat };
  };

  /* ---------------------------- shell ----------------------------- */
  opts.onProgress(0.12, "Building the shop floor");
  const floorTex = floorTexture(Math.round((WALL_X * 2) / 0.6));
  floorTex.repeat.set((WALL_X * 2) / 2.4, (FRONT_Z - BACK_Z) / 2.4);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.2, metalness: 0.04 });
  disposables.push(floorTex, floorMat);
  add(new THREE.PlaneGeometry(WALL_X * 2, FRONT_Z - BACK_Z), floorMat, 0, 0, (FRONT_Z + BACK_Z) / 2, { rx: -Math.PI / 2, receive: true });
  add(new THREE.PlaneGeometry(WALL_X * 2, FRONT_Z - BACK_Z), M.ceiling, 0, CEIL, (FRONT_Z + BACK_Z) / 2, { rx: Math.PI / 2, receive: false });
  add(new THREE.PlaneGeometry(FRONT_Z - BACK_Z, CEIL), M.wall, -WALL_X, CEIL / 2, (FRONT_Z + BACK_Z) / 2, { ry: Math.PI / 2 });
  add(new THREE.PlaneGeometry(FRONT_Z - BACK_Z, CEIL), M.wall, WALL_X, CEIL / 2, (FRONT_Z + BACK_Z) / 2, { ry: -Math.PI / 2 });
  add(new THREE.PlaneGeometry(WALL_X * 2, CEIL), M.wall, 0, CEIL / 2, BACK_Z);
  // skirting
  add(new THREE.BoxGeometry(0.02, 0.1, FRONT_Z - BACK_Z), M.ink, -WALL_X + 0.01, 0.05, (FRONT_Z + BACK_Z) / 2);
  add(new THREE.BoxGeometry(0.02, 0.1, FRONT_Z - BACK_Z), M.ink, WALL_X - 0.01, 0.05, (FRONT_Z + BACK_Z) / 2);
  // orchid cove light around the ceiling edge
  add(new THREE.BoxGeometry(0.04, 0.04, FRONT_Z - BACK_Z), M.cove, -WALL_X + 0.04, CEIL - 0.08, (FRONT_Z + BACK_Z) / 2, { receive: false });
  add(new THREE.BoxGeometry(0.04, 0.04, FRONT_Z - BACK_Z), M.cove, WALL_X - 0.04, CEIL - 0.08, (FRONT_Z + BACK_Z) / 2, { receive: false });
  add(new THREE.BoxGeometry(WALL_X * 2, 0.04, 0.04), M.cove, 0, CEIL - 0.08, BACK_Z + 0.04, { receive: false });
  // ceiling light strips over the aisles and the front of house
  for (const x of [-6.17, 0, 6.17]) {
    for (let z = -12; z < 12; z += 3) add(new THREE.BoxGeometry(0.16, 0.035, 2.2), M.light, x, CEIL - 0.02, z + 1.1, { receive: false });
  }
  for (const z of [7.5, 10.5]) add(new THREE.BoxGeometry(14, 0.035, 0.16), M.light, 0, CEIL - 0.02, z, { receive: false });

  // shop front: glass, doors, frames, and daylight outside
  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 20),
    new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }),
  );
  outside.position.set(0, 4, FRONT_Z + 6);
  outside.rotation.y = Math.PI;
  scene.add(outside);
  disposables.push(outside.geometry, outside.material as THREE.Material, (outside.material as THREE.MeshBasicMaterial).map!);
  add(new THREE.PlaneGeometry(60, 20), new THREE.MeshStandardMaterial({ color: "#cfcbd6", roughness: 0.9 }), 0, -0.01, FRONT_Z + 10, { rx: -Math.PI / 2 });
  add(new THREE.PlaneGeometry(WALL_X * 2, 2.9), M.glass, 0, 1.45, FRONT_Z, { ry: Math.PI, receive: false });
  add(new THREE.BoxGeometry(WALL_X * 2, CEIL - 2.9, 0.12), M.wall, 0, 2.9 + (CEIL - 2.9) / 2, FRONT_Z);
  for (const x of [-WALL_X + 0.04, -5.5, -1.6, 1.6, 5.5, WALL_X - 0.04]) add(new THREE.BoxGeometry(0.08, 2.9, 0.1), M.ink, x, 1.45, FRONT_Z, { cast: true });
  add(new THREE.BoxGeometry(WALL_X * 2, 0.08, 0.12), M.ink, 0, 2.9, FRONT_Z);
  add(new THREE.BoxGeometry(0.03, 2.3, 0.04), M.chrome, -0.12, 1.15, FRONT_Z - 0.06);
  add(new THREE.BoxGeometry(0.03, 2.3, 0.04), M.chrome, 0.12, 1.15, FRONT_Z - 0.06);
  {
    const v = texPlane(doorVinylTexture(fonts), 2.6, 1.3, { transparent: true });
    add(v.geo, v.mat, 0, 1.75, FRONT_Z - 0.02, { ry: Math.PI, receive: false });
  }
  {
    const s = texPlane(scriptSignTexture(fonts, "Fine Looks", "Hair & Beauty · Garner, NC", emblem), 3.6, 1.125, { transparent: true });
    add(s.geo, s.mat, 0, 3.32, FRONT_Z - 0.07, { ry: Math.PI, receive: false });
  }
  {
    const d = texPlane(floorDecalTexture(fonts, emblem), 3.2, 3.2, { transparent: true });
    add(d.geo, d.mat, 0, 0.004, 10.3, { rx: -Math.PI / 2, receive: true });
  }
  // plants by the doors
  for (const x of [-3.2, 3.2]) plant(x, 12.9);

  /* ----------------------------- faces ---------------------------- */
  const productsBySection = new Map<SectionKey, TourProduct[]>();
  for (const s of SECTIONS) productsBySection.set(s.key, []);
  for (const p of opts.products) {
    productsBySection.get(p.section)!.push(p);
    if (p.featured) productsBySection.get("featured")!.push(p);
  }
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const faces: Face[] = [
    {
      section: "wigs", pegInset: 0, aisle: "Aisle 1", origin: new THREE.Vector3(-WALL_FACE_X, 0, WALL_Z1), along: Z.clone().negate(), normal: X.clone(),
      length: WALL_Z1 - WALL_Z0, products: productsBySection.get("wigs")!,
      rows: [{ y: 0.3, kind: "shelf", depth: 0.42 }, { y: 0.98, kind: "shelf", depth: 0.42 }, { y: 1.66, kind: "shelf", depth: 0.42 }],
      view: { pos: [-5.9, 2.4], look: [-8.7, 1.05, -1.2] },
    },
    {
      section: "bundles", pegInset: GONDOLA_HALF - 0.045, aisle: "Aisle 1", origin: new THREE.Vector3(-GONDOLA_X - GONDOLA_HALF, 0, GONDOLA_Z0 + 0.3), along: Z.clone(), normal: X.clone().negate(),
      length: GONDOLA_Z1 - GONDOLA_Z0 - 0.6, products: productsBySection.get("bundles")!,
      rows: [{ y: 1.8, kind: "peg", depth: 0.2 }, { y: 1.24, kind: "peg", depth: 0.2 }, { y: 0.68, kind: "peg", depth: 0.2 }],
      view: { pos: [-6.4, 3.4], look: [-3.6, 1.1, -0.6] },
    },
    {
      section: "braiding", pegInset: GONDOLA_HALF - 0.045, aisle: "Aisle 2", origin: new THREE.Vector3(-GONDOLA_X + GONDOLA_HALF, 0, GONDOLA_Z1 - 0.3), along: Z.clone().negate(), normal: X.clone(),
      length: GONDOLA_Z1 - GONDOLA_Z0 - 0.6, products: productsBySection.get("braiding")!,
      rows: [{ y: 1.86, kind: "peg", depth: 0.2 }, { y: 1.38, kind: "peg", depth: 0.2 }, { y: 0.9, kind: "peg", depth: 0.2 }],
      view: { pos: [0.6, 3.4], look: [-2.4, 1.15, -0.6] },
    },
    {
      section: "haircare", pegInset: 0, aisle: "Aisle 2", origin: new THREE.Vector3(GONDOLA_X - GONDOLA_HALF, 0, GONDOLA_Z0 + 0.3), along: Z.clone(), normal: X.clone().negate(),
      length: GONDOLA_Z1 - GONDOLA_Z0 - 0.6, products: productsBySection.get("haircare")!,
      rows: [0.14, 0.52, 0.9, 1.28, 1.66].map((y) => ({ y, kind: "shelf" as const, depth: 0.5 })),
      view: { pos: [-0.6, 3.4], look: [2.4, 1.0, -0.6] },
    },
    {
      section: "cosmetics", pegInset: 0, aisle: "Aisle 3", origin: new THREE.Vector3(GONDOLA_X + GONDOLA_HALF, 0, GONDOLA_Z1 - 0.3), along: Z.clone().negate(), normal: X.clone(),
      length: GONDOLA_Z1 - GONDOLA_Z0 - 0.6, products: productsBySection.get("cosmetics")!,
      rows: [0.62, 0.98, 1.34, 1.7].map((y) => ({ y, kind: "shelf" as const, depth: 0.42 })),
      view: { pos: [6.4, 3.4], look: [3.6, 1.15, -0.6] },
    },
    {
      section: "tools", pegInset: 0.47, aisle: "Aisle 3", origin: new THREE.Vector3(WALL_FACE_X, 0, WALL_Z0), along: Z.clone(), normal: X.clone().negate(),
      length: WALL_Z1 - WALL_Z0, products: productsBySection.get("tools")!,
      rows: [
        { y: 0.12, kind: "shelf", depth: 0.45 },
        { y: 0.58, kind: "shelf", depth: 0.45 },
        { y: 1.04, kind: "shelf", depth: 0.45 },
        { y: 1.86, kind: "peg", depth: 0.2 },
        { y: 2.32, kind: "peg", depth: 0.2 },
      ],
      view: { pos: [5.9, 2.4], look: [8.7, 1.15, -1.2] },
    },
    {
      section: "featured", pegInset: 0.47, aisle: "Back wall", origin: new THREE.Vector3(-8.2, 0, BACK_FACE_Z), along: X.clone(), normal: Z.clone(),
      length: 16.4, products: productsBySection.get("featured")!,
      rows: [{ y: 0.3, kind: "shelf", depth: 0.42 }, { y: 0.98, kind: "shelf", depth: 0.42 }, { y: 1.95, kind: "peg", depth: 0.2 }],
      view: { pos: [0, -9.2], look: [0, 1.1, -13.7] },
    },
  ];

  /* -------------------------- fixtures ---------------------------- */
  opts.onProgress(0.22, "Putting up the shelves");
  const featureTex = featureWallTexture(fonts, emblem);
  const featureMat = new THREE.MeshStandardMaterial({ map: featureTex, roughness: 0.75 });
  disposables.push(featureTex, featureMat);

  // wall units (wigs, tools, back wall)
  wallUnit(faces[0], featureMat, 2.42);
  wallUnit(faces[5], M.melamine, 2.62);
  wallUnit(faces[6], featureMat, 2.42);
  // gondolas
  gondola(-GONDOLA_X, faces[1], faces[2], pegMat, pegMat);
  gondola(GONDOLA_X, faces[3], faces[4], M.melamine, M.melamine);
  // cosmetics base cabinet with drawers
  {
    const f = faces[4];
    const mid = f.origin.clone().addScaledVector(f.along, f.length / 2);
    add(new THREE.BoxGeometry(0.4, 0.55, f.length), M.melamine, mid.x - 0.2 + 0.02, 0.275, mid.z, { cast: true });
    for (let i = 0; i < Math.floor(f.length / 0.9); i++) {
      const z = f.origin.z - 0.45 - i * 0.9;
      add(new THREE.BoxGeometry(0.01, 0.2, 0.84), M.iris, mid.x + 0.03, 0.4, z);
      add(new THREE.BoxGeometry(0.012, 0.02, 0.22), M.chrome, mid.x + 0.042, 0.4, z);
    }
  }

  // hanging aisle signs (both sides)
  const aisleSigns: [number, string, [string, string]][] = [
    [-6.17, "1", ["Wigs", "& Bundles"]],
    [0, "2", ["Braiding", "& Hair care"]],
    [6.17, "3", ["Cosmetics", "& Tools"]],
  ];
  for (const [x, n, lines] of aisleSigns) {
    const s = texPlane(aisleSignTexture(fonts, n, lines), 2.1, 0.79, { emissive: true });
    for (const z of [5.6, -10.4]) {
      add(s.geo, s.mat, x, 2.95, z + 0.012, { receive: false });
      add(s.geo, s.mat, x, 2.95, z - 0.012, { ry: Math.PI, receive: false });
      add(new THREE.BoxGeometry(2.14, 0.83, 0.02), M.ink, x, 2.95, z, { receive: false });
      for (const dx of [-0.9, 0.9]) add(new THREE.CylinderGeometry(0.004, 0.004, CEIL - 3.35, 4), M.chrome, x + dx, (CEIL + 3.35) / 2, z, { receive: false });
    }
  }

  checkoutCounter();
  const podiumSpots = podium();

  mergeStatic(scene);
  const occluders = scene.children.filter(
    (o): o is THREE.Mesh => o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && !o.matrixAutoUpdate && !(o.material as THREE.Material).transparent,
  );

  /* --------------------------- products --------------------------- */
  acquireModelCache();
  const templates = new Map<string, BuiltModel>();
  const pickables: THREE.InstancedMesh[] = [];
  const slots: Slot[] = [];
  type Placement = { pid: string; matrix: THREE.Matrix4; slot: number };
  const placements = new Map<string, Placement[]>();
  const tagPlacements = new Map<string, Placement[]>();
  const hookMatrices: THREE.Matrix4[] = [];

  const total = opts.products.length;
  let done = 0;
  for (const p of opts.products) {
    const built = buildProductModel(p, fonts, high ? 1 : 0.65);
    built.group = compactGroup(built.group);
    templates.set(p.id, built);
    done++;
    if (done % 6 === 0) {
      opts.onProgress(0.25 + (done / total) * 0.45, "Stocking the shelves");
      await nextFrame();
    }
  }

  for (const f of faces) layoutFace(f);
  // podium: featured wigs on tall stands
  const podiumWigs = opts.products.filter((p) => p.model.kind === "wig" && p.featured).slice(0, 3);
  podiumSpots.forEach((spot, i) => {
    const p = podiumWigs[i % Math.max(1, podiumWigs.length)];
    if (!p) return;
    const t = templates.get(p.id)!;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.ry);
    const pos = new THREE.Vector3(spot.x, spot.y, spot.z);
    const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1.15, 1.15, 1.15));
    const slot = pushSlot(p.id, pos.clone().add(new THREE.Vector3(0, t.h * 0.58, 0)), new THREE.Vector3(0.36, t.h * 1.15, 0.36), q, new THREE.Vector3(Math.sin(spot.ry), 0, Math.cos(spot.ry)));
    addPlacement(placements, p.id, m, slot);
  });

  opts.onProgress(0.75, "Pricing everything");
  // instanced meshes per template mesh
  const tmpM = new THREE.Matrix4();
  for (const [pid, list] of placements) {
    const t = templates.get(pid)!;
    t.group.updateMatrixWorld(true);
    t.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
      const slotIndex = new Int32Array(list.length);
      list.forEach((pl, i) => {
        tmpM.multiplyMatrices(pl.matrix, o.matrixWorld);
        im.setMatrixAt(i, tmpM);
        slotIndex[i] = pl.slot;
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = false;
      im.receiveShadow = high;
      im.userData = { pid, slotIndex };
      im.frustumCulled = true;
      scene.add(im);
      pickables.push(im);
    });
  }
  // price tags
  for (const [pid, list] of tagPlacements) {
    const p = opts.products.find((x) => x.id === pid)!;
    const tex = priceTagTexture(fonts, p.short, usd(p.priceCents), p.badge);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    const geo = new THREE.PlaneGeometry(0.15, 0.047);
    disposables.push(tex, mat, geo);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const slotIndex = new Int32Array(list.length);
    list.forEach((pl, i) => {
      im.setMatrixAt(i, pl.matrix);
      slotIndex[i] = pl.slot;
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.userData = { pid, slotIndex };
    scene.add(im);
    pickables.push(im);
  }
  // peg hooks
  if (hookMatrices.length) {
    const geo = new THREE.CylinderGeometry(0.004, 0.004, 0.2, 6);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, 0.1);
    const im = new THREE.InstancedMesh(geo, M.chrome, hookMatrices.length);
    hookMatrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
    disposables.push(geo);
  }

  // Invisible hit boxes, one per product block: generous tap targets, and one draw-free raycast.
  const hitBoxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), slots.length);
  hitBoxes.visible = false;
  slots.forEach((sl, i) => {
    hitBoxes.setMatrixAt(i, new THREE.Matrix4().compose(sl.center, sl.quat, sl.size.clone().add(new THREE.Vector3(0.02, 0.06, 0.04))));
  });
  hitBoxes.instanceMatrix.needsUpdate = true;
  hitBoxes.computeBoundingSphere();
  scene.add(hitBoxes);
  disposables.push(hitBoxes.geometry, hitBoxes.material as THREE.Material);

  /* -------------------------- highlight --------------------------- */
  const hl = new THREE.Group();
  const hlEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: BRAND.orchid, toneMapped: false }));
  const hlFill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: BRAND.orchid, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false }));
  hl.add(hlEdges, hlFill);
  hl.visible = false;
  scene.add(hl);
  disposables.push(hlEdges.geometry, hlEdges.material as THREE.Material, hlFill.geometry, hlFill.material as THREE.Material);
  const sel = hl.clone();
  sel.children.forEach((c) => {
    const m = c as THREE.Mesh | THREE.LineSegments;
    m.material = (m.material as THREE.Material).clone();
    disposables.push(m.material as THREE.Material);
  });
  ((sel.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.18;
  scene.add(sel);

  function showBox(target: THREE.Group, slotIdx: number | null) {
    if (slotIdx == null) {
      target.visible = false;
      return;
    }
    const s = slots[slotIdx];
    target.visible = true;
    target.position.copy(s.center);
    target.quaternion.copy(s.quat);
    target.scale.copy(s.size).addScalar(0.03);
  }

  /* ---------------------------- camera ---------------------------- */
  const pose = { x: 0, z: 12.6, yaw: 0, pitch: -0.04 };
  const obstacles: { x0: number; x1: number; z0: number; z1: number }[] = [
    { x0: -GONDOLA_X - GONDOLA_HALF - 0.05, x1: -GONDOLA_X + GONDOLA_HALF + 0.05, z0: GONDOLA_Z0 - 0.05, z1: GONDOLA_Z1 + 0.05 },
    { x0: GONDOLA_X - GONDOLA_HALF - 0.45, x1: GONDOLA_X + GONDOLA_HALF + 0.05, z0: GONDOLA_Z0 - 0.05, z1: GONDOLA_Z1 + 0.05 },
    { x0: -8.0, x1: -6.8, z0: 7.7, z1: 11.3 },
    { x0: 4.3, x1: 6.9, z0: 8.1, z1: 10.7 },
    { x0: -3.6, x1: -2.8, z0: 12.5, z1: 13.3 },
    { x0: 2.8, x1: 3.6, z0: 12.5, z1: 13.3 },
  ];
  const R = 0.32;
  const bounds = { x0: -WALL_FACE_X + 0.38, x1: WALL_FACE_X - 0.38, z0: BACK_FACE_Z + 0.42, z1: FRONT_Z - 0.6 };

  function blocked(x: number, z: number) {
    if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) return true;
    for (const o of obstacles) if (x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R) return true;
    return false;
  }
  function moveBy(dx: number, dz: number) {
    if (!blocked(pose.x + dx, pose.z + dz)) {
      pose.x += dx;
      pose.z += dz;
    } else {
      if (!blocked(pose.x + dx, pose.z)) pose.x += dx;
      else if (!blocked(pose.x, pose.z + dz)) pose.z += dz;
    }
  }
  function nearestFree(x: number, z: number) {
    if (!blocked(x, z)) return { x, z };
    for (let r = 0.2; r < 4; r += 0.2) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const nx = x + Math.cos(a) * r;
        const nz = z + Math.sin(a) * r;
        if (!blocked(nx, nz)) return { x: nx, z: nz };
      }
    }
    return { x: 0, z: 10 };
  }

  function applyCamera() {
    camera.position.set(pose.x, EYE, pose.z);
    camera.rotation.set(pose.pitch, pose.yaw, 0);
  }
  function lookAtPose(x: number, z: number, tx: number, ty: number, tz: number) {
    const yaw = Math.atan2(-(tx - x), -(tz - z));
    const pitch = Math.atan2(ty - EYE, Math.hypot(tx - x, tz - z));
    return { x, z, yaw, pitch };
  }

  type P = { x: number; z: number; yaw: number; pitch: number };
  type Glide = { legs: P[]; leg: number; from: P; to: P; t: number; dur: number; then?: () => void };
  let glide: Glide | null = null;

  /** True when walking in a straight line from a to b would pass through a fixture. */
  function segmentBlocked(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 0.2));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return true;
    }
    return false;
  }

  /** Waypoints from here to the target that walk round the shelf ends instead of through them. */
  function route(tx: number, tz: number): { x: number; z: number }[] {
    if (!segmentBlocked(pose.x, pose.z, tx, tz)) return [{ x: tx, z: tz }];
    const crossAisles = [6.45, -10.65];
    let best: { x: number; z: number }[] | null = null;
    let bestLen = Infinity;
    for (const zc of crossAisles) {
      const pts = [
        { x: pose.x, z: zc },
        { x: tx, z: zc },
        { x: tx, z: tz },
      ];
      let ok = true;
      let len = 0;
      let px = pose.x;
      let pz = pose.z;
      for (const q of pts) {
        if (segmentBlocked(px, pz, q.x, q.z)) {
          ok = false;
          break;
        }
        len += Math.hypot(q.x - px, q.z - pz);
        px = q.x;
        pz = q.z;
      }
      if (ok && len < bestLen) {
        bestLen = len;
        best = pts;
      }
    }
    return (best ?? [{ x: tx, z: tz }]).filter((q, i, arr) => i === arr.length - 1 || Math.hypot(q.x - (i ? arr[i - 1].x : pose.x), q.z - (i ? arr[i - 1].z : pose.z)) > 0.05);
  }

  function legDuration(from: P, to: P) {
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const turn = Math.abs(to.yaw - from.yaw);
    return THREE.MathUtils.clamp(0.35 + dist / 2.6 + turn * 0.3, 0.45, 4);
  }

  function startLeg(g: Glide) {
    const target = g.legs[g.leg];
    let dy = target.yaw - pose.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    g.from = { ...pose };
    g.to = { ...target, yaw: pose.yaw + dy };
    g.t = 0;
    g.dur = legDuration(g.from, g.to);
  }

  function glideTo(to: P, then?: () => void) {
    const free = nearestFree(to.x, to.z);
    const target = { ...to, x: free.x, z: free.z };
    if (opts.reducedMotion) {
      Object.assign(pose, target);
      glide = null;
      dirty = true;
      then?.();
      return;
    }
    const pts = route(target.x, target.z);
    const legs: P[] = pts.map((q, i) => {
      if (i === pts.length - 1) return target;
      // walk facing where we're going, eyes level
      const prev = i ? pts[i - 1] : pose;
      return { x: q.x, z: q.z, yaw: Math.atan2(-(q.x - prev.x), -(q.z - prev.z)), pitch: -0.05 };
    });
    const g: Glide = { legs, leg: 0, from: { ...pose }, to: target, t: 0, dur: 1, then };
    startLeg(g);
    glide = g;
  }

  /* --------------------------- controls --------------------------- */
  const keys = new Set<string>();
  let joyF = 0;
  let joyT = 0;
  let auto = false;
  let autoIdx = 0;
  let autoHold = 0;
  let hoverSlot: number | null = null;
  let dirty = true;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function stopAuto() {
    if (auto) {
      auto = false;
      opts.onAutoTour(false, null);
    }
  }
  function interact() {
    stopAuto();
    glide = null;
    opts.onInteract();
  }

  function pick(clientX: number, clientY: number, occlusion = false): { slot: number; pid: string } | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    raycaster.far = 9;
    const hit = raycaster.intersectObject(hitBoxes, false)[0];
    if (!hit || hit.instanceId == null) return null;
    if (occlusion) {
      // a gondola, end cap or counter in front of the product blocks the tap
      raycaster.far = hit.distance - 0.05;
      const blocker = raycaster.intersectObjects(occluders, false)[0];
      raycaster.far = 9;
      if (blocker) return null;
    }
    const slot = hit.instanceId;
    return { slot, pid: slots[slot].pid };
  }
  function floorPoint(clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const t = -raycaster.ray.origin.y / raycaster.ray.direction.y;
    if (!(t > 0) || t > 14) return null;
    return raycaster.ray.at(t, new THREE.Vector3());
  }

  let drag: { id: number; x: number; y: number; sx: number; sy: number; t: number; moved: boolean } | null = null;
  const onPointerDown = (e: PointerEvent) => {
    if (drag) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
        drag.moved = true;
        interact();
      }
      if (drag.moved) {
        const k = e.pointerType === "touch" ? 0.0058 : 0.0042;
        pose.yaw += dx * k;
        pose.pitch = THREE.MathUtils.clamp(pose.pitch + dy * k * 0.85, -0.75, 0.55);
        dirty = true;
      }
      return;
    }
    if (e.pointerType === "mouse") {
      pendingHover = { x: e.clientX, y: e.clientY };
    }
  };
  let pendingHover: { x: number; y: number } | null = null;
  const onPointerUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const wasClick = !drag.moved && performance.now() - drag.t < 600;
    drag = null;
    if (!wasClick) return;
    interact();
    const hit = pick(e.clientX, e.clientY, true);
    if (hit) {
      setSelected(hit.slot);
      opts.onSelect(hit.pid);
      return;
    }
    const pt = floorPoint(e.clientX, e.clientY);
    if (pt) {
      const free = nearestFree(pt.x, pt.z);
      const yaw = Math.atan2(-(free.x - pose.x), -(free.z - pose.z));
      glideTo({ x: free.x, z: free.z, yaw: Math.hypot(free.x - pose.x, free.z - pose.z) > 0.6 ? yaw : pose.yaw, pitch: pose.pitch });
    }
  };
  const onPointerCancel = () => {
    drag = null;
  };
  const onLeave = () => {
    pendingHover = null;
    if (hoverSlot != null) {
      hoverSlot = null;
      showBox(hl, null);
      opts.onHover(null);
      canvas.style.cursor = "";
      dirty = true;
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    interact();
    const step = THREE.MathUtils.clamp(-e.deltaY * 0.004, -0.8, 0.8);
    moveBy(-Math.sin(pose.yaw) * step, -Math.cos(pose.yaw) * step);
    dirty = true;
  };
  const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (!MOVE_KEYS.has(e.code)) return;
    if (!canvas.isConnected) return;
    // only when the tour has focus or nothing else does
    const active = document.activeElement;
    if (active && active !== document.body && active !== canvas && !canvas.parentElement?.contains(active)) return;
    e.preventDefault();
    if (!keys.has(e.code)) interact();
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const onBlur = () => keys.clear();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  function setSelected(slot: number | null) {
    showBox(sel, slot);
    dirty = true;
  }

  /* --------------------------- sections --------------------------- */
  const viewpoints = new Map<SectionKey | "entrance", { x: number; z: number; yaw: number; pitch: number }>();
  for (const f of faces) viewpoints.set(f.section, lookAtPose(f.view.pos[0], f.view.pos[1], ...f.view.look));
  viewpoints.set("entrance", { x: 0, z: 12.6, yaw: 0, pitch: -0.04 });
  const tourOrder: SectionKey[] = ["wigs", "bundles", "braiding", "haircare", "cosmetics", "tools", "featured"];

  let lastSection: SectionKey | null | undefined;
  function currentSection(): SectionKey | null {
    let best: SectionKey | null = null;
    let bestD = 6.5;
    const fwdX = -Math.sin(pose.yaw);
    const fwdZ = -Math.cos(pose.yaw);
    for (const f of faces) {
      // distance from camera to the face segment, preferring faces we look at
      const a = f.origin;
      const b = f.origin.clone().addScaledVector(f.along, f.length);
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const t = THREE.MathUtils.clamp(((pose.x - a.x) * abx + (pose.z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
      const px = a.x + abx * t;
      const pz = a.z + abz * t;
      const side = (pose.x - px) * f.normal.x + (pose.z - pz) * f.normal.z;
      if (side < 0) continue;
      const facing = -(fwdX * f.normal.x + fwdZ * f.normal.z);
      if (facing < -0.35) continue;
      const d = Math.hypot(pose.x - px, pose.z - pz) * (1.7 - facing);
      if (d < bestD) {
        bestD = d;
        best = f.section;
      }
    }
    return best;
  }

  /* ----------------------------- loop ----------------------------- */
  let lastT = performance.now();
  let raf = 0;
  let disposed = false;
  let lastPoseEmit = 0;

  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const nowT = performance.now();
    const dt = Math.min((nowT - lastT) / 1000, 0.05);
    lastT = nowT;

    // keyboard + joystick movement
    const run = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1.7 : 1;
    let f = joyF;
    let s = 0;
    let turn = joyT;
    if (keys.has("KeyW") || keys.has("ArrowUp")) f += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) f -= 1;
    if (keys.has("KeyA")) s -= 1;
    if (keys.has("KeyD")) s += 1;
    if (keys.has("ArrowLeft") || keys.has("KeyQ")) turn -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyE")) turn += 1;
    if (f || s || turn) {
      const speed = 2.4 * run * dt;
      const sin = Math.sin(pose.yaw);
      const cos = Math.cos(pose.yaw);
      moveBy((-sin * f + cos * s) * speed, (-cos * f - sin * s) * speed);
      pose.yaw -= turn * 1.9 * dt;
      dirty = true;
    }

    // glides & guided tour
    if (glide) {
      glide.t += dt / glide.dur;
      // one smooth walk across all legs: speed up on the first, ease off on the last
      const u = Math.min(1, glide.t);
      const first = glide.leg === 0;
      const last = glide.leg === glide.legs.length - 1;
      const k = first && last ? easeInOut(u) : first ? u * u * (2 - u) * 0.5 + u * 0.5 * u : last ? 1 - (1 - u) * (1 - u) : u;
      pose.x = THREE.MathUtils.lerp(glide.from.x, glide.to.x, k);
      pose.z = THREE.MathUtils.lerp(glide.from.z, glide.to.z, k);
      pose.yaw = THREE.MathUtils.lerp(glide.from.yaw, glide.to.yaw, k);
      pose.pitch = THREE.MathUtils.lerp(glide.from.pitch, glide.to.pitch, k);
      dirty = true;
      if (glide.t >= 1) {
        if (glide.leg < glide.legs.length - 1) {
          glide.leg++;
          startLeg(glide);
        } else {
          const then = glide.then;
          glide = null;
          then?.();
        }
      }
    } else if (auto) {
      autoHold -= dt;
      if (autoHold <= 0) {
        const key = tourOrder[autoIdx % tourOrder.length];
        autoIdx++;
        opts.onAutoTour(true, key);
        // wait for the walk to finish; set before glideTo because a reduced-motion jump finishes immediately
        autoHold = Infinity;
        glideTo(viewpoints.get(key)!, () => {
          autoHold = opts.reducedMotion ? 5 : 3.4;
        });
      }
    }

    // hover picking (mouse only, once per frame)
    if (pendingHover && !drag) {
      const hp = pendingHover;
      pendingHover = null;
      const hit = pick(hp.x, hp.y);
      const slot = hit?.slot ?? null;
      if (slot !== hoverSlot) {
        hoverSlot = slot;
        showBox(hl, slot);
        canvas.style.cursor = slot != null ? "pointer" : "";
        dirty = true;
      }
      opts.onHover(hit ? { id: hit.pid, x: hp.x, y: hp.y } : null);
    }

    if (dirty) {
      applyCamera();
      renderer.render(scene, camera);
      dirty = false;
      const now = performance.now();
      if (now - lastPoseEmit > 80) {
        lastPoseEmit = now;
        opts.onPose({ x: pose.x, z: pose.z, yaw: pose.yaw });
        const sec = currentSection();
        if (sec !== lastSection) {
          lastSection = sec;
          opts.onSection(sec);
        }
      }
    }
  }

  function resize() {
    const r = canvas.parentElement!.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 640 ? 70 : 62;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  resize();
  applyCamera();
  opts.onProgress(0.88, "Switching on the lights");
  renderer.shadowMap.needsUpdate = true;
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    /* compileAsync unsupported: compile happens on first render */
  }
  opts.onProgress(1, "Welcome in");
  raf = requestAnimationFrame(frame);
  if (typeof location !== "undefined" && location.search.includes("tourdebug")) {
    setTimeout(() => console.info("[tour] draw calls", renderer.info.render.calls, "triangles", renderer.info.render.triangles), 500);
  }

  /* ---------------------------- handle ---------------------------- */
  const layout = buildLayout();

  return {
    layout,
    goTo(key) {
      stopAuto();
      const v = viewpoints.get(key);
      if (v) glideTo(v);
    },
    focusProduct(id) {
      const idx = slots.findIndex((s) => s.pid === id);
      if (idx < 0) return;
      stopAuto();
      const s = slots[idx];
      const stand = s.center.clone().addScaledVector(s.normal, 1.5);
      glideTo(lookAtPose(stand.x, stand.z, s.center.x, s.center.y, s.center.z));
      setSelected(idx);
    },
    teleport(x, z) {
      stopAuto();
      const free = nearestFree(x, z);
      glideTo({ x: free.x, z: free.z, yaw: pose.yaw, pitch: pose.pitch });
    },
    setMove(forward, t) {
      if ((forward || t) && !joyF && !joyT) interact();
      joyF = forward;
      joyT = t;
    },
    setAutoTour(on) {
      if (on === auto) return;
      auto = on;
      glide = null;
      autoHold = 0;
      if (on) {
        const sec = currentSection();
        autoIdx = sec ? Math.max(0, tourOrder.indexOf(sec)) : 0;
      }
      opts.onAutoTour(on, null);
    },
    select(id) {
      if (id == null) setSelected(null);
      else {
        const idx = slots.findIndex((s) => s.pid === id);
        setSelected(idx >= 0 ? idx : null);
      }
    },
    cloneProduct(id) {
      const t = templates.get(id);
      return t ? t.group.clone(true) : null;
    },
    resize,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      for (const t of templates.values()) t.group.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      for (const im of pickables) im.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.merged) o.geometry.dispose();
      });
      for (const d of disposables) d.dispose();
      releaseModelCache();
      renderer.dispose();
    },
  };

  /* ------------------------------------------------------------------ */
  /* Builders (hoisted)                                                  */
  /* ------------------------------------------------------------------ */

  function pushSlot(pid: string, center: THREE.Vector3, size: THREE.Vector3, quat: THREE.Quaternion, normal: THREE.Vector3) {
    slots.push({ pid, center, size, quat, normal });
    return slots.length - 1;
  }
  function addPlacement(map: Map<string, Placement[]>, pid: string, matrix: THREE.Matrix4, slot: number) {
    let l = map.get(pid);
    if (!l) map.set(pid, (l = []));
    l.push({ pid, matrix, slot });
  }

  function faceBasis(f: Face) {
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, f.normal).normalize();
    const m = new THREE.Matrix4().makeBasis(right, up, f.normal);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }

  function layoutFace(f: Face) {
    if (!f.products.length) return;
    const q = faceBasis(f);
    const margin = 0.12;
    let cursor = 0;
    for (const row of f.rows) {
      const eligible = f.products.filter((p) => templates.get(p.id)!.mount === (row.kind === "shelf" ? "shelf" : "hang"));
      if (!eligible.length) continue;
      const rowHeight = rowClearance(f, row);
      let s = margin;
      let guard = 0;
      while (guard++ < 400) {
        const p = eligible[cursor % eligible.length];
        const t = templates.get(p.id)!;
        if (row.kind === "shelf" && t.h > rowHeight + 0.02) {
          cursor++;
          if (guard > eligible.length * 3 && eligible.every((e) => templates.get(e.id)!.h > rowHeight + 0.02)) break;
          continue;
        }
        const facings = t.facings;
        const gap = row.kind === "peg" ? 0.07 : 0.035;
        const blockW = facings * t.w + gap;
        if (s + blockW > f.length - margin) break;
        cursor++;
        const blockCenterS = s + blockW / 2;
        const base = f.origin.clone().addScaledVector(f.along, blockCenterS);
        const centerY = row.kind === "shelf" ? row.y + t.h / 2 : row.y - t.h / 2;
        const out = row.kind === "shelf" ? -(t.d / 2 + 0.05) : -f.pegInset + 0.12 + t.d / 2;
        const center = base.clone().add(new THREE.Vector3(0, centerY, 0)).addScaledVector(f.normal, out);
        const slot = pushSlot(p.id, center, new THREE.Vector3(blockW - gap * 0.5, t.h, t.d + 0.04), q, f.normal.clone());
        const rows = 1;
        for (let i = 0; i < facings; i++) {
          const along = s + gap / 2 + t.w * (i + 0.5);
          for (let r = 0; r < rows; r++) {
            const pos = f.origin.clone().addScaledVector(f.along, along);
            if (row.kind === "shelf") {
              pos.y = row.y;
              pos.addScaledVector(f.normal, -(t.d / 2 + 0.05) - r * (t.d + 0.01));
            } else {
              pos.y = row.y;
              pos.addScaledVector(f.normal, -f.pegInset + 0.12);
            }
            const jitter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((hashN(p.id, i + r * 7) % 100) / 100 - 0.5) * 0.08);
            const m = new THREE.Matrix4().compose(pos, q.clone().multiply(jitter), new THREE.Vector3(1, 1, 1));
            addPlacement(placements, p.id, m, slot);
          }
          if (row.kind === "peg") {
            const hook = f.origin.clone().addScaledVector(f.along, along).addScaledVector(f.normal, -f.pegInset);
            hook.y = row.y + 0.012;
            hookMatrices.push(new THREE.Matrix4().compose(hook, q, new THREE.Vector3(1, 1, 1)));
          }
        }
        // price tag on the shelf edge (or above the hooks)
        const tagPos = base.clone();
        if (row.kind === "shelf") {
          tagPos.y = row.y - 0.03;
          tagPos.addScaledVector(f.normal, 0.014);
        } else {
          tagPos.y = row.y + 0.05;
          tagPos.addScaledVector(f.normal, -f.pegInset + 0.005);
        }
        const tagScale = row.kind === "peg" ? 0.62 : 0.82;
        addPlacement(tagPlacements, p.id, new THREE.Matrix4().compose(tagPos, q, new THREE.Vector3(tagScale, tagScale, 1)), slot);
        s += blockW;
      }
    }
  }

  function rowClearance(f: Face, row: Row) {
    const above = f.rows.filter((r) => r.y > row.y).map((r) => r.y);
    const next = above.length ? Math.min(...above) : 2.4;
    return next - row.y - 0.05;
  }

  function shelvesFor(f: Face, parent?: THREE.Object3D) {
    const q = faceBasis(f);
    const mid = f.origin.clone().addScaledVector(f.along, f.length / 2);
    for (const row of f.rows) {
      if (row.kind === "shelf") {
        const c = mid.clone().addScaledVector(f.normal, -row.depth / 2 + 0.005);
        c.y = row.y - 0.0125;
        const m = add(new THREE.BoxGeometry(f.length, 0.025, row.depth), M.shelf, 0, 0, 0, { cast: true, parent });
        m.position.copy(c);
        m.quaternion.copy(q);
        m.updateMatrix();
        const lip = add(new THREE.BoxGeometry(f.length, 0.05, 0.01), M.iris, 0, 0, 0, { parent });
        lip.position.copy(mid.clone().addScaledVector(f.normal, 0.004));
        lip.position.y = row.y - 0.03;
        lip.quaternion.copy(q);
        lip.updateMatrix();
      }
    }
  }

  function fascia(f: Face, y: number, h: number, offset: number) {
    const sec = SECTIONS.find((s) => s.key === f.section)!;
    const len = f.length;
    const q = faceBasis(f);
    const mid = f.origin.clone().addScaledVector(f.along, len / 2).addScaledVector(f.normal, offset);
    const backing = add(new THREE.BoxGeometry(len, h, 0.04), M.ink, 0, 0, 0);
    backing.position.copy(mid.clone().addScaledVector(f.normal, -0.025));
    backing.position.y = y;
    backing.quaternion.copy(q);
    backing.updateMatrix();
    // long runs get the sign repeated so it's readable from anywhere in the aisle
    const n = Math.max(1, Math.round(len / 8));
    const pw = len / n - 0.1;
    const tex = fasciaTexture(fonts, sec.key === "featured" ? "Back wall · Fine Looks" : `${f.aisle} · Fine Looks`, sec.name, emblem, pw / h);
    const { geo, mat } = texPlane(tex, pw, h, {});
    for (let i = 0; i < n; i++) {
      const m = add(geo, mat, 0, 0, 0, { receive: false });
      m.position.copy(f.origin.clone().addScaledVector(f.along, (i + 0.5) * (len / n)).addScaledVector(f.normal, offset));
      m.position.y = y;
      m.quaternion.copy(q);
      m.updateMatrix();
    }
  }

  function wallUnit(f: Face, panelMat: THREE.Material, top: number) {
    const q = faceBasis(f);
    const mid = f.origin.clone().addScaledVector(f.along, f.length / 2);
    const back = add(new THREE.BoxGeometry(f.length, top, 0.04), panelMat, 0, 0, 0, { receive: true });
    back.position.copy(mid.clone().addScaledVector(f.normal, -0.5));
    back.position.y = top / 2;
    back.quaternion.copy(q);
    back.updateMatrix();
    const plinth = add(new THREE.BoxGeometry(f.length, 0.1, 0.5), M.ink, 0, 0, 0);
    plinth.position.copy(mid.clone().addScaledVector(f.normal, -0.25));
    plinth.position.y = 0.05;
    plinth.quaternion.copy(q);
    plinth.updateMatrix();
    // uprights
    const n = Math.round(f.length / 1.2);
    for (let i = 0; i <= n; i++) {
      const p = f.origin.clone().addScaledVector(f.along, (i / n) * f.length).addScaledVector(f.normal, -0.48);
      const u = add(new THREE.BoxGeometry(0.03, top, 0.05), M.ink, p.x, top / 2, p.z, { cast: true });
      u.quaternion.copy(q);
      u.updateMatrix();
    }
    if (f.rows.some((r) => r.kind === "peg")) {
      const pegRows = f.rows.filter((r) => r.kind === "peg").map((r) => r.y);
      const pegTop = Math.min(top, Math.max(...pegRows) + 0.12);
      const pegBottom = Math.min(...pegRows) - 0.45;
      const pb = add(new THREE.BoxGeometry(f.length, pegTop - pegBottom, 0.02), pegMat, 0, 0, 0);
      pb.position.copy(mid.clone().addScaledVector(f.normal, -f.pegInset - 0.01));
      pb.position.y = (pegTop + pegBottom) / 2;
      pb.quaternion.copy(q);
      pb.updateMatrix();
    }
    shelvesFor(f);
    fascia(f, top + 0.3, 0.52, 0.02);
    // light strip under the fascia
    const ls = add(new THREE.BoxGeometry(f.length, 0.02, 0.04), M.light, 0, 0, 0, { receive: false });
    ls.position.copy(f.origin.clone().addScaledVector(f.along, f.length / 2).addScaledVector(f.normal, -0.06));
    ls.position.y = top + 0.02;
    ls.quaternion.copy(q);
    ls.updateMatrix();
  }

  function gondola(cx: number, west: Face, east: Face, westMat: THREE.Material, eastMat: THREE.Material) {
    const len = GONDOLA_Z1 - GONDOLA_Z0;
    const cz = (GONDOLA_Z0 + GONDOLA_Z1) / 2;
    const H = 2.08;
    add(new THREE.BoxGeometry(GONDOLA_HALF * 2, 0.1, len), M.ink, cx, 0.05, cz, { cast: true });
    // centre spine: two panels back to back (each side can carry its own finish)
    add(new THREE.BoxGeometry(0.03, H, len - 0.1), westMat, cx - 0.03, H / 2, cz, { cast: true });
    add(new THREE.BoxGeometry(0.03, H, len - 0.1), eastMat, cx + 0.03, H / 2, cz, { cast: true });
    add(new THREE.BoxGeometry(0.06, 0.06, len), M.ink, cx, H + 0.03, cz);
    // end caps carry the aisle graphics
    const sw = SECTIONS.find((s) => s.key === west.section)!;
    const se = SECTIONS.find((s) => s.key === east.section)!;
    const capTex = endCapTexture(fonts, cx < 0 ? "Aisles 1 & 2" : "Aisles 2 & 3", sw.label, se.label, emblem);
    const capMat = new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.5 });
    disposables.push(capTex, capMat);
    for (const z of [GONDOLA_Z0, GONDOLA_Z1]) {
      const mats = [M.iris, M.iris, M.iris, M.iris, z === GONDOLA_Z1 ? capMat : M.iris, z === GONDOLA_Z0 ? capMat : M.iris];
      add(new THREE.BoxGeometry(GONDOLA_HALF * 2, H + 0.06, 0.06), mats, cx, (H + 0.06) / 2, z, { cast: true });
    }
    // shelves and back-to-back header signs on top of the spine
    for (const f of [west, east]) {
      shelvesFor(f);
      fascia(f, H + 0.24, 0.42, -(GONDOLA_HALF - 0.04));
    }
  }

  function checkoutCounter() {
    const cx = -7.4;
    const cz = 9.5;
    const len = 3.2;
    add(new THREE.BoxGeometry(0.8, 0.95, len), M.melamine, cx, 0.475, cz, { cast: true });
    add(new THREE.BoxGeometry(0.9, 0.04, len + 0.1), M.quartz, cx, 0.97, cz);
    const { geo, mat } = texPlane(counterFrontTexture(fonts), len - 0.1, 0.8);
    add(geo, mat, cx + 0.401, 0.48, cz, { ry: Math.PI / 2 });
    // POS screen + card reader
    add(new THREE.BoxGeometry(0.06, 0.06, 0.06), M.ink, cx - 0.1, 1.02, cz + 0.6);
    const screen = add(new THREE.BoxGeometry(0.02, 0.26, 0.38), M.ink, cx - 0.1, 1.2, cz + 0.6, { cast: true });
    screen.rotation.z = -0.25;
    screen.updateMatrix();
    add(new THREE.BoxGeometry(0.12, 0.03, 0.08), M.ink, cx + 0.2, 1.005, cz - 0.3);
    // branded shopping bags on the counter
    for (let i = 0; i < 3; i++) {
      add(new THREE.BoxGeometry(0.12, 0.3, 0.26), i % 2 ? M.iris : M.orchid, cx - 0.12, 1.14, cz - 1.0 + i * 0.3, { cast: true });
      add(new THREE.TorusGeometry(0.06, 0.006, 6, 16, Math.PI), M.ink, cx - 0.12, 1.29, cz - 1.0 + i * 0.3, { ry: Math.PI / 2 });
    }
    // hanging "checkout" sign
    const s = texPlane(aisleSignTexture(fonts, "$", ["Checkout", "& Pickup"]), 1.8, 0.675, { emissive: true });
    add(s.geo, s.mat, cx + 0.2, 2.75, cz, { ry: Math.PI / 2, receive: false });
    add(s.geo, s.mat, cx + 0.18, 2.75, cz, { ry: -Math.PI / 2, receive: false });
    for (const dz of [-0.8, 0.8]) add(new THREE.CylinderGeometry(0.004, 0.004, CEIL - 3.09, 4), M.chrome, cx + 0.19, (CEIL + 3.09) / 2, cz + dz, { receive: false });
  }

  function podium() {
    const cx = 5.6;
    const cz = 9.4;
    add(new THREE.CylinderGeometry(1.2, 1.25, 0.2, 64), M.melamine, cx, 0.1, cz, { cast: true });
    add(new THREE.CylinderGeometry(1.255, 1.255, 0.05, 64, 1, true), M.iris, cx, 0.17, cz);
    const spots: { x: number; y: number; z: number; ry: number }[] = [];
    const items = [
      { a: -0.9, r: 0.62, h: 0.75 },
      { a: 0.0, r: 0.0, h: 1.05 },
      { a: 0.9, r: 0.62, h: 0.6 },
    ];
    for (const it of items) {
      const x = cx + Math.sin(it.a + Math.PI) * it.r;
      const z = cz + Math.cos(it.a + Math.PI) * it.r;
      add(new THREE.CylinderGeometry(0.16, 0.18, it.h, 40), M.ink, x, 0.2 + it.h / 2, z, { cast: true });
      spots.push({ x, y: 0.2 + it.h, z, ry: Math.atan2(0 - x, 12 - z) * 0.4 });
    }
    // standee
    const st = texPlane(fasciaTexture(fonts, "Just landed", "New season looks", emblem, 2.6), 1.43, 0.55);
    add(st.geo, st.mat, cx - 1.45, 1.25, cz + 0.4, { ry: -0.5, receive: false });
    add(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8), M.chrome, cx - 1.45, 0.5, cz + 0.4);
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 24), M.ink, cx - 1.45, 0.01, cz + 0.4);
    return spots;
  }

  function plant(x: number, z: number) {
    add(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 32), M.plantPot, x, 0.25, z, { cast: true });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const leaf = new THREE.SphereGeometry(0.16, 12, 8);
      leaf.scale(0.45, 1.6, 0.18);
      const m = add(leaf, M.leaf, x + Math.sin(a) * 0.12, 0.85 + (i % 3) * 0.12, z + Math.cos(a) * 0.12, { cast: true });
      m.rotation.set(Math.cos(a) * 0.5, a, Math.sin(a) * 0.5);
      m.updateMatrix();
    }
  }

  function buildLayout(): TourLayout {
    const rects: MapRect[] = [
      { x: -WALL_X, z: WALL_Z0, w: WALL_X - WALL_FACE_X, d: WALL_Z1 - WALL_Z0, section: "wigs", kind: "fixture" },
      { x: WALL_FACE_X, z: WALL_Z0, w: WALL_X - WALL_FACE_X, d: WALL_Z1 - WALL_Z0, section: "tools", kind: "fixture" },
      { x: -8.2, z: BACK_Z, w: 16.4, d: BACK_FACE_Z - BACK_Z, section: "featured", kind: "fixture" },
      { x: -GONDOLA_X - GONDOLA_HALF, z: GONDOLA_Z0, w: GONDOLA_HALF, d: GONDOLA_Z1 - GONDOLA_Z0, section: "bundles", kind: "fixture" },
      { x: -GONDOLA_X, z: GONDOLA_Z0, w: GONDOLA_HALF, d: GONDOLA_Z1 - GONDOLA_Z0, section: "braiding", kind: "fixture" },
      { x: GONDOLA_X - GONDOLA_HALF, z: GONDOLA_Z0, w: GONDOLA_HALF, d: GONDOLA_Z1 - GONDOLA_Z0, section: "haircare", kind: "fixture" },
      { x: GONDOLA_X, z: GONDOLA_Z0, w: GONDOLA_HALF, d: GONDOLA_Z1 - GONDOLA_Z0, section: "cosmetics", kind: "fixture" },
      { x: -7.8, z: 7.9, w: 0.8, d: 3.2, kind: "counter" },
      { x: 4.4, z: 8.2, w: 2.4, d: 2.4, kind: "podium" },
      { x: -1.6, z: FRONT_Z - 0.1, w: 3.2, d: 0.2, kind: "door" },
    ];
    return {
      minX: -WALL_X,
      maxX: WALL_X,
      minZ: BACK_Z,
      maxZ: FRONT_Z,
      rects,
      labels: [
        { section: "wigs", x: -7.9, z: -2.7 },
        { section: "bundles", x: -4.6, z: -2.2 },
        { section: "braiding", x: -1.5, z: -2.2 },
        { section: "haircare", x: 1.5, z: -2.2 },
        { section: "cosmetics", x: 4.6, z: -2.2 },
        { section: "tools", x: 7.9, z: -2.7 },
        { section: "featured", x: 0, z: -13.2 },
      ],
    };
  }
}

/* ------------------------------------------------------------------ */
/* Module helpers                                                      */
/* ------------------------------------------------------------------ */

/** Same-material meshes merged into one draw call (geometry baked in group space). */
function mergeMeshes(meshes: THREE.Mesh[], toSpace: (m: THREE.Mesh) => THREE.Matrix4) {
  const out: THREE.Mesh[] = [];
  const byKey = new Map<string, THREE.Mesh[]>();
  for (const m of meshes) {
    if (Array.isArray(m.material)) {
      out.push(m);
      continue;
    }
    const attrs = Object.keys(m.geometry.attributes).sort().join(",");
    const key = `${(m.material as THREE.Material).uuid}|${m.castShadow}|${m.receiveShadow}|${attrs}|${m.geometry.index ? 1 : 0}`;
    let l = byKey.get(key);
    if (!l) byKey.set(key, (l = []));
    l.push(m);
  }
  for (const list of byKey.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const geos = list.map((m) => m.geometry.clone().applyMatrix4(toSpace(m)));
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) {
      out.push(...list);
      continue;
    }
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    mesh.userData.merged = true;
    out.push(mesh);
  }
  return out;
}

function mergeStatic(scene: THREE.Scene) {
  const candidates = scene.children.filter(
    (o): o is THREE.Mesh => o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && !o.matrixAutoUpdate,
  );
  const result = mergeMeshes(candidates, (m) => m.matrix);
  const keep = new Set(result);
  for (const m of candidates) if (!keep.has(m)) scene.remove(m);
  for (const m of result) {
    if (m.userData.merged) {
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      scene.add(m);
    }
  }
}

function compactGroup(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  const merged = mergeMeshes(meshes, (m) => m.matrixWorld);
  const g = new THREE.Group();
  for (const m of merged) {
    if (m.userData.merged) g.add(m);
    else {
      const copy = new THREE.Mesh(m.geometry, m.material);
      copy.applyMatrix4(m.matrixWorld);
      g.add(copy);
    }
  }
  return g;
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function hashN(s: string, n: number) {
  let h = 2166136261 ^ n;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

function pegboardTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f3eefb";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#cfc4e3";
  for (let y = 16; y < 256; y += 32) for (let x = 16; x < 256; x += 32) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(18, 3);
  return t;
}

function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#9cc4f2");
  g.addColorStop(0.55, "#e9f2fd");
  g.addColorStop(0.62, "#d9d3df");
  g.addColorStop(1, "#bdb6c4");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
