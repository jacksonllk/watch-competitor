import { Suspense } from "react";
import { CompetitorView } from "@/app/ui/competitor-view";
import { Shell } from "@/app/ui/shell";
import { isDemo } from "@/lib/links";

export default function Page({ params, searchParams }: PageProps<"/c/[slug]">) {
  return (
    <Shell demo={isDemo()}>
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-[1200px] flex-col md:border-x md:border-rule">
        <Suspense fallback={<Loading />}>
          <CompetitorView params={params} searchParams={searchParams} />
        </Suspense>
        <footer className="text-small mt-auto border-t border-rule px-(--gutter) py-3 text-muted">
          Built with{" "}
          <a href="https://context.dev" className="underline-offset-2 hover:text-ink hover:underline">
            context.dev
          </a>
        </footer>
      </main>
    </Shell>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-4 border-b border-rule px-(--gutter) py-6">
        <div className="ui-skeleton size-12" />
        <div className="flex-1">
          <div className="ui-skeleton h-6 w-48" />
          <div className="ui-skeleton mt-2 h-3.5 w-80" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4 border-b border-rule px-(--gutter) py-4">
          <div className="ui-skeleton h-4 w-20" />
          <div className="ui-skeleton h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}
