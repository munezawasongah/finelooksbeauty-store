/**
 * Canvas-drawn textures for the 3D store: floor tiles, signage, packaging labels,
 * shelf price strips and box art. Everything is generated in the browser, so the
 * tour needs no image downloads apart from the brand emblem.
 */
import * as THREE from "three";

export const BRAND = {
  iris: "#5238de",
  irisDeep: "#3a22b8",
  orchid: "#b84af6",
  ink: "#1e1433",
  mist: "#f6f2fd",
  cream: "#fbf9ff",
  line: "#e8e1f6",
  gold: "#d9b26f",
};

export type Fonts = { display: string; sans: string; script: string };

export function resolveFonts(): Fonts {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => {
    const raw = css.getPropertyValue(name).trim();
    return raw ? `${raw}, ${fallback}` : fallback;
  };
  return {
    display: v("--font-fraunces", "Georgia, serif"),
    sans: v("--font-manrope", "system-ui, sans-serif"),
    script: v("--font-dancing", "cursive"),
  };
}

export async function loadFonts(f: Fonts) {
  try {
    await Promise.all([
      document.fonts.load(`600 40px ${f.display}`),
      document.fonts.load(`italic 400 40px ${f.display}`),
      document.fonts.load(`700 40px ${f.sans}`),
      document.fonts.load(`600 40px ${f.script}`),
    ]);
  } catch {
    /* fall back to system fonts */
  }
}

