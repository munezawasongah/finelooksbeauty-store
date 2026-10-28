"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Small turntable view of one product, sharing geometry with the main store. */
export function ProductPreview({ make, reducedMotion }: { make: () => THREE.Group | null; reducedMotion: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const group = make();
    if (!group) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.7;
    scene.add(new THREE.HemisphereLight("#ffffff", "#e6dcf5", 1.2));
    const key = new THREE.DirectionalLight("#fff4ea", 1.6);
    key.position.set(1.5, 2.5, 2.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#d9b8ff", 0.9);
    rim.position.set(-2, 1, -2);
    scene.add(rim);

    const pivot = new THREE.Group();
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);
    pivot.add(group);
    scene.add(pivot);

    // soft floor disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(size.x, size.z) * 0.9, 48),
      new THREE.MeshBasicMaterial({ color: "#b84af6", transparent: true, opacity: 0.08 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -size.y / 2 - 0.002;
    scene.add(disc);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
    // fit the whole product (any rotation) inside the view with a little breathing room
    const radius = Math.hypot(size.x, size.y, size.z) * 0.5;
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(30) / 2)) * 1.08;
    camera.position.set(0, radius * 0.18, dist);
    camera.lookAt(0, 0, 0);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
      camera.aspect = r.width / Math.max(1, r.height);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let dragging = false;
    let lastX = 0;
    let vel = reducedMotion ? 0 : 0.5;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      pivot.rotation.y += dx * 0.012;
      vel = dx * 0.6;
    };
    const up = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    let last = performance.now();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!dragging) {
        const target = reducedMotion ? 0 : 0.5;
        vel += (target - vel) * Math.min(1, dt * 2);
        pivot.rotation.y += vel * dt;
      }
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      disc.geometry.dispose();
      (disc.material as THREE.Material).dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      // free the WebGL context straight away; browsers cap how many can be open
      renderer.forceContextLoss();
    };
  }, [make, reducedMotion]);

  return <canvas ref={ref} className="block h-full w-full cursor-grab touch-none active:cursor-grabbing" aria-hidden />;
}
