"use client"

import { useCallback, useEffect, useState } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import { RefreshCw, TrendingUp, AlertTriangle, Cpu, BarChart2 } from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts"
import type { AlertRow } from "@/types/entities"

type DeviceStat  = { device_id: string; count: number }
type MetricStat  = { metric_name: string; count: number }
type SeverityStat = { name: string; value: number; color: string }
type StatusStat   = { name: string; value: number; color: string }

const SEVERITY_COLORS: Record<string, string> = {
  HIGH:   "#ef4444",
  MEDIUM: "#f97316",
  LOW:    "#22c55e",
}
const STATUS_COLORS: Record<string, string> = {
  OPEN:         "#f43f5e",
  ACKNOWLEDGED: "#f59e0b",
  RESOLVED:     "#10b981",
}

export default function AnalyticsPage() {
  const [topDevices, setTopDevices]   = useState<DeviceStat[]>([])
  const [topMetrics, setTopMetrics]   = useState<MetricStat[]>([])
  const [severityData, setSeverityData] = useState<SeverityStat[]>([])
  const [statusData, setStatusData]   = useState<StatusStat[]>([])
  const [totalAlerts, setTotalAlerts] = useState(0)
  const [loading, setLoading]         = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch a large sample — up to 2000 open+acknowledged alerts for analysis
      const [openRes, ackRes, resRes] = await Promise.all([
        api.get("/alerts", { params: { status: "OPEN",         limit: 200, page: 1 } }),
        api.get("/alerts", { params: { status: "ACKNOWLEDGED", limit: 200, page: 1 } }),
        api.get("/alerts", { params: { status: "RESOLVED",     limit: 200, page: 1 } }),
      ])

      const getRows = (res: { data: unknown }): AlertRow[] => {
        const d = res.data
        if (Array.isArray(d)) return d
        return (d as { data?: AlertRow[] })?.data ?? []
      }
      const getPagTotal = (res: { data: unknown }): number => {
        const d = res.data
        if (d && typeof d === "object" && "pagination" in d) {
          return (d as { pagination: { total: number } }).pagination.total
        }
        return 0
      }

      const openRows  = getRows(openRes)
      const ackRows   = getRows(ackRes)
      const resRows   = getRows(resRes)
      const allRows   = [...openRows, ...ackRows, ...resRows]

      const openTotal = getPagTotal(openRes)
      const ackTotal  = getPagTotal(ackRes)
      const resTotal  = getPagTotal(resRes)
      setTotalAlerts(openTotal + ackTotal + resTotal)

      // Status breakdown (uses real totals, not just sample)
      setStatusData([
        { name: "Open",         value: openTotal, color: STATUS_COLORS.OPEN         },
        { name: "Acknowledged", value: ackTotal,  color: STATUS_COLORS.ACKNOWLEDGED },
        { name: "Resolved",     value: resTotal,  color: STATUS_COLORS.RESOLVED     },
      ])

      // Severity breakdown from sample
      const sevCount: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 }
      allRows.forEach(a => { if (a.severity) sevCount[a.severity] = (sevCount[a.severity] ?? 0) + 1 })
      setSeverityData(
        Object.entries(sevCount)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => ({ name: k, value: v, color: SEVERITY_COLORS[k] }))
      )

      // Top alerting devices (from open alerts sample)
      const devCount: Record<string, number> = {}
      openRows.forEach(a => { devCount[a.device_id] = (devCount[a.device_id] ?? 0) + 1 })
      setTopDevices(
        Object.entries(devCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([device_id, count]) => ({ device_id, count }))
      )

      // Top violated metrics (from open alerts sample)
      const metCount: Record<string, number> = {}
      openRows.forEach(a => { metCount[a.metric_name] = (metCount[a.metric_name] ?? 0) + 1 })
      setTopMetrics(
        Object.entries(metCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([metric_name, count]) => ({ metric_name, count }))
      )
    } catch (err) {
      console.error("Failed to load analytics:", err)
      toast.error("Failed to load analytics")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCount = statusData.find(s => s.name === "Open")?.value ?? 0
  const resCount  = statusData.find(s => s.name === "Resolved")?.value ?? 0
  const resolveRate = totalAlerts > 0 ? Math.round((resCount / totalAlerts) * 100) : 0

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-600 mb-1">Insights</p>
          <h1 className="text-3xl font-bold text-slate-800">Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Alert trends, top offenders, and system health at a glance</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 transition">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Alerts",   value: totalAlerts.toLocaleString(), icon: BarChart2,     color: "text-violet-600", bg: "bg-violet-50"  },
          { label: "Open Now",       value: openCount.toLocaleString(),   icon: AlertTriangle, color: "text-rose-600",   bg: "bg-rose-50"    },
          { label: "Resolved",       value: resCount.toLocaleString(),    icon: TrendingUp,    color: "text-emerald-600",bg: "bg-emerald-50" },
          { label: "Resolve Rate",   value: `${resolveRate}%`,            icon: Cpu,           color: "text-teal-600",   bg: "bg-teal-50"    },
        ].map(c => {
          const Icon = c.icon
          return (
            <div key={c.label} className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-5">
              <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
                <Icon size={17} className={c.color} />
              </div>
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
              <p className="text-2xl font-bold text-slate-800 mt-0.5">
                {loading ? <span className="text-slate-300 animate-pulse">—</span> : c.value}
              </p>
            </div>
          )
        })}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Alert status breakdown */}
        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-1">Alert Status Breakdown</h2>
          <p className="text-xs text-slate-500 mb-5">Distribution across all statuses</p>
          {loading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={80} paddingAngle={3}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => v.toLocaleString()} />
                <Legend iconType="circle" iconSize={10}
                  formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Severity breakdown */}
        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-1">Severity Breakdown</h2>
          <p className="text-xs text-slate-500 mb-5">From recent open + acknowledged + resolved alerts</p>
          {loading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={severityData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={80} paddingAngle={3}>
                  {severityData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => v.toLocaleString()} />
                <Legend iconType="circle" iconSize={10}
                  formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top alerting devices */}
        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-1">Top Alerting Devices</h2>
          <p className="text-xs text-slate-500 mb-5">Devices with most open alerts (sample of 200)</p>
          {loading ? <ChartSkeleton /> : topDevices.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topDevices} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="device_id" width={130}
                  tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f1f5f9" }}
                  formatter={(v: number) => [v, "Open alerts"]} />
                <Bar dataKey="count" fill="#14b8a6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top violated metrics */}
        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-1">Top Violated Metrics</h2>
          <p className="text-xs text-slate-500 mb-5">Metrics triggering the most open alerts (sample of 200)</p>
          {loading ? <ChartSkeleton /> : topMetrics.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topMetrics} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="metric_name" width={100}
                  tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f1f5f9" }}
                  formatter={(v: number) => [v, "Open alerts"]} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top devices table */}
      {!loading && topDevices.length > 0 && (
        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Top Alerting Devices — Detail</h2>
            <p className="text-xs text-slate-500 mt-0.5">Ranked by open alert count</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <th className="px-5 py-3">Rank</th>
                <th className="px-5 py-3">Device ID</th>
                <th className="px-5 py-3">Open Alerts</th>
                <th className="px-5 py-3">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {topDevices.map((d, i) => {
                const share = openCount > 0 ? Math.round((d.count / openCount) * 100) : 0
                return (
                  <tr key={d.device_id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">#{i + 1}</td>
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-700">{d.device_id}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">{d.count}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[120px]">
                          <div className="h-1.5 bg-teal-500 rounded-full" style={{ width: `${share}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{share}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="h-[220px] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">
      No data available
    </div>
  )
}