let maxAniso = 4;
export function setMaxAnisotropy(n: number) {
  maxAniso = Math.min(8, n);
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.needsUpdate = true;
  return t;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, maxW: number, start: number, min = 10) {
  let size = start;
  ctx.font = font(size);
  while (ctx.measureText(text).width > maxW && size > min) {
    size -= 1;
    ctx.font = font(size);
  }
  return size;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s+\S*$/, "") + "…";
    return kept;
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function floorTexture(tiles: number) {
  const size = 1024;
  const { c, ctx } = canvas(size, size);
  const r = rng(7);
  const n = 4;
  const step = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const tone = 222 - Math.floor(r() * 9);
      ctx.fillStyle = `rgb(${tone + 4},${tone},${tone - 4})`;
      ctx.fillRect(x * step, y * step, step, step);
      // soft marble veins
      ctx.strokeStyle = `rgba(150,138,160,${0.1 + r() * 0.1})`;
      ctx.lineWidth = 1 + r() * 2;
      for (let v = 0; v < 3; v++) {
        ctx.beginPath();
        let px = x * step + r() * step;
        let py = y * step;
        ctx.moveTo(px, py);
        for (let k = 0; k < 6; k++) {
          px += (r() - 0.5) * step * 0.35;
          py += step / 6;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = "rgba(120,110,130,0.6)";
  ctx.lineWidth = 4;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  return toTexture(c, { repeat: [tiles / n, tiles / n] });
}

export function featureWallTexture(f: Fonts, emblem: HTMLImageElement | null) {
  const { c, ctx } = canvas(2048, 512);
  const g = ctx.createLinearGradient(0, 0, 2048, 512);
  g.addColorStop(0, BRAND.irisDeep);
  g.addColorStop(0.55, BRAND.iris);
  g.addColorStop(1, BRAND.orchid);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2048, 512);
  // diagonal satin sheen
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.025 + (i % 3) * 0.01})`;
    ctx.beginPath();
    const x = i * 260 - 200;
    ctx.moveTo(x, 512);
    ctx.lineTo(x + 140, 0);
    ctx.lineTo(x + 220, 0);
    ctx.lineTo(x + 80, 512);
    ctx.fill();
  }
  if (emblem) {
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 6; i++) ctx.drawImage(emblem, 120 + i * 330, 156, 200, 200);
    ctx.globalAlpha = 1;
  }
  void f;
  return toTexture(c);
}

/* ------------------------------------------------------------------ */
/* Signage                                                             */
/* ------------------------------------------------------------------ */

/** Fascia sign: eyebrow, then a big serif title with the last word in italic. Height is always 256px; width follows the sign's proportions. */
export function fasciaTexture(f: Fonts, eyebrow: string, title: string, emblem: HTMLImageElement | null, aspect = 8) {
  const h = 256;
  const w = Math.min(4096, Math.max(512, Math.round(h * aspect)));
  const { c, ctx } = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, BRAND.ink);
  g.addColorStop(1, "#2b1d4a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = BRAND.orchid;
  ctx.fillRect(0, h - 10, w, 10);
  let x = 60;
  if (emblem) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + 74, h / 2 - 4, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(emblem, x + 18, h / 2 - 60, 112, 112);
    x += 190;
  }
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#c9b6ff";
  ctx.font = `700 30px ${f.sans}`;
  ctx.fillText(eyebrow.toUpperCase().split("").join(String.fromCharCode(8202)), x, 84);
  const words = title.split(" ");
  const last = words.pop()!;
  const first = words.join(" ");
  const size = fitText(ctx, title, (s) => `400 ${s}px ${f.display}`, w - x - 50, 112, 36);
  ctx.font = `400 ${size}px ${f.display}`;
  ctx.fillStyle = "#ffffff";
  const fw = first ? ctx.measureText(first + " ").width : 0;
  if (first) ctx.fillText(first + " ", x, 196);
  ctx.font = `italic 400 ${size}px ${f.display}`;
  ctx.fillStyle = "#e3b9ff";
  ctx.fillText(last, x + fw, 196);
  return toTexture(c);
}

/** Double-sided hanging aisle sign. */
export function aisleSignTexture(f: Fonts, number: string, lines: [string, string]) {
  const w = 1024;
  const h = 384;
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = BRAND.iris;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = BRAND.orchid;
  ctx.fillRect(0, h - 16, w, 16);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(150, h / 2 - 6, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BRAND.iris;
  ctx.font = `600 120px ${f.display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(number, 150, h / 2 + 2);
  ctx.textAlign = "left";
  ctx.fillStyle = "#d8ccff";
  ctx.font = `700 30px ${f.sans}`;
  ctx.fillText("AISLE", 290, 92);
  ctx.fillStyle = "#fff";
  const size = fitText(ctx, lines[0], (s) => `400 ${s}px ${f.display}`, w - 330, 84, 36);
  ctx.font = `400 ${size}px ${f.display}`;
  ctx.fillText(lines[0], 290, 178);
  ctx.font = `italic 400 ${size}px ${f.display}`;
  ctx.fillStyle = "#f0d4ff";
  ctx.fillText(lines[1], 290, 272);
  return toTexture(c);
}

export function scriptSignTexture(f: Fonts, text: string, sub: string, emblem: HTMLImageElement | null) {
  const w = 2048;
  const h = 640;
  const { c, ctx } = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  if (emblem) ctx.drawImage(emblem, w / 2 - 150, 0, 300, 300);
  ctx.textAlign = "center";
  ctx.fillStyle = BRAND.iris;
  ctx.font = `600 230px ${f.script}`;
  ctx.fillText(text, w / 2, 470);
  ctx.fillStyle = BRAND.ink;
  ctx.font = `700 52px ${f.sans}`;
  ctx.fillText(sub.toUpperCase().split("").join(" "), w / 2, 600);
  return toTexture(c);
}

