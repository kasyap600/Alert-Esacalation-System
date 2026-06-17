"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function Sidebar() {

  const pathname = usePathname()

  const nav = [
    { name: "Dashboard", path: "/" },
    { name: "Devices", path: "/devices" },
    { name: "Rules", path: "/rules" },
    { name: "Alerts", path: "/alerts" },
    { name: "Escalation", path: "/escalation" },
    { name: "Telemetry", path: "/telemetry" }
  ]

  return (

    <div className="w-64 min-h-screen bg-[#0f172a] text-gray-300 flex flex-col">

      <div className="p-6 border-b border-slate-700">
        <h1 className="text-white text-xl font-semibold">
          IoT Monitor
        </h1>
        <p className="text-xs text-gray-400">
          Alert Dashboard
        </p>
      </div>

      <div className="p-4 space-y-2">

        {nav.map((item) => (

          <Link
            key={item.name}
            href={item.path}
            className={`block px-4 py-2 rounded-lg transition
              ${
                pathname === item.path
                  ? "bg-slate-700 text-white"
                  : "hover:bg-slate-800"
              }`}
          >
            {item.name}
          </Link>

        ))}

      </div>

      <div className="mt-auto p-6 text-green-400 text-sm">
        ● System Operational
      </div>

    </div>
  )
}