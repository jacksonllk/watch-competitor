import { Suspense } from "react";
import { Overview } from "./ui/overview";
import { isDemo, supportUrl } from "@/lib/links";
import { Shell } from "./ui/shell";

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <Shell demo={isDemo()} supportUrl={supportUrl()}>
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-[1200px] flex-col md:border-x md:border-rule">
        <Suspense fallback={<OverviewSkeleton />}>
          <Overview searchParams={searchParams} />
        </Suspense>
      </main>
    </Shell>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your competitors">
      <div className="flex h-10 items-center gap-6 border-b border-rule bg-panel px-(--gutter)">
        <div className="ui-skeleton h-3 w-24" />
        <div className="ui-skeleton h-3 w-20" />
        <div className="ui-skeleton h-3 w-28" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-rule px-(--gutter) py-4">
          <div className="ui-skeleton h-4 w-28" />
          <div className="ui-skeleton h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}
