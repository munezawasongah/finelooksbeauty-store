import Image from "next/image";

export function AuthShell({ title, accent, subtitle, children }: { title: string; accent: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="container-x grid gap-10 py-14 lg:grid-cols-2 lg:items-center lg:py-20">
      <div className="hidden lg:block">
        <div className="relative aspect-square max-w-md overflow-hidden rounded-[2rem] bg-gradient-to-br from-iris-600 to-orchid-500">
          <div className="grain absolute inset-0 opacity-50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex aspect-square w-[60%] items-center justify-center rounded-full bg-white shadow-2xl">
              <Image src="/brand/emblem.png" alt="" width={260} height={260} className="h-[82%] w-[82%]" />
            </div>
          </div>
          <p className="absolute inset-x-0 bottom-8 text-center font-script text-3xl text-white" style={{ fontFamily: "var(--font-script)" }}>
            From One Sister to Another
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-[2.4rem] leading-none font-light sm:text-5xl">
          {title} <em className="accent">{accent}</em>
        </h1>
        {subtitle && <p className="mt-3 text-ink-soft">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
