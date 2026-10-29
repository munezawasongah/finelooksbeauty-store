/** localStorage key for the visitor's light/dark choice ("light" | "dark"; absent = follow the device). */
export const THEME_KEY = "fl-theme";

/** Runs before the page paints (inlined in <head>) so there is no flash of the wrong mode. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d){document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","#120d1f");}}catch(e){}})();`;