/** Gondola end cap: brand emblem, the aisles and the two sections, stacked. */
export function endCapTexture(f: Fonts, eyebrow: string, top: string, bottom: string, emblem: HTMLImageElement | null) {
  const w = 512;
  const h = 1024;
  const { c, ctx } = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, BRAND.irisDeep);
  g.addColorStop(0.6, BRAND.iris);
  g.addColorStop(1, BRAND.orchid);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 18;
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(w * 0.85, h * 0.85, 120 + i * 90, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(w / 2, 180, 110, 0, Math.PI * 2);
  ctx.fill();
  if (emblem) ctx.drawImage(emblem, w / 2 - 82, 98, 164, 164);
  ctx.textAlign = "center";
  ctx.fillStyle = "#d8ccff";
  ctx.font = `700 30px ${f.sans}`;
  ctx.fillText(eyebrow.toUpperCase().split("").join(String.fromCharCode(8202)), w / 2, 360);
  ctx.fillStyle = "#fff";
  const size = Math.min(fitText(ctx, top, (s) => `400 ${s}px ${f.display}`, w - 70, 80, 30), fitText(ctx, bottom, (s) => `400 ${s}px ${f.display}`, w - 70, 80, 30));
  ctx.font = `400 ${size}px ${f.display}`;
  ctx.fillText(top, w / 2, 480);
  ctx.font = `italic 400 ${Math.round(size * 0.6)}px ${f.display}`;
  ctx.fillStyle = "#f0d4ff";
  ctx.fillText("&", w / 2, 560);
  ctx.font = `400 ${size}px ${f.display}`;
  ctx.fillStyle = "#fff";
  ctx.fillText(bottom, w / 2, 650);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(w / 2 - 60, 720, 120, 3);
  ctx.font = `600 70px ${f.script}`;
  ctx.fillStyle = "#fff";
  ctx.fillText("Fine Looks", w / 2, h - 120);
  ctx.font = `700 22px ${f.sans}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("H A I R   &   B E A U T Y", w / 2, h - 70);
  return toTexture(c);
}

export function doorVinylTexture(f: Fonts) {
  const { c, ctx } = canvas(1024, 512);
  ctx.clearRect(0, 0, 1024, 512);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `600 120px ${f.script}`;
  ctx.fillText("Fine Looks", 512, 230);
  ctx.font = `700 34px ${f.sans}`;
  ctx.fillText("H A I R   &   B E A U T Y", 512, 300);
  ctx.font = `600 28px ${f.sans}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("From one sister to another", 512, 360);
  return toTexture(c);
}

export function floorDecalTexture(f: Fonts, emblem: HTMLImageElement | null) {
  const { c, ctx } = canvas(1024, 1024);
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.strokeStyle = "rgba(82,56,222,0.55)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(512, 512, 490, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(184,74,246,0.4)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(512, 512, 455, 0, Math.PI * 2);
  ctx.stroke();
  if (emblem) {
    ctx.globalAlpha = 0.85;
    ctx.drawImage(emblem, 312, 210, 400, 400);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(82,56,222,0.85)";
  ctx.font = `600 96px ${f.script}`;
  ctx.fillText("Welcome, sister", 512, 760);
  return toTexture(c);
}

export function counterFrontTexture(f: Fonts) {
  const { c, ctx } = canvas(1024, 256);
  const g = ctx.createLinearGradient(0, 0, 1024, 256);
  g.addColorStop(0, BRAND.ink);
  g.addColorStop(1, "#2f2152");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = "rgba(184,74,246,0.6)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 44, 0);
    ctx.lineTo(i * 44, 256);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = `600 84px ${f.script}`;
  ctx.fillText("Fine Looks", 512, 140);
  ctx.font = `700 26px ${f.sans}`;
  ctx.fillStyle = "#d8ccff";
  ctx.fillText("CHECKOUT  ·  IN-STORE PICKUP", 512, 200);
  return toTexture(c);
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

/** Wrap-around or front label for bottles and jars. */
export function labelTexture(f: Fonts, o: { brand: string; name: string; bg: string; ink: string; accent: string; wrap?: boolean }) {
  const w = o.wrap ? 1024 : 512;
  const h = 512;
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, w, h);
  const cx = o.wrap ? w * 0.5 : w / 2;
  const cw = o.wrap ? w * 0.44 : w * 0.86;
  ctx.fillStyle = o.accent;
  ctx.fillRect(cx - cw / 2, 52, cw, 8);
  ctx.textAlign = "center";
  ctx.fillStyle = o.ink;
  ctx.font = `700 34px ${f.sans}`;
  fitText(ctx, o.brand.toUpperCase(), (s) => `700 ${s}px ${f.sans}`, cw, 34, 14);
  ctx.fillText(o.brand.toUpperCase(), cx, 116);
  const size = 72;
  ctx.font = `600 ${size}px ${f.display}`;
  const lines = wrapLines(ctx, o.name, cw, 3);
  const lh = size * 1.05;
  const top = 250 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => {
    fitText(ctx, l, (s) => `600 ${s}px ${f.display}`, cw, size, 28);
    ctx.fillText(l, cx, top + i * lh);
  });
  ctx.fillStyle = o.accent;
  ctx.fillRect(cx - cw / 2, h - 96, cw, 4);
  ctx.font = `600 30px ${f.sans}`;
  ctx.fillStyle = o.ink;
  ctx.globalAlpha = 0.75;
  ctx.fillText("Professional formula", cx, h - 46);
  ctx.globalAlpha = 1;
  return toTexture(c);
}

