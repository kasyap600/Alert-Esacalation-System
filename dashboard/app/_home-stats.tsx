"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Cpu, ShieldCheck, Bell, CheckCircle, Clock, Activity, AlertTriangle } from "lucide-react"
import api from "@/services/api"
import type { AlertRow } from "@/types/entities"

type Stats = {
  devices: number | null
  rules: number | null
  openAlerts: number | null
  acknowledgedAlerts: number | null
  resolvedAlerts: number | null
  totalPackets: number | null
}

export default function HomeStats() {
  const [stats, setStats] = useState<Stats>({
    devices: null, rules: null, openAlerts: null,
    acknowledgedAlerts: null, resolvedAlerts: null, totalPackets: null,
  })
  const [recentAlerts, setRecentAlerts] = useState<AlertRow[]>([])
  const [severityBreakdown, setSeverityBreakdown] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const [d, r, open, ack, res, tel] = await Promise.all([
          api.get("/devices", { params: { limit: 1 } }),
          api.get("/rules", { params: { limit: 1 } }),
          api.get("/alerts", { params: { limit: 5, status: "OPEN" } }),
          api.get("/alerts", { params: { limit: 1, status: "ACKNOWLEDGED" } }),
          api.get("/alerts", { params: { limit: 1, status: "RESOLVED" } }),
          api.get("/telemetry", { params: { limit: 1 } }).catch(() => null),
        ])
        if (cancelled) return

        const getTotal = (resp: { data: unknown }) => {
          const d = resp.data
          if (d && typeof d === "object" && "pagination" in d) {
            return (d as { pagination: { total: number } }).pagination.total
          }
          if (Array.isArray(d)) return d.length
          return 0
        }

        const openData = open.data
        const rows: AlertRow[] = Array.isArray(openData) ? openData : (openData?.data ?? [])

        const breakdown: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 }
        rows.forEach((a) => { if (a.severity && breakdown[a.severity] !== undefined) breakdown[a.severity]++ })

        setStats({
          devices: getTotal(d),
          rules: getTotal(r),
          openAlerts: getTotal(open),
          acknowledgedAlerts: getTotal(ack),
          resolvedAlerts: getTotal(res),
          totalPackets: tel ? getTotal(tel) : null,
        })
        setRecentAlerts(rows.slice(0, 5))
        setSeverityBreakdown(breakdown)
      } catch (err) {
        console.error("HomeStats load failed:", err)
        if (!cancelled) setStats({ devices: null, rules: null, openAlerts: null, acknowledgedAlerts: null, resolvedAlerts: null, totalPackets: null })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  const statCards = [
    { label: "Total Devices",  value: stats.devices,            href: "/devices",       icon: Cpu,         bg: "bg-teal-50",    icon_c: "text-teal-600",    ring: "ring-teal-100"   },
    { label: "Active Rules",   value: stats.rules,              href: "/rules",         icon: ShieldCheck, bg: "bg-blue-50",    icon_c: "text-blue-600",    ring: "ring-blue-100"   },
    { label: "Open Alerts",    value: stats.openAlerts,         href: "/alerts",        icon: Bell,        bg: "bg-rose-50",    icon_c: "text-rose-600",    ring: "ring-rose-100"   },
    { label: "Acknowledged",   value: stats.acknowledgedAlerts, href: "/alerts",        icon: Clock,       bg: "bg-amber-50",   icon_c: "text-amber-600",   ring: "ring-amber-100"  },
    { label: "Resolved",       value: stats.resolvedAlerts,     href: "/alerts",        icon: CheckCircle, bg: "bg-emerald-50", icon_c: "text-emerald-600", ring: "ring-emerald-100" },
    { label: "Total Packets",  value: stats.totalPackets,       href: "/telemetry",     icon: Activity,    bg: "bg-violet-50",  icon_c: "text-violet-600",  ring: "ring-violet-100"  },
  ]

  const severityColors: Record<string, { bar: string; label: string }> = {
    HIGH:   { bar: "bg-red-500",    label: "text-red-700"    },
    MEDIUM: { bar: "bg-orange-400", label: "text-orange-700" },
    LOW:    { bar: "bg-green-500",  label: "text-green-700"  },
  }
  const totalSeverity = Object.values(severityBreakdown).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((c) => {
          const Icon = c.icon
          return (
            <Link key={c.label} href={c.href}
              className={`group bg-white rounded-2xl p-5 ring-1 ${c.ring} shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5`}>
              <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
                <Icon size={17} className={c.icon_c} />
              </div>
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
              <p className="text-2xl font-bold text-slate-800 mt-0.5">
                {c.value === null
                  ? <span className="text-slate-300 text-lg animate-pulse">—</span>
                  : c.value.toLocaleString()}
              </p>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent open alerts */}
        <div className="lg:col-span-2 bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">Recent Open Alerts</h2>
              <p className="text-xs text-slate-500 mt-0.5">Latest 5 unacknowledged alerts</p>
            </div>
            <Link href="/alerts" className="text-xs text-teal-600 hover:underline font-medium">View all →</Link>
          </div>
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : recentAlerts.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle size={28} className="text-emerald-400 mx-auto mb-2" />
              <p className="text-slate-500 text-sm font-medium">No open alerts</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-2.5">Device</th>
                  <th className="px-5 py-2.5">Metric</th>
                  <th className="px-5 py-2.5">Value</th>
                  <th className="px-5 py-2.5">Severity</th>
                  <th className="px-5 py-2.5">Triggered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentAlerts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{a.device_id}</td>
                    <td className="px-5 py-3 text-slate-600">{a.metric_name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{a.current_value ?? "—"}</td>
                    <td className="px-5 py-3">
                      {a.severity && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                          ${a.severity === "HIGH" ? "bg-red-50 text-red-700" :
                            a.severity === "MEDIUM" ? "bg-orange-50 text-orange-700" :
                            "bg-green-50 text-green-700"}`}>
                          {a.severity}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">
                      {a.triggered_at ? new Date(a.triggered_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Severity breakdown */}
        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={15} className="text-orange-500" />
            <h2 className="font-bold text-slate-800 text-sm">Open Alert Severity</h2>
          </div>
          {totalSeverity === 0 ? (
            <p className="text-slate-400 text-xs text-center py-4">No open alerts</p>
          ) : (
            <div className="space-y-3">
              {["HIGH", "MEDIUM", "LOW"].map((s) => {
                const count = severityBreakdown[s] ?? 0
                const pct = totalSeverity > 0 ? Math.round((count / totalSeverity) * 100) : 0
                const c = severityColors[s]
                return (
                  <div key={s}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-xs font-semibold ${c.label}`}>{s}</span>
                      <span className="text-xs text-slate-500">{count} <span className="text-slate-300">({pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-2 rounded-full ${c.bar} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
