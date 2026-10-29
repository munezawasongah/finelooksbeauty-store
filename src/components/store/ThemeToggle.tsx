"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_KEY } from "@/lib/theme";

function isDark() {
  return document.documentElement.classList.contains("dark");
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function apply(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#120d1f" : "#5238de");
}

/**
 * Light / dark mode switch. The icons are swapped by CSS (`.dark .theme-icon-*`), so the right
 * one shows from the first paint without waiting for React; the label and pressed state follow
 * once hydrated. Until the visitor picks a mode, the site follows their device setting.
 */
export function ThemeToggle({ className = "", withLabel = false, tabIndex }: { className?: string; withLabel?: boolean; tabIndex?: number }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  // follow the device setting live, but only while the visitor hasn't chosen
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(THEME_KEY);
      } catch {}
      if (!saved) apply(mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next = !isDark();
    apply(next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {}
  };

  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" onClick={toggle} tabIndex={tabIndex} aria-pressed={withLabel ? undefined : dark} aria-label={withLabel ? undefined : "Dark mode"} title={label} className={className}>
      <Moon size={withLabel ? 16 : 20} className="theme-icon-moon" aria-hidden />
      <Sun size={withLabel ? 16 : 20} className="theme-icon-sun" aria-hidden />
      {withLabel && (
        <>
          <span className="theme-icon-moon">Dark mode</span>
          <span className="theme-icon-sun">Light mode</span>
        </>
      )}
    </button>
  );
}
