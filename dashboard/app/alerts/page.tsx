"use client"

import { useCallback, useEffect, useState } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import { Search, RefreshCw, Bell, ChevronLeft, ChevronRight, CheckSquare, Square, CheckCircle2 } from "lucide-react"
import type { AlertRow } from "@/types/entities"

const STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const
const PAGE_SIZE = 25

const statusStyle: Record<string, string> = {
  OPEN:         "bg-rose-50 text-rose-700 ring-rose-200",
  ACKNOWLEDGED: "bg-amber-50 text-amber-700 ring-amber-200",
  RESOLVED:     "bg-emerald-50 text-emerald-700 ring-emerald-200",
}
const statusDot: Record<string, string> = {
  OPEN:         "bg-rose-500",
  ACKNOWLEDGED: "bg-amber-400",
  RESOLVED:     "bg-emerald-500",
}
const severityStyle: Record<string, string> = {
  HIGH:   "bg-red-50 text-red-700",
  MEDIUM: "bg-orange-50 text-orange-700",
  LOW:    "bg-green-50 text-green-700",
}

interface Pagination {
  total: number
  page: number
  limit: number
  pages: number
}

export default function AlertsPage() {
  const [alerts, setAlerts]         = useState<AlertRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: PAGE_SIZE, pages: 1 })
  const [loading, setLoading]       = useState(true)
  const [statusFilter, setStatusFilter] = useState("")
  const [query, setQuery]           = useState("")
  const [page, setPage]             = useState(1)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [selected, setSelected]     = useState<Set<number>>(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)

  const load = useCallback(async (targetPage = 1) => {
    setLoading(true)
    setSelected(new Set())
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, page: targetPage }
      if (statusFilter) params.status = statusFilter
      const { data } = await api.get<{ data: AlertRow[]; pagination: Pagination } | AlertRow[]>("/alerts", { params })
      if (Array.isArray(data)) {
        setAlerts(data)
        setPagination({ total: data.length, page: 1, limit: PAGE_SIZE, pages: 1 })
      } else {
        setAlerts(data.data ?? [])
        setPagination(data.pagination)
      }
    } catch (err) {
      console.error("Failed to load alerts:", err)
      toast.error("Failed to load alerts")
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { setPage(1); load(1) }, [load])

  const goToPage = (p: number) => { setPage(p); load(p) }

  const updateStatus = async (id: number, status: string) => {
    setUpdatingId(id)
    try {
      await api.put(`/alerts/${id}`, { status })
      toast.success("Alert updated")
      load(page)
    } catch (err) {
      console.error("Alert status update failed:", err)
      toast.error("Update failed")
    } finally {
      setUpdatingId(null)
    }
  }

  // ── Bulk selection ──────────────────────────────────────────────
  const filtered = alerts.filter((a) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      (a.device_id ?? "").toLowerCase().includes(q) ||
      (a.metric_name ?? "").toLowerCase().includes(q) ||
      (a.severity || "").toLowerCase().includes(q)
    )
  })

  const allSelected = filtered.length > 0 && filtered.every(a => selected.has(a.id))
  const someSelected = selected.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(a => a.id)))
    }
  }

  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const bulkUpdate = async (status: string) => {
    if (selected.size === 0) return
    setBulkUpdating(true)
    try {
      const results = await Promise.allSettled([...selected].map(id => api.put(`/alerts/${id}`, { status })))
      const failed = results.filter(r => r.status === "rejected").length
      const succeeded = results.length - failed
      if (failed === 0) {
        toast.success(`${succeeded} alert${succeeded > 1 ? "s" : ""} marked ${status.toLowerCase()}`)
      } else if (succeeded === 0) {
        toast.error("All updates failed")
      } else {
        toast.error(`${succeeded} updated, ${failed} failed`)
      }
      load(page)
    } catch (err) {
      console.error("Bulk update error:", err)
      toast.error("Bulk update failed")
    } finally {
      setBulkUpdating(false)
    }
  }

  const { total, pages } = pagination
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to   = Math.min(page * PAGE_SIZE, total)

  function pageNumbers(): (number | "...")[] {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
    const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages))
    const sorted = [...set].sort((a, b) => a - b)
    const result: (number | "...")[] = []
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && (sorted[i] as number) - (sorted[i - 1] as number) > 1) result.push("...")
      result.push(sorted[i])
    }
    return result
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-600 mb-1">Monitoring</p>
        <h1 className="text-3xl font-bold text-slate-800">Alerts</h1>
        <p className="text-slate-500 text-sm mt-1">Review fired alerts and update their status</p>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-3">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ring-1 transition
              ${statusFilter === s ? statusStyle[s] + " ring-1" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"}`}>
            <span className={`w-2 h-2 rounded-full ${statusDot[s]}`} />
            {s}
          </button>
        ))}
      </div>

      {/* Search + refresh */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by device, metric, or severity..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <button onClick={() => load(page)}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="bg-teal-600 rounded-2xl px-5 py-3 flex items-center gap-4">
          <span className="text-white text-sm font-semibold">
            {selected.size} selected
          </span>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => bulkUpdate("ACKNOWLEDGED")} disabled={bulkUpdating}
              className="px-4 py-1.5 bg-amber-400 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-60">
              {bulkUpdating ? "Updating..." : "Acknowledge"}
            </button>
            <button onClick={() => bulkUpdate("RESOLVED")} disabled={bulkUpdating}
              className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition disabled:opacity-60">
              {bulkUpdating ? "Updating..." : "Resolve"}
            </button>
            <button onClick={() => setSelected(new Set())} disabled={bulkUpdating}
              className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-white text-xs font-semibold rounded-lg transition">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading alerts...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Bell size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">No alerts found</p>
            <p className="text-slate-400 text-sm mt-1">Try changing the filter or search query</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3 w-10">
                      <button onClick={toggleAll} className="text-slate-400 hover:text-teal-600 transition">
                        {allSelected
                          ? <CheckSquare size={16} className="text-teal-600" />
                          : <Square size={16} />}
                      </button>
                    </th>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">Metric</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Level</th>
                    <th className="px-4 py-3">Triggered</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((a) => (
                    <tr key={a.id}
                      className={`hover:bg-slate-50/70 transition ${selected.has(a.id) ? "bg-teal-50/40" : ""}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleOne(a.id)} className="text-slate-400 hover:text-teal-600 transition">
                          {selected.has(a.id)
                            ? <CheckCircle2 size={16} className="text-teal-600" />
                            : <Square size={16} />}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-500">#{a.id}</td>
                      <td className="px-4 py-3.5 font-medium text-slate-800">{a.device_id}</td>
                      <td className="px-4 py-3.5 text-slate-600">{a.metric_name}</td>
                      <td className="px-4 py-3.5 font-mono text-sm text-slate-700">{a.current_value ?? "—"}</td>
                      <td className="px-4 py-3.5">
                        {a.severity ? (
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${severityStyle[a.severity] ?? "bg-slate-100 text-slate-600"}`}>
                            {a.severity}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        {(a.current_level ?? 0) > 0 ? (
                          <span className="text-xs font-bold px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full">
                            L{a.current_level}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">L0</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {a.triggered_at ? new Date(a.triggered_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <select
                          value={a.status}
                          onChange={(e) => updateStatus(a.id, e.target.value)}
                          disabled={updatingId === a.id}
                          className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg ring-1 border-0 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer disabled:opacity-60
                            ${statusStyle[a.status] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  Showing <span className="font-semibold text-slate-700">{from}–{to}</span> of{" "}
                  <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> alerts
                  {someSelected && (
                    <span className="ml-2 text-teal-600 font-semibold">· {selected.size} selected</span>
                  )}
                </p>
                {pages > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => goToPage(page - 1)} disabled={page === 1}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
                      <ChevronLeft size={16} />
                    </button>
                    {pageNumbers().map((p, i) =>
                      p === "..." ? (
                        <span key={`ellipsis-${i}`} className="px-2 text-slate-400 text-sm select-none">…</span>
                      ) : (
                        <button key={p} onClick={() => goToPage(p as number)}
                          className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition
                            ${page === p ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                          {p}
                        </button>
                      )
                    )}
                    <button onClick={() => goToPage(page + 1)} disabled={page === pages}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
