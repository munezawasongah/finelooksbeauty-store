import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SectionHeading({
  eyebrow,
  title,
  accent,
  after,
  href,
  hrefLabel,
  align = "left",
  id,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  after?: string;
  href?: string;
  hrefLabel?: string;
  align?: "left" | "center";
  id?: string;
}) {
  return (
    <div
      className={`mb-10 flex flex-col gap-5 sm:mb-12 ${
        align === "center" ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between"
      }`}
    >
      <div className={align === "center" ? "max-w-2xl" : "max-w-2xl"}>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h2 id={id} className="text-[2.1rem] leading-[1.05] font-light text-ink sm:text-5xl">
          {title} {accent && <em className="accent">{accent}</em>} {after}
        </h2>
      </div>
      {href && (
        <Link href={href} className="btn btn-outline btn-sm self-start sm:self-auto">
          {hrefLabel ?? "See all"} <ArrowRight size={15} aria-hidden />
        </Link>
      )}
    </div>
  );
}
