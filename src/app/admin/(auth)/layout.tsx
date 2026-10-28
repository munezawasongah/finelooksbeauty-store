import Image from "next/image";

export const metadata = { robots: { index: false, follow: false } };

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-4 py-12">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-iris-600/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[26rem] w-[26rem] rounded-full bg-orchid-500/30 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
            <Image src="/brand/emblem.png" alt="" width={40} height={40} />
          </span>
          <span>
            <span className="block text-2xl text-orchid-200" style={{ fontFamily: "var(--font-script)" }}>
              Fine Looks
            </span>
            <span className="block text-[0.6rem] font-bold tracking-[0.3em] text-iris-200 uppercase">Admin dashboard</span>
          </span>
        </div>
        <div className="rounded-[1.5rem] bg-white p-7 shadow-2xl sm:p-9">{children}</div>
      </div>
    </div>
  );
}
