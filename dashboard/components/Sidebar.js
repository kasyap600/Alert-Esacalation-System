"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import {
  LayoutDashboard,
  Cpu,
  ShieldCheck,
  Bell,
  GitBranch,
  BarChart2,
} from "lucide-react"
import axios from "axios"

const nav = [
  { name: "Dashboard",  path: "/",           icon: LayoutDashboard },
  { name: "Devices",    path: "/devices",     icon: Cpu },
  { name: "Rules",      path: "/rules",       icon: ShieldCheck },
  { name: "Alerts",     path: "/alerts",      icon: Bell },
  { name: "Escalation", path: "/escalation",  icon: GitBranch },
  { name: "Analytics",  path: "/telemetry",   icon: BarChart2 },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [health, setHealth] = useState("checking") // "ok" | "error" | "checking"

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        await axios.get("/health")
        if (!cancelled) setHealth("ok")
      } catch {
        if (!cancelled) setHealth("error")
      }
    }

    check()
    const interval = setInterval(check, 30000) // re-check every 30s
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const healthLabel = health === "ok"
    ? "System Operational"
    : health === "error"
    ? "Backend Unreachable"
    : "Checking..."

  const healthSub = health === "ok"
    ? "All services running"
    : health === "error"
    ? "Check backend server"
    : "Connecting..."

  return (
    <div className="w-64 min-h-screen bg-slate-900 flex flex-col shrink-0 border-r border-slate-800">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800 bg-white">
        <Image
          src="/logo.png"
          alt="WIMERA"
          width={140}
          height={40}
          className="object-contain"
          priority
        />
      </div>

      {/* Nav label */}
      <div className="px-5 pt-5 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Main Menu
        </p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-0.5">
        {nav.map((item) => {
          const Icon = item.icon
          const active = pathname === item.path
          return (
            <Link
              key={item.name}
              href={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${active
                  ? "bg-teal-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                }`}
            >
              <Icon
                size={17}
                className={active ? "text-teal-200" : "text-slate-500"}
                strokeWidth={2}
              />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Health footer */}
      <div className={`p-4 m-3 mb-4 rounded-xl border ${
        health === "ok"
          ? "bg-slate-800 border-slate-700"
          : health === "error"
          ? "bg-red-950 border-red-800"
          : "bg-slate-800 border-slate-700"
      }`}>
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {health === "ok" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              health === "ok" ? "bg-emerald-500" :
              health === "error" ? "bg-red-500" :
              "bg-slate-500"
            }`} />
          </span>
          <span className={`text-xs font-medium ${
            health === "error" ? "text-red-300" : "text-slate-300"
          }`}>
            {healthLabel}
          </span>
        </div>
        <p className={`text-[10px] mt-1 ml-5 ${
          health === "error" ? "text-red-500" : "text-slate-500"
        }`}>
          {healthSub}
        </p>
      </div>

    </div>
  )
}
