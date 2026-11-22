export interface ResearchResultCardSkeletonProps {
  className?: string;
}

export function ResearchResultCardSkeleton({
  className = '',
}: ResearchResultCardSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`sp-card overflow-hidden flex flex-col animate-pulse motion-reduce:animate-none ${className}`}
    >
      {/* Image placeholder (16:10 mobile, 4:3 desktop) */}
      <div className="aspect-[16/10] sm:aspect-[4/3] w-full bg-zinc-200/80 dark:bg-zinc-800/80" />

      {/* Card Body matching 5 visual rows */}
      <div className="p-3.5 sm:p-5 flex-1 flex flex-col gap-3">
        {/* Row 1: Category + Title + 56px ScoreRing */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-zinc-200/80 dark:bg-zinc-800" />
            <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="w-14 h-14 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
        </div>

        {/* Row 2: VerdictBadge + Confidence % */}
        <div className="flex items-center justify-between gap-2">
          <div className="h-6 w-28 rounded-full bg-zinc-200/90 dark:bg-zinc-800" />
          <div className="h-4 w-10 rounded bg-zinc-200/80 dark:bg-zinc-800" />
        </div>

        {/* Row 3: Key Metrics 2x2 Grid */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/70 grid grid-cols-2 gap-x-3 gap-y-2.5">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="h-3 w-14 rounded bg-zinc-200/75 dark:bg-zinc-800" />
                <div className="w-3.5 h-3.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800" />
              </div>
              <div className="h-5 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ))}
        </div>

        {/* Row 4: Full-width Report button + Deep Dive & Compare 2-col row */}
        <div className="mt-auto pt-3 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2">
          <div className="h-10 rounded-lg bg-zinc-200/80 dark:bg-zinc-800" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200/80 dark:border-zinc-800" />
            <div className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200/80 dark:border-zinc-800" />
          </div>
        </div>

        {/* Row 5: Save / Reject buttons */}
        <div className="grid grid-cols-2 gap-2">
          <div className="h-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200/80 dark:border-zinc-800" />
        </div>
      </div>
    </div>
  );
}