/** Header card for hanging packs (bundles, braiding hair, tools on pegs). */
export function headerCardTexture(f: Fonts, o: { brand: string; name: string; color: string; swatch?: string; swatch2?: string }) {
  const w = 512;
  const h = 320;
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, o.color);
  g.addColorStop(1, BRAND.orchid);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 120);
  // hang hole
  ctx.fillStyle = "#cfc6e6";
  ctx.beginPath();
  ctx.ellipse(w / 2, 34, 40, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = `700 30px ${f.sans}`;
  ctx.fillText(o.brand.toUpperCase(), w / 2, 98);
  ctx.fillStyle = BRAND.ink;
  ctx.font = `600 58px ${f.display}`;
  const lines = wrapLines(ctx, o.name, w - 60, 2);
  lines.forEach((l, i) => {
    fitText(ctx, l, (s) => `600 ${s}px ${f.display}`, w - 60, 58, 26);
    ctx.fillText(l, w / 2, 185 + i * 60);
  });
  if (o.swatch) {
    const sw = ctx.createLinearGradient(40, 0, w - 40, 0);
    sw.addColorStop(0, o.swatch);
    sw.addColorStop(1, o.swatch2 ?? o.swatch);
    ctx.fillStyle = sw;
    ctx.fillRect(40, h - 34, w - 80, 18);
  }
  return toTexture(c);
}

