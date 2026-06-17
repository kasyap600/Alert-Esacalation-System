import Link from "next/link"
import { Plus } from "lucide-react"
import HomeStats from "./_home-stats"

export default function Dashboard() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 mt-1">IoT monitoring overview</p>
      </div>

      <HomeStats />

      <div className="flex-1 flex items-center justify-center mt-8">
        <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-10 text-center max-w-md w-full">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Quick actions
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Register devices, define rules, and monitor alerts from the sidebar.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/devices"
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg transition"
            >
              Devices
            </Link>
            <Link
              href="/rules"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg transition"
            >
              <Plus size={18} />
              Create rule
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
