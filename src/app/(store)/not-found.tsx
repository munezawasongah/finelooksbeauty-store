import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-x py-24 text-center">
      <title>Page not found | Fine Looks Hair &amp; Beauty</title>
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-5xl font-light sm:text-6xl">
        This page has <em className="accent">moved on.</em>
      </h1>
      <p className="mx-auto mt-4 max-w-md text-ink-soft">The page or product you&apos;re looking for isn&apos;t here any more.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/shop" className="btn btn-primary">
          Shop all products
        </Link>
        <Link href="/" className="btn btn-outline">
          Go home
        </Link>
      </div>
    </div>
  );
}
