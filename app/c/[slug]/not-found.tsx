import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-[1200px] px-(--gutter) py-24">
      <h1 className="text-display font-semibold">No competitor here</h1>
      <p className="text-body mt-3 text-copy">It may have been deleted, or the address has a typo.</p>
      <Link href="/" className="text-body mt-5 inline-flex text-accent hover:underline">
        Back to the Overview
      </Link>
    </section>
  );
}
