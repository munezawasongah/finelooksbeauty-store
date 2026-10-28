/**
 * Procedural 3D product models for the store tour. Each product becomes one template
 * group that is instanced across the shelves.
 *
 * Conventions:
 *  - "shelf" models: origin at the bottom centre; the front faces +Z.
 *  - "hang" models: origin at the peg hole (top centre); the body hangs down (-Y) and
 *    the back sits against the pegboard at z = 0.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { HairStyle, ModelSpec, TourProduct } from "./catalog";
import {
  BRAND,
  boxArtTexture,
  hashString,
  headerCardTexture,
  labelTexture,
  luminance,
  paletteTopTexture,
  shade,
  type Fonts,
} from "./textures";

export type Mount = "shelf" | "hang";

export type BuiltModel = {
  group: THREE.Group;
  /** Footprint used for shelf layout (metres). */
  w: number;
  h: number;
  d: number;
  mount: Mount;
  /** Facings per product block on the shelf. */
  facings: number;
};

/* ------------------------------------------------------------------ */
/* Shared materials                                                    */
/* ------------------------------------------------------------------ */

const cache = new Map<string, THREE.Material>();
function mat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
}
let users = 0;
/** Each running tour holds the shared material cache; it is freed when the last one closes. */
export function acquireModelCache() {
  users++;
}
export function releaseModelCache() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  for (const m of cache.values()) {
    for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
    m.dispose();
  }
  cache.clear();
}

const plastic = (c: string, rough = 0.32) => mat(`pl:${c}:${rough}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 }));
const metal = (c: string) => mat(`mt:${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.9 }));
const clearPlastic = () =>
  mat("clear", () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false }));
