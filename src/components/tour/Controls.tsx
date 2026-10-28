"use client";

import { useEffect, useRef, useState } from "react";
import { SECTIONS, type SectionKey } from "./catalog";
import type { TourLayout } from "./engine";

/* ------------------------------------------------------------------ */
/* Pose broadcast (keeps the minimap updating without re-rendering     */
/* the whole tour UI on every step)                                    */
/* ------------------------------------------------------------------ */

export type Pose = { x: number; z: number; yaw: number };

export function createPoseStore() {
  let pose: Pose = { x: 0, z: 12.6, yaw: 0 };
  const subs = new Set<(p: Pose) => void>();
  return {
    set(p: Pose) {
      pose = p;
      subs.forEach((s) => s(p));
    },
    get: () => pose,
    subscribe(fn: (p: Pose) => void) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
export type PoseStore = ReturnType<typeof createPoseStore>;

/* ------------------------------------------------------------------ */
/* Minimap                                                             */
/* ------------------------------------------------------------------ */

const SECTION_FILL: Record<SectionKey, string> = {
  wigs: "#b84af6",
  bundles: "#8a74e8",
  braiding: "#6a52e2",
  haircare: "#5238de",
  cosmetics: "#ca72f8",
  tools: "#432bbd",
  featured: "#dda0fb",
};

export function Minimap({
  layout,
  poses,
  active,
  onTeleport,
  onSection,
}: {
  layout: TourLayout;
  poses: PoseStore;
  active: SectionKey | null;
  onTeleport: (x: number, z: number) => void;
  onSection: (k: SectionKey) => void;
}) {
  const [pose, setPose] = useState(poses.get());
  useEffect(() => poses.subscribe(setPose), [poses]);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = layout.maxX - layout.minX;
  const D = layout.maxZ - layout.minZ;
  const pad = 0.6;

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    onTeleport(p.x, p.y);
  };

  const yawDeg = (-pose.yaw * 180) / Math.PI;
  return (
    <figure className="pointer-events-auto rounded-2xl border border-white/15 bg-ink/75 p-2.5 shadow-2xl backdrop-blur-md">
      <figcaption className="mb-1.5 flex items-center justify-between px-1 text-[0.62rem] font-bold tracking-[0.16em] text-white/60 uppercase">
        <span>Store map</span>
        <span className="text-white/40">tap to walk</span>
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`${layout.minX - pad} ${layout.minZ - pad} ${W + pad * 2} ${D + pad * 2}`}
        className="block h-auto w-[9.5rem] cursor-crosshair sm:w-[11rem]"
        onClick={onClick}
        role="img"
        aria-label="Store floor plan"
      >
        <rect x={layout.minX} y={layout.minZ} width={W} height={D} rx={0.4} fill="#2a1d4a" stroke="#ffffff33" strokeWidth={0.08} />
        {layout.rects.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.z}
            width={r.w}
            height={r.d}
            rx={0.12}
            fill={r.section ? SECTION_FILL[r.section] : r.kind === "door" ? "#9cc4f2" : "#ffffff40"}
            opacity={r.section && active && r.section !== active ? 0.45 : 1}
            onClick={(e) => {
              if (r.section) {
                e.stopPropagation();
                onSection(r.section);
              }
            }}
            className={r.section ? "cursor-pointer" : undefined}
          >
            {r.section && <title>{SECTIONS.find((s) => s.key === r.section)?.name}</title>}
          </rect>
        ))}
        <g transform={`translate(${pose.x} ${pose.z}) rotate(${yawDeg})`}>
          <path d="M0 0 L-1.6 -3.4 A3.8 3.8 0 0 1 1.6 -3.4 Z" fill="#ffffff" opacity={0.22} />
          <circle r={0.55} fill="#ffffff" stroke="#b84af6" strokeWidth={0.22} />
        </g>
      </svg>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Touch joystick                                                      */
/* ------------------------------------------------------------------ */

export function Joystick({ onChange }: { onChange: (forward: number, turn: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const id = useRef<number | null>(null);
  const R = 46;

  const update = (cx: number, cy: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy, active: true });
    const dead = 0.12;
    const f = -dy / R;
    const t = dx / R;
    onChange(Math.abs(f) < dead ? 0 : f, Math.abs(t) < dead ? 0 : t * 0.85);
  };
  const end = () => {
    id.current = null;
    setKnob({ x: 0, y: 0, active: false });
    onChange(0, 0);
  };

  return (
    <div
      ref={base}
      className="pointer-events-auto relative h-[7.5rem] w-[7.5rem] touch-none rounded-full border border-white/25 bg-ink/45 shadow-xl backdrop-blur-md select-none"
      role="application"
      aria-label="Walk: drag up to move forward, left or right to turn"
      onPointerDown={(e) => {
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (id.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="absolute inset-x-0 top-2 text-center text-[0.55rem] font-bold tracking-[0.2em] text-white/60 uppercase">Walk</span>
      <span
        className={`absolute top-1/2 left-1/2 h-14 w-14 rounded-full shadow-lg transition-[background-color] ${knob.active ? "bg-orchid-200" : "bg-white"}`}
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
