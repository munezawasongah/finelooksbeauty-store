import Image from "next/image";

/**
 * Product imagery. Uses the uploaded photo when there is one; otherwise a
 * branded art panel (never a broken image) until the store uploads photos.
 */
const PALETTES = [
  ["#f5e3fe", "#cfc5f7"],
  ["#e7e2fb", "#f5e3fe"],
  ["#fbf3ff", "#ebc8fd"],
  ["#f3f1fd", "#ab9cf0"],
  ["#ebc8fd", "#e7e2fb"],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function ProductArt({
  src,
  alt,
  title,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",
  priority = false,
  className = "",
}: {
  src: string | null;
  alt: string | null;
  title: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt ?? title}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${className}`}
      />
    );
  }
  const [a, b] = PALETTES[hash(title) % PALETTES.length];
  const initials = title
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <div
      role="img"
      aria-label={alt ?? title}
      className={`absolute inset-0 flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: `radial-gradient(120% 90% at 20% 10%, ${a} 0%, ${b} 70%, #ffffff 140%)` }}
    >
      <div className="absolute -right-10 -bottom-10 h-48 w-48 rounded-full border-[10px] border-white/50" />
      <div className="absolute -left-6 top-6 h-20 w-20 rounded-full bg-white/40 blur-xl" />
      <Image src="/brand/emblem.png" alt="" width={96} height={96} className="relative opacity-25" />
      <span className="absolute bottom-4 left-5 font-display text-4xl italic text-iris-800/40">{initials}</span>
    </div>
  );
}
