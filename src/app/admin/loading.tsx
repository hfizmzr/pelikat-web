export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-8 font-inter">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#4edea3]/30 animate-pulse" />
          <div className="h-3 w-40 rounded bg-[#353437] animate-pulse" />
        </div>
        <div className="h-8 w-72 rounded-lg bg-[#2a2a2c] animate-pulse" />
        <div className="h-4 w-96 rounded bg-[#201f22] animate-pulse" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-[#1c1b1d] p-5 border border-[#494454]/30 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-2">
                <div className="h-3 w-28 rounded bg-[#353437] animate-pulse" />
                <div className="h-10 w-16 rounded-lg bg-[#2a2a2c] animate-pulse" />
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#353437] animate-pulse" />
            </div>
            <div className="h-8 w-full rounded bg-[#201f22] animate-pulse" />
          </div>
        ))}
      </div>

      {/* System status strip skeleton */}
      <div className="h-12 rounded-xl bg-[#1c1b1d] border border-[#494454]/30 animate-pulse" />

      {/* Tenant table skeleton */}
      <div className="rounded-xl bg-[#1c1b1d] p-5 border border-[#494454]/30 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 rounded bg-[#2a2a2c] animate-pulse" />
          <div className="h-8 w-36 rounded-lg bg-[#353437] animate-pulse" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-[#353437]/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#353437] animate-pulse" />
                <div className="flex flex-col gap-1">
                  <div className="h-3.5 w-36 rounded bg-[#2a2a2c] animate-pulse" />
                  <div className="h-2.5 w-24 rounded bg-[#1c1b1d] animate-pulse" />
                </div>
              </div>
              <div className="h-6 w-16 rounded-full bg-[#353437] animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom grid skeleton */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 rounded-xl bg-[#1c1b1d] p-5 border border-[#494454]/30 space-y-3">
          <div className="h-5 w-36 rounded bg-[#2a2a2c] animate-pulse" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-[#353437]/20">
              <div className="h-3.5 w-48 rounded bg-[#353437] animate-pulse" />
              <div className="h-5 w-16 rounded bg-[#2a2a2c] animate-pulse" />
            </div>
          ))}
        </div>
        <div className="xl:col-span-5 flex flex-col gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-[#1c1b1d] p-5 border border-[#494454]/30 space-y-3 h-36">
              <div className="h-5 w-32 rounded bg-[#2a2a2c] animate-pulse" />
              <div className="h-16 w-full rounded bg-[#201f22] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