const skinMat = (c: string) => mat(`skin:${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0 }));
const texMat = (key: string, make: () => THREE.Texture, rough = 0.45) =>
  mat(`tx:${key}`, () => new THREE.MeshStandardMaterial({ map: make(), roughness: rough, metalness: 0 }));
const hairMat = (key: string, base: string, vertexColors: boolean) =>
  mat(`hair:${key}`, () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: vertexColors ? "#ffffff" : base,
      roughness: 0.52,
      metalness: 0,
      sheen: 1,
      sheenRoughness: 0.32,
      sheenColor: new THREE.Color(shade(base, 0.28)),
      side: THREE.DoubleSide,
      vertexColors,
    });
    return m;
  });

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Geometry detail: 1 = desktop, lower on phones. Every segment count goes through seg(). */
let detail = 1;
const seg = (n: number, min = 6) => Math.max(min, Math.round(n * detail));

function mesh(geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  return o;
}

function noise2(x: number, y: number, seed: number) {
  return (
    Math.sin(x * 1.7 + seed) * Math.cos(y * 2.3 - seed * 0.7) * 0.5 +
    Math.sin(x * 3.1 - y * 1.3 + seed * 1.9) * 0.3 +
    Math.sin(x * 5.3 + y * 4.1 + seed * 0.3) * 0.2
  );
}

function setVertexGradient(geo: THREE.BufferGeometry, top: number, bottom: number, c0: string, c1: string, from = 0.35, to = 0.95) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color(c0);
  const b = new THREE.Color(c1);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((top - pos.getY(i)) / (top - bottom), 0, 1);
    const k = THREE.MathUtils.smoothstep(t, from, to);
    tmp.copy(a).lerp(b, k);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function displaceRadial(geo: THREE.BufferGeometry, top: number, len: number, fn: (t: number, theta: number) => number) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z) || 1e-6;
    const theta = Math.atan2(x, z);
    const t = THREE.MathUtils.clamp((top - y) / len, 0, 1);
    const k = (r + fn(t, theta)) / r;
    pos.setXYZ(i, x * k, y, z * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/* ------------------------------------------------------------------ */
/* Wigs on display heads                                               */
/* ------------------------------------------------------------------ */

const HEAD_Y = 0.43;
const HEAD_R = 0.1;

function wavyFn(style: HairStyle, len: number, seed: number): (t: number, theta: number) => number {
  switch (style) {
    case "body":
      return (t, th) => 0.016 * Math.sin(t * len * 30 + th * 1.5) * Math.sqrt(t) + 0.03 * t;
    case "deep":
      return (t, th) => 0.02 * Math.sin(t * len * 62 + th * 5) * Math.min(1, t * 3) + 0.04 * t;
    case "water":
      return (t, th) => 0.013 * Math.sin(t * len * 78 + th * 9) * Math.min(1, t * 4) + 0.035 * t;
    case "kinky":
      return (t, th) => 0.012 * noise2(th * 7, t * 14, seed) + 0.05 * t + 0.012;
    case "curly":
      return (t, th) => 0.016 * (Math.sin(th * 11 + seed) * Math.cos(t * 30 + th * 2) + 0.6 * noise2(th * 6, t * 18, seed)) + 0.06 * t + 0.016;
    default:
      return (t, th) => 0.0025 * Math.sin(th * 46) + 0.012 * t;
  }
}

function buildWig(spec: Extract<ModelSpec, { kind: "wig" }>, seed: number): BuiltModel {
  const g = new THREE.Group();
  const skin = spec.skin ?? ["#8b5a3c", "#6e4430", "#a06a48", "#5a3828"][seed % 4];
  // display stand
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.025, seg(20)), plastic(BRAND.ink, 0.2), 0, 0.0125, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.21, 8), metal("#d8d4e2"), 0, 0.13, 0));
  const bust = mesh(new THREE.CylinderGeometry(0.044, 0.062, 0.11, seg(18)), skinMat(skin), 0, 0.29, 0);
  g.add(bust);
  const headGeo = new THREE.SphereGeometry(HEAD_R, seg(20), seg(14));
  headGeo.scale(0.94, 1.18, 1.05);
  g.add(mesh(headGeo, skinMat(skin), 0, HEAD_Y, 0));

  const [c0, c1] = spec.colors;
  const ombre = Boolean(c1 && c1 !== c0);
  const hm = hairMat(`${c0}:${c1 ?? ""}`, c0, ombre);
  const volume = spec.style === "kinky" || spec.style === "curly" ? 1.1 : spec.style === "pixie" ? 1.06 : 1.03;

  // crown cap
  const capTheta = spec.style === "pixie" ? 0.58 * Math.PI : 0.46 * Math.PI;
  const cap = new THREE.SphereGeometry(HEAD_R * 1.08, seg(28), seg(12), 0, Math.PI * 2, 0, capTheta);
  cap.scale(0.94 * volume, 1.18 * Math.min(volume, 1.06), 1.05 * volume);
  if (spec.style !== "straight") {
    const pos = cap.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const th = Math.atan2(x, z);
      const amp = spec.style === "kinky" || spec.style === "curly" || spec.style === "pixie" ? 0.008 : 0.003;
      const k = 1 + (amp * noise2(th * 9, y * 60, seed)) / HEAD_R;
      pos.setXYZ(i, x * k, y * (1 + (amp * 0.5 * noise2(th * 5, y * 30, seed + 2)) / HEAD_R), z * k);
    }
    cap.computeVertexNormals();
  }
  cap.translate(0, HEAD_Y, 0);
  if (ombre) setVertexGradient(cap, HEAD_Y + 0.13, HEAD_Y - 0.4, c0, c1!);
  g.add(new THREE.Mesh(cap, hm));

  const top = HEAD_Y + 0.045;
  const gap = 0.56 * Math.PI;
  if (spec.style === "braids") {
    const strands: THREE.BufferGeometry[] = [];
    const n = Math.round(26 * Math.max(0.7, detail));
    const len = 0.14 + spec.length * 0.36;
    for (let i = 0; i < n; i++) {
      const th = gap / 2 + (i / (n - 1)) * (Math.PI * 2 - gap);
      const s = new THREE.CylinderGeometry(0.0085, 0.006, len, 5, seg(14));
      const p = s.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const y = p.getY(v);
        const ang = Math.atan2(p.getX(v), p.getZ(v));
        const k = 1 + 0.22 * Math.sin(y * 260 + ang * 2);
        p.setXYZ(v, p.getX(v) * k, y, p.getZ(v) * k);
      }
      s.computeVertexNormals();
      const r = 0.108 + 0.01 * Math.sin(i * 2.1);
      s.translate(Math.sin(th) * r, top - len / 2, Math.cos(th) * r * 1.05);
      // fan out slightly towards the tips
      s.rotateY(0);
      strands.push(s);
    }
    const merged = mergeGeometries(strands)!;
    if (ombre) setVertexGradient(merged, top, top - len, c0, c1!);
    g.add(new THREE.Mesh(merged, hm));
  } else if (spec.style !== "pixie") {
    const len = spec.style === "bob" ? 0.17 : 0.12 + spec.length * 0.36;
    const rb = spec.style === "bob" ? 0.135 : 0.118 + spec.length * 0.02;
    const curtain = new THREE.CylinderGeometry(0.106 * volume, rb * volume, len, seg(36), seg(spec.style === "straight" || spec.style === "bob" ? 8 : 22), true, gap / 2, Math.PI * 2 - gap);
    curtain.translate(0, top - len / 2, 0);
    curtain.scale(0.97, 1, 1.07);
    displaceRadial(curtain, top, len, wavyFn(spec.style, len, seed));
    if (ombre) setVertexGradient(curtain, top, top - len, c0, c1!);
    g.add(new THREE.Mesh(curtain, hm));
    if (spec.style === "bob") {
      const bangs = new THREE.CylinderGeometry(0.113, 0.118, 0.07, seg(14), 3, true, -gap / 2 - 0.05, gap + 0.1);
      bangs.translate(0, HEAD_Y + 0.075, 0);
      bangs.scale(0.97, 1, 1.07);
      g.add(new THREE.Mesh(bangs, hm));
    }
  }
  return { group: g, w: 0.36, h: 0.6, d: 0.3, mount: "shelf", facings: 1 };
}

/* ------------------------------------------------------------------ */
/* Bundles & braiding hair (hanging packs)                             */
/* ------------------------------------------------------------------ */

function weftGeometry(texture: HairStyle, w: number, len: number, seed: number) {
  const geo = new THREE.BoxGeometry(w, len, 0.02, 4, seg(texture === "straight" ? 6 : 28), 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = (len / 2 - y) / len;
    let dz = 0;
    let dx = 0;
    switch (texture) {
      case "body":
        dz = 0.008 * Math.sin(t * 16);
        break;
      case "deep":
        dz = 0.009 * Math.sin(t * 34 + x * 30);
        break;
      case "water":
        dz = 0.007 * Math.sin(t * 44 + x * 60);
        break;
      case "kinky":
        dz = 0.006 * noise2(x * 90, t * 40, seed);
        dx = 0.004 * noise2(t * 30, x * 50, seed + 3);
        break;
      default:
        dz = 0.0015 * Math.sin(x * 400);
    }
    // taper towards the tip
    const taper = 1 - 0.18 * t;
    pos.setXYZ(i, (x + dx) * taper, y, pos.getZ(i) + dz);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildBundle(p: TourProduct, spec: Extract<ModelSpec, { kind: "bundle" }>, f: Fonts, seed: number): BuiltModel {
  const g = new THREE.Group();
  const cardW = 0.16;
  const cardH = 0.1;
  const card = texMat(`card:${p.id}`, () => headerCardTexture(f, { brand: p.brand, name: p.short, color: BRAND.iris, swatch: spec.color }));
  const back = plastic("#ffffff", 0.6);
  g.add(mesh(new THREE.BoxGeometry(cardW, cardH, 0.004), [back, back, back, back, card, back], 0, -cardH / 2 - 0.005, 0.008));
  const len = 0.2 + spec.length * 0.2;
  const weft = weftGeometry(spec.texture, 0.11, len, seed);
  weft.translate(0, -cardH - 0.01 - len / 2, 0.022);
  g.add(new THREE.Mesh(weft, hairMat(`b:${spec.color}`, spec.color, false)));
  const sleeveH = len + cardH + 0.02;
  g.add(mesh(new THREE.BoxGeometry(cardW + 0.008, sleeveH, 0.046), clearPlastic(), 0, -sleeveH / 2 - 0.002, 0.023));
  return { group: g, w: 0.2, h: sleeveH, d: 0.05, mount: "hang", facings: 1 };
}

function buildBraid(p: TourProduct, spec: Extract<ModelSpec, { kind: "braid" }>, f: Fonts, seed: number): BuiltModel {
  const g = new THREE.Group();
  const [c0, c1] = spec.colors;
  const ombre = Boolean(c1 && c1 !== c0);
  const card = texMat(`card:${p.id}`, () => headerCardTexture(f, { brand: p.brand, name: p.short, color: BRAND.ink, swatch: c0, swatch2: c1 }));
  const back = plastic("#ffffff", 0.6);
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.065, 0.004), [back, back, back, back, card, back], 0, -0.036, 0.006));
  const len = spec.style === "kanekalon" ? 0.3 : 0.34;
  const loop = new THREE.CapsuleGeometry(0.03, len, 4, seg(spec.style === "crochet" || spec.style === "locs" ? 24 : 10), seg(12));
  loop.scale(1, 1, 0.55);
  const pos = loop.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const th = Math.atan2(x, z);
    let k = 1;
    if (spec.style === "crochet" || spec.style === "locs") k += 0.18 * Math.sin(y * 140 + th * 3) + 0.06 * noise2(th * 4, y * 30, seed);
    else k += 0.02 * Math.sin(th * 30);
    pos.setXYZ(i, x * k, y, z * k);
  }
  loop.computeVertexNormals();
  const top = -0.07;
  loop.translate(0, top - (len + 0.06) / 2, 0.02);
  if (ombre) setVertexGradient(loop, top, top - len - 0.06, c0, c1!, 0.25, 0.85);
  g.add(new THREE.Mesh(loop, hairMat(`r:${c0}:${c1 ?? ""}`, c0, ombre)));
  const band = new THREE.CylinderGeometry(0.0335, 0.0335, 0.045, seg(14), 1, true);
  band.scale(1, 1, 0.58);
  band.translate(0, top - 0.06, 0.02);
  g.add(new THREE.Mesh(band, plastic(BRAND.iris, 0.5)));
  return { group: g, w: 0.12, h: len + 0.14, d: 0.04, mount: "hang", facings: 1 };
}

/* ------------------------------------------------------------------ */
/* Hair care bottles & jars                                            */
/* ------------------------------------------------------------------ */

function lathe(points: [number, number][], segments = seg(18)) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

function buildBottle(p: TourProduct, spec: Extract<ModelSpec, { kind: "bottle" }>, f: Fonts): BuiltModel {
  const g = new THREE.Group();
  const body = plastic(spec.color, spec.shape === "gel" ? 0.12 : 0.28);
  const capM = plastic(spec.cap, 0.3);
  const ink = luminance(spec.color) > 0.55 ? BRAND.ink : "#ffffff";
  const wrapLabel = (r: number, h: number, y: number) => {
    const m = texMat(`lbl:${p.id}`, () => labelTexture(f, { brand: p.brand, name: p.short, bg: spec.color, ink, accent: spec.label, wrap: true }), 0.4);
    const geo = new THREE.CylinderGeometry(r, r, h, seg(22), 1, true, -Math.PI, Math.PI * 2);
    return mesh(geo, m, 0, y, 0);
  };
  const frontLabel = (w: number, h: number, y: number, z: number) => {
    const m = texMat(`flbl:${p.id}`, () => labelTexture(f, { brand: p.brand, name: p.short, bg: spec.color, ink, accent: spec.label }), 0.4);
    return mesh(new THREE.PlaneGeometry(w, h), m, 0, y, z);
  };
  let w = 0.08;
  let h = 0.2;
  switch (spec.shape) {
    case "shampoo": {
      const geo = lathe([[0, 0], [0.03, 0], [0.036, 0.008], [0.037, 0.15], [0.03, 0.178], [0.013, 0.188], [0.013, 0.196], [0, 0.196]]);
      geo.scale(1, 1, 0.62);
      g.add(new THREE.Mesh(geo, body));
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.034, seg(13)), capM, 0, 0.213, 0));
      g.add(frontLabel(0.058, 0.11, 0.085, 0.0232));
      w = 0.085;
      h = 0.23;
      break;
    }
    case "pump": {
      g.add(mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.17, seg(22)), body, 0, 0.085, 0));
      g.add(mesh(new THREE.SphereGeometry(0.031, seg(22), 12, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.17, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.03, 20), capM, 0, 0.21, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 10), capM, 0, 0.235, 0));
      g.add(mesh(new THREE.BoxGeometry(0.018, 0.012, 0.045), capM, 0, 0.255, 0.012));
      g.add(wrapLabel(0.0315, 0.11, 0.075));
      w = 0.075;
      h = 0.27;
      break;
    }
    case "jar":
    case "gel": {
      const r = spec.shape === "gel" ? 0.055 : 0.045;
      const hh = spec.shape === "gel" ? 0.085 : 0.05;
      g.add(mesh(new THREE.CylinderGeometry(r, r * 0.96, hh, seg(22)), body, 0, hh / 2, 0));
      g.add(mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.022, seg(22)), capM, 0, hh + 0.011, 0));
      g.add(wrapLabel(r * 1.005, hh * 0.7, hh * 0.48));
      w = r * 2 + 0.015;
      h = hh + 0.025;
      break;
    }
    case "spray": {
      g.add(mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.16, seg(19)), body, 0, 0.08, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.02, 20), capM, 0, 0.17, 0));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.04, 0.05), capM, 0, 0.198, 0.008));
      g.add(mesh(new THREE.BoxGeometry(0.012, 0.035, 0.012), capM, 0, 0.168, 0.028));
      g.add(wrapLabel(0.0285, 0.1, 0.07));
      w = 0.07;
      h = 0.22;
      break;
    }
    case "tube": {
      const geo = new THREE.CylinderGeometry(0.03, 0.022, 0.16, seg(17), 8);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) + 0.08) / 0.16;
        pos.setZ(i, pos.getZ(i) * (1 - 0.92 * t * t) * 0.8);
        pos.setX(i, pos.getX(i) * (1 + 0.25 * t));
      }
      geo.computeVertexNormals();
      g.add(mesh(geo, body, 0, 0.11, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, seg(13)), capM, 0, 0.015, 0));
      g.add(mesh(new THREE.BoxGeometry(0.075, 0.012, 0.004), body, 0, 0.192, 0));
      g.add(frontLabel(0.045, 0.08, 0.1, 0.0215));
      w = 0.085;
      h = 0.2;
      break;
    }
    case "oil": {
      g.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.1, seg(17)), plastic(spec.color, 0.08), 0, 0.05, 0));
      g.add(mesh(new THREE.SphereGeometry(0.024, seg(17), 10, 0, Math.PI * 2, 0, Math.PI / 2), plastic(spec.color, 0.08), 0, 0.1, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.02, 16), capM, 0, 0.128, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.024, 16), capM, 0, 0.148, 0));
      g.add(mesh(new THREE.CapsuleGeometry(0.008, 0.012, 3, 8), plastic(BRAND.ink, 0.6), 0, 0.172, 0));
      g.add(wrapLabel(0.0245, 0.06, 0.048));
      w = 0.06;
      h = 0.19;
      break;
    }
  }
  return { group: g, w, h, d: 0.08, mount: "shelf", facings: 3 };
}

/* ------------------------------------------------------------------ */
/* Cosmetics                                                           */
/* ------------------------------------------------------------------ */

function buildCosmetic(p: TourProduct, spec: Extract<ModelSpec, { kind: "cosmetic" }>, f: Fonts, seed: number): BuiltModel {
  const g = new THREE.Group();
  const accent = spec.accent ?? BRAND.gold;
  let w = 0.06;
  let h = 0.12;
  switch (spec.shape) {
    case "lipstick": {
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, seg(15)), metal(accent), 0, 0.025, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.006, seg(15)), plastic(BRAND.ink, 0.2), 0, 0.053, 0));
      const bullet = new THREE.CylinderGeometry(0.0085, 0.0085, 0.03, seg(13), 4);
      const pos = bullet.attributes.position;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.01) pos.setY(i, pos.getY(i) - pos.getZ(i) * 0.9 - 0.004);
      bullet.computeVertexNormals();
      g.add(mesh(bullet, plastic(spec.color, 0.35), 0, 0.072, 0));
      w = 0.035;
      h = 0.095;
      break;
    }
    case "gloss": {
      g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.075, seg(13)), plastic(spec.color, 0.1), 0, 0.0375, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.055, seg(13)), plastic(BRAND.ink, 0.15), 0, 0.1025, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.0121, 0.0121, 0.008, seg(13)), metal(BRAND.gold), 0, 0.078, 0));
      w = 0.032;
      h = 0.13;
      break;
    }
    case "palette": {
      const top = texMat(`pal:${p.id}`, () => paletteTopTexture({ color: spec.color, accent, seed }), 0.5);
      const side = plastic(spec.color, 0.25);
      const box = mesh(new THREE.BoxGeometry(0.15, 0.1, 0.014), [side, side, side, side, top, side], 0, 0.055, 0);
      box.rotation.x = -0.22;
      g.add(box);
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.05), plastic("#ffffff", 0.2), 0, 0.006, -0.01));
      w = 0.17;
      h = 0.11;
      break;
    }
    case "foundation": {
      const glass = mat(`glass:${spec.color}`, () => new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.08, metalness: 0.1 }));
      g.add(mesh(new THREE.BoxGeometry(0.045, 0.075, 0.03), glass, 0, 0.0375, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.035, seg(13)), plastic(BRAND.ink, 0.15), 0, 0.0925, 0));
      w = 0.06;
      h = 0.11;
      break;
    }
    case "compact": {
      const lid = mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.014, seg(22)), plastic(spec.color, 0.2), 0, 0.045, 0);
      lid.rotation.x = Math.PI / 2 - 0.25;
      g.add(lid);
      const pan = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, seg(22)), plastic(accent, 0.45), 0, 0.046, 0.0075);
      pan.rotation.x = Math.PI / 2 - 0.25;
      g.add(pan);
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.01, 0.04), plastic("#ffffff", 0.2), 0, 0.005, -0.012));
      w = 0.09;
      h = 0.09;
      break;
    }
    case "lashes": {
      const art = texMat(`box:${p.id}`, () => boxArtTexture(f, { brand: p.brand, name: p.short, color: spec.color, accent, icon: "lashes" }));
      const side = plastic(spec.color, 0.3);
      g.add(mesh(new THREE.BoxGeometry(0.075, 0.095, 0.016), [side, side, side, side, art, side], 0, 0.0475, 0));
      w = 0.085;
      h = 0.1;
      break;
    }
    case "polish": {
      const bottle = new THREE.BoxGeometry(0.032, 0.036, 0.024, 2, 2, 2);
      g.add(mesh(bottle, mat(`pol:${spec.color}`, () => new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.06, metalness: 0.15 })), 0, 0.018, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.045, 16), plastic(BRAND.ink, 0.15), 0, 0.058, 0));
      w = 0.04;
      h = 0.085;
      break;
    }
  }
  // Cosmetics are tiny; show them at display scale so they read from the aisle.
  g.scale.setScalar(1.6);
  return { group: g, w: w * 1.6, h: h * 1.6, d: 0.08, mount: "shelf", facings: spec.shape === "palette" ? 2 : 3 };
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

function combTexture(color: string) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 512);
  ctx.fillStyle = color;
  ctx.fillRect(40, 0, 22, 500);
  for (let y = 6; y < 300; y += 10) ctx.fillRect(62, y, 54, 5);
  ctx.beginPath();
  ctx.moveTo(40, 300);
  ctx.lineTo(62, 300);
  ctx.lineTo(54, 510);
  ctx.lineTo(48, 510);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildTool(p: TourProduct, spec: Extract<ModelSpec, { kind: "tool" }>, f: Fonts): BuiltModel {
  const g = new THREE.Group();
  const accent = spec.accent ?? BRAND.orchid;
  const boxed = (bw: number, bh: number, bd: number, icon: string): BuiltModel => {
    const art = texMat(`box:${p.id}`, () => boxArtTexture(f, { brand: p.brand, name: p.short, color: spec.color, accent, icon }));
    const side = plastic(shade(spec.color, -0.08), 0.5);
    const topM = plastic(accent, 0.5);
    g.add(mesh(new THREE.BoxGeometry(bw, bh, bd), [side, side, topM, side, art, side], 0, bh / 2, 0));
    return { group: g, w: bw + 0.02, h: bh, d: bd, mount: "shelf", facings: 2 };
  };
  switch (spec.shape) {
    case "flatiron":
      return boxed(0.1, 0.32, 0.07, "flatiron");
    case "dryer":
      return boxed(0.22, 0.27, 0.11, "dryer");
    case "wand":
      return boxed(0.09, 0.32, 0.07, "wand");
    case "mirror":
      return boxed(0.21, 0.25, 0.08, "mirror");
    case "paddle": {
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.15, 0.014), plastic(spec.color, 0.3), 0, -0.085, 0.01));
      const head = new THREE.CapsuleGeometry(0.038, 0.05, 4, seg(14));
      head.scale(1, 1, 0.22);
      g.add(mesh(head, plastic(spec.color, 0.3), 0, -0.22, 0.012));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.1, 0.01), plastic(accent, 0.9), 0, -0.22, 0.022));
      g.add(mesh(new THREE.TorusGeometry(0.007, 0.002, 6, 16), metal("#cfc8d8"), 0, -0.016, 0.01));
      return { group: g, w: 0.1, h: 0.28, d: 0.04, mount: "hang", facings: 1 };
    }
    case "comb": {
      const card = texMat(`card:${p.id}`, () => headerCardTexture(f, { brand: p.brand, name: p.short, color: BRAND.iris }));
      const back = plastic("#ffffff", 0.6);
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.065, 0.004), [back, back, back, back, card, back], 0, -0.036, 0.006));
      const cm = mat(`comb:${spec.color}`, () => new THREE.MeshStandardMaterial({ map: combTexture(spec.color), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.35 }));
      [-0.026, 0, 0.026].forEach((x, i) => {
        const m = mesh(new THREE.PlaneGeometry(0.035, 0.19), i === 1 ? cm : mat(`comb:${BRAND.ink}`, () => new THREE.MeshStandardMaterial({ map: combTexture(BRAND.ink), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.35 })), x, -0.17, 0.012 + i * 0.002);
        g.add(m);
      });
      g.add(mesh(new THREE.BoxGeometry(0.105, 0.24, 0.024), clearPlastic(), 0, -0.135, 0.012));
      return { group: g, w: 0.12, h: 0.26, d: 0.03, mount: "hang", facings: 1 };
    }
    case "bonnet": {
      const card = texMat(`card:${p.id}`, () => headerCardTexture(f, { brand: p.brand, name: p.short, color: BRAND.ink, swatch: spec.color }));
      const back = plastic("#ffffff", 0.6);
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.07, 0.004), [back, back, back, back, card, back], 0, -0.038, 0.006));
      const satin = mat(`satin:${spec.color}`, () =>
        new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: 0.3, sheen: 1, sheenRoughness: 0.2, sheenColor: new THREE.Color(shade(spec.color, 0.3)), side: THREE.DoubleSide }),
      );
      const dome = new THREE.SphereGeometry(0.09, seg(22), 20, 0, Math.PI * 2, 0, Math.PI / 2);
      const pos = dome.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const th = Math.atan2(pos.getX(i), pos.getZ(i));
        const k = 1 + 0.03 * Math.sin(th * 14) * (1 - pos.getY(i) / 0.09);
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k);
      }
      dome.computeVertexNormals();
      dome.rotateX(Math.PI / 2);
      dome.scale(1, 1, 0.45);
      g.add(mesh(dome, satin, 0, -0.18, 0.012));
      const band = new THREE.TorusGeometry(0.09, 0.008, 6, seg(24));
      band.scale(1, 1, 0.5);
      g.add(mesh(band, plastic(accent, 0.4), 0, -0.18, 0.012));
      return { group: g, w: 0.2, h: 0.28, d: 0.06, mount: "hang", facings: 1 };
    }
    case "brushset": {
      const art = texMat(`card:${p.id}`, () => headerCardTexture(f, { brand: p.brand, name: p.short, color: spec.color }));
      const back = plastic("#ffffff", 0.6);
      g.add(mesh(new THREE.BoxGeometry(0.11, 0.07, 0.004), [back, back, back, back, art, back], 0, -0.038, 0.006));
      g.add(mesh(new THREE.BoxGeometry(0.11, 0.17, 0.004), plastic(shade(spec.color, 0.45), 0.6), 0, -0.16, 0.004));
      g.add(mesh(new THREE.BoxGeometry(0.014, 0.15, 0.01), plastic(spec.color, 0.3), -0.025, -0.16, 0.012));
      g.add(mesh(new THREE.BoxGeometry(0.018, 0.035, 0.014), plastic(BRAND.ink, 0.9), -0.025, -0.1, 0.018));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.012), plastic(accent, 0.35), 0.025, -0.16, 0.012));
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.25, 0.03), clearPlastic(), 0, -0.13, 0.014));
      return { group: g, w: 0.13, h: 0.26, d: 0.04, mount: "hang", facings: 1 };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Real store photos on display                                        */
/* ------------------------------------------------------------------ */

function photoTexture(img: HTMLImageElement) {
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Plaque under a photo: "IN STORE" / name / price. */
function plaqueTexture(f: Fonts, p: TourProduct) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = BRAND.ink;
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = BRAND.orchid;
  ctx.fillRect(0, 0, 512, 8);
  ctx.fillStyle = "#d8ccff";
  ctx.font = `800 24px ${f.sans}`;
  ctx.fillText("FROM OUR GARNER STORE", 28, 50);
  ctx.fillStyle = "#ffffff";
  let size = 40;
  ctx.font = `600 ${size}px ${f.display}`;
  while (ctx.measureText(p.short).width > 300 && size > 20) ctx.font = `600 ${--size}px ${f.display}`;
  ctx.fillText(p.short, 28, 112);
  ctx.textAlign = "right";
  ctx.fillStyle = "#f0d4ff";
  ctx.font = `600 ${p.priceCents == null ? 26 : 44}px ${f.display}`;
  ctx.fillText(p.priceCents == null ? "Ask in store" : `$${(p.priceCents / 100).toFixed(2)}`, 488, 112);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildPhoto(p: TourProduct, f: Fonts, photos: Map<string, HTMLImageElement>, hang: boolean): BuiltModel {
  const g = new THREE.Group();
  const img = p.photos?.[0] ? photos.get(p.photos[0]) : undefined;
  const photoMat = img
    ? mat(`photo:${p.id}`, () => new THREE.MeshStandardMaterial({ map: photoTexture(img), roughness: 0.55 }))
    : plastic(BRAND.mist, 0.6);
  const plaque = texMat(`plaque:${p.id}`, () => plaqueTexture(f, p), 0.5);
  const frame = plastic(BRAND.ink, 0.35);
  const white = plastic("#ffffff", 0.4);
  if (hang) {
    // pegboard card: header with hang hole, photo, price plaque
    const w = 0.22;
    const ph = (w - 0.02) * (4 / 3);
    const h = 0.05 + ph + 0.06;
    g.add(mesh(new THREE.BoxGeometry(w, h, 0.006), white, 0, -h / 2, 0.006));
    g.add(mesh(new THREE.TorusGeometry(0.009, 0.003, 6, 14), metal("#cfc8d8"), 0, -0.018, 0.01));
    g.add(mesh(new THREE.PlaneGeometry(w - 0.02, ph), photoMat, 0, -0.05 - ph / 2, 0.0105));
    g.add(mesh(new THREE.PlaneGeometry(w - 0.02, 0.05), plaque, 0, -h + 0.033, 0.0105));
    return { group: g, w: w + 0.02, h, d: 0.03, mount: "hang", facings: 1 };
  }
  // acrylic shelf display: framed 3:4 photo leaning back slightly on a stand, plaque in front
  const pw = 0.27;
  const ph = pw * (4 / 3);
  const tilt = -0.1;
  const panel = new THREE.Group();
  panel.add(mesh(new THREE.BoxGeometry(pw + 0.03, ph + 0.03, 0.018), frame, 0, 0, 0));
  panel.add(mesh(new THREE.PlaneGeometry(pw, ph), photoMat, 0, 0, 0.0095));
  panel.position.set(0, 0.035 + (ph + 0.03) / 2, -0.01);
  panel.rotation.x = tilt;
  g.add(panel);
  g.add(mesh(new THREE.BoxGeometry(pw + 0.05, 0.03, 0.12), frame, 0, 0.015, 0));
  const pl = mesh(new THREE.PlaneGeometry(pw + 0.04, 0.0125 * 10), plaque, 0, 0.0, 0);
  pl.scale.set(1, 0.36, 1);
  pl.position.set(0, 0.03, 0.061);
  pl.rotation.x = -0.35;
  g.add(pl);
  return { group: g, w: 0.36, h: ph + 0.07, d: 0.14, mount: "shelf", facings: 1 };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function buildProductModel(p: TourProduct, f: Fonts, level = 1, photos: Map<string, HTMLImageElement> = new Map()): BuiltModel {
  detail = level;
  const seed = hashString(p.id) % 997;
  const s = p.model;
  switch (s.kind) {
    case "wig":
      return buildWig(s, seed);
    case "bundle":
      return buildBundle(p, s, f, seed);
    case "braid":
      return buildBraid(p, s, f, seed);
    case "bottle":
      return buildBottle(p, s, f);
    case "cosmetic":
      return buildCosmetic(p, s, f, seed);
    case "tool":
      return buildTool(p, s, f);
    case "photo":
      return buildPhoto(p, f, photos, p.section === "braiding" || p.section === "bundles");
  }
}
