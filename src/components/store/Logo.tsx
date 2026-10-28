import Image from "next/image";
import Link from "next/link";

export function Logo({ size = "md", tone = "dark" }: { size?: "sm" | "md" | "lg"; tone?: "dark" | "light" }) {
  const emblem = size === "lg" ? 64 : size === "sm" ? 36 : 46;
  const script = size === "lg" ? "text-4xl" : size === "sm" ? "text-2xl" : "text-[1.9rem]";
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Fine Looks Hair & Beauty, home">
      <Image
        src="/brand/emblem.png"
        alt=""
        width={emblem}
        height={emblem}
        priority
        className="transition-transform duration-500 group-hover:rotate-[-8deg]"
      />
      <span className="flex flex-col leading-none">
        <span
          className={`font-script font-bold ${script} ${tone === "light" ? "text-orchid-200" : "text-orchid-500"}`}
          style={{ fontFamily: "var(--font-script)" }}
        >
          Fine Looks
        </span>
        <span
          className={`mt-0.5 text-[0.6rem] font-bold tracking-[0.32em] uppercase ${
            tone === "light" ? "text-iris-200" : "text-iris-600"
          }`}
        >
          Hair &amp; Beauty
        </span>
      </span>
    </Link>
  );
}