/** Box art for boxed tools and cosmetics. */
export function boxArtTexture(f: Fonts, o: { brand: string; name: string; color: string; accent: string; icon: string }) {
  const w = 512;
  const h = 640;
  const { c, ctx } = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, o.color);
  g.addColorStop(1, shade(o.color, -0.25));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.2, 260, 0, Math.PI * 2);
  ctx.fill();
  const light = luminance(o.color) > 0.6;
  ctx.fillStyle = light ? BRAND.ink : "#fff";
  ctx.textAlign = "center";
  ctx.font = `700 30px ${f.sans}`;
  ctx.fillText(o.brand.toUpperCase(), w / 2, 70);
  drawIcon(ctx, o.icon, w / 2, 300, 300, light ? BRAND.ink : "#fff", o.accent);
  ctx.font = `600 54px ${f.display}`;
  const lines = wrapLines(ctx, o.name, w - 60, 2);
  lines.forEach((l, i) => {
    fitText(ctx, l, (s) => `600 ${s}px ${f.display}`, w - 60, 54, 24);
    ctx.fillStyle = light ? BRAND.ink : "#fff";
    ctx.fillText(l, w / 2, 520 + i * 58);
  });
  ctx.fillStyle = o.accent;
  ctx.fillRect(0, h - 14, w, 14);
  return toTexture(c);
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: string, cx: number, cy: number, s: number, ink: string, accent: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ink;
  ctx.fillStyle = accent;
  ctx.lineWidth = s * 0.035;
  switch (icon) {
    case "flatiron":
      ctx.rotate(-0.5);
      roundRect(ctx, -s * 0.07, -s * 0.42, s * 0.14, s * 0.84, s * 0.05);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, s * 0.0, -s * 0.42, s * 0.14, s * 0.84, s * 0.05);
      ctx.stroke();
      break;
    case "dryer":
      ctx.beginPath();
      ctx.arc(-s * 0.08, -s * 0.1, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, s * 0.08, -s * 0.2, s * 0.32, s * 0.2, s * 0.04);
      ctx.stroke();
      roundRect(ctx, -s * 0.16, s * 0.08, s * 0.14, s * 0.34, s * 0.05);
      ctx.stroke();
      break;
    case "wand":
      ctx.rotate(-0.6);
      roundRect(ctx, -s * 0.05, -s * 0.45, s * 0.1, s * 0.55, s * 0.05);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, -s * 0.07, s * 0.1, s * 0.14, s * 0.32, s * 0.05);
      ctx.stroke();
      break;
    case "mirror":
      ctx.beginPath();
      ctx.arc(0, -s * 0.08, s * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, s * 0.18);
      ctx.lineTo(0, s * 0.36);
      ctx.moveTo(-s * 0.16, s * 0.38);
      ctx.lineTo(s * 0.16, s * 0.38);
      ctx.stroke();
      break;
    case "palette":
      roundRect(ctx, -s * 0.38, -s * 0.28, s * 0.76, s * 0.56, s * 0.05);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(-s * 0.27 + (i % 4) * s * 0.18, -s * 0.1 + Math.floor(i / 4) * s * 0.2, s * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "lashes":
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.34, s * 0.14, 0, Math.PI, 0);
      ctx.stroke();
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI + (i / 14) * Math.PI;
        const x = Math.cos(a) * s * 0.34;
        const y = Math.sin(a) * s * 0.14;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x * 1.18, y * 1.18 - s * 0.12);
        ctx.stroke();
      }
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function paletteTopTexture(o: { color: string; accent: string; seed: number }) {
  const { c, ctx } = canvas(512, 384);
  ctx.fillStyle = o.color;
  ctx.fillRect(0, 0, 512, 384);
  const r = rng(o.seed);
  const base = new THREE.Color(o.accent);
  for (let i = 0; i < 12; i++) {
    const col = base.clone().offsetHSL((r() - 0.5) * 0.12, (r() - 0.5) * 0.3, (r() - 0.5) * 0.35);
    ctx.fillStyle = `#${col.getHexString()}`;
    const x = 56 + (i % 4) * 133;
    const y = 80 + Math.floor(i / 4) * 112;
    ctx.beginPath();
    ctx.roundRect(x - 50, y - 40, 100, 80, 14);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x - 40, y - 32, 60, 10);
  }
  return toTexture(c);
}

/** Shelf-edge price strip: name + big price. */
export function priceTagTexture(f: Fonts, name: string, price: string, badge?: string) {
  const w = 512;
  const h = 160;
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = badge ? BRAND.orchid : BRAND.iris;
  ctx.fillRect(0, 0, 14, h);
  ctx.fillStyle = BRAND.ink;
  ctx.textAlign = "left";
  fitText(ctx, name, (s) => `700 ${s}px ${f.sans}`, 250, 34, 16);
  ctx.fillText(name, 34, 64);
  if (badge) {
    ctx.fillStyle = BRAND.orchid;
    ctx.font = `800 24px ${f.sans}`;
    ctx.fillText(badge.toUpperCase(), 34, 118);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = BRAND.iris;
  const size = fitText(ctx, price, (s) => `600 ${s}px ${f.display}`, 200, 76, 30);
  ctx.font = `600 ${size}px ${f.display}`;
  ctx.fillText(price, w - 22, 108);
  return toTexture(c);
}

/* ------------------------------------------------------------------ */
/* Colour helpers                                                      */
/* ------------------------------------------------------------------ */

export function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

export function luminance(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
