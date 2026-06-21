import HomeStats from "./_home-stats"

export default function Dashboard() {
  return (
    <div className="h-full flex flex-col gap-8 max-w-5xl">

      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-600 mb-1">Overview</p>
        <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1 text-sm">Real-time IoT monitoring and alert management</p>
      </div>

      {/* Stat cards */}
      <HomeStats />


    </div>
  )
}
