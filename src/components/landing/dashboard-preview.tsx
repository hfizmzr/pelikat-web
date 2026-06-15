const BAR_DATA = [
  { height: 40 },
  { height: 65 },
  { height: 45 },
  { height: 80 },
  { height: 60 },
  { height: 90 },
  { height: 100 },
]

export function DashboardPreview() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      {/* Window Chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-4 py-3">
        <div className="size-3 rounded-full bg-[#ff5f56]" />
        <div className="size-3 rounded-full bg-[#ffbd2e]" />
        <div className="size-3 rounded-full bg-[#27c93f]" />
        <span className="ml-4 text-xs text-muted-foreground">
          obsidian_core_dashboard v4.2
        </span>
      </div>

      {/* Dashboard Content */}
      <div className="p-6">
        {/* Chart Header */}
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          REGISTRATION VELOCITY
        </p>

        {/* Bar Chart */}
        <div className="mt-4 flex h-32 items-end gap-3">
          {BAR_DATA.map((bar, index) => (
            <div
              key={index}
              className="flex-1 rounded-t bg-primary transition-all hover:bg-primary/80"
              style={{ height: `${bar.height}%` }}
            />
          ))}
        </div>

        {/* Stats Row */}
        <div className="mt-8 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-muted-foreground">TOTAL REVENUE</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              RM 142.5K
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">RETENTION RATE</p>
            <p className="mt-1 text-2xl font-bold text-foreground">64.2%</p>
          </div>
        </div>
      </div>
    </div>
  )
}
