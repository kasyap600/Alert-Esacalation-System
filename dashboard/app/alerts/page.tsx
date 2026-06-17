"use client"

import { useCallback, useEffect, useState } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import type { AlertRow } from "@/types/entities"

const STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")
  const [query, setQuery] = useState("")
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<AlertRow[]>("/alerts")
      setAlerts(Array.isArray(data) ? data : [])
    } catch {
      toast.error("Failed to load alerts")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const updateStatus = async (id: number, status: string) => {
    setUpdatingId(id)
    try {
      await api.put(`/alerts/${id}`, { status })
      toast.success("Alert updated")
      load()
    } catch {
      toast.error("Update failed")
    } finally {
      setUpdatingId(null)
    }
  }

  const filtered = alerts.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false
    if (!query) return true
    const q = query.toLowerCase()
    return (
      a.device_id.toLowerCase().includes(q) ||
      a.metric_name.toLowerCase().includes(q) ||
      (a.severity || "").toLowerCase().includes(q)
    )
  })

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-gray-800">Alerts</h1>
        <p className="text-gray-500 text-sm mt-1">
          Review fired alerts and change status
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">Filter:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={load}
          className="px-3 py-2 border rounded text-sm"
        >
          Refresh
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search device or metric..."
          className="border rounded px-3 py-2 ml-auto"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        {loading ? (
          <p className="p-6 text-gray-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-500">No alerts</p>
        ) : (
          <table className="w-full min-w-[800px]">
            <thead className="border-b bg-gray-50 text-left text-sm text-gray-600">
              <tr>
                <th className="p-4">ID</th>
                <th className="p-4">Device</th>
                <th className="p-4">Metric</th>
                <th className="p-4">Value</th>
                <th className="p-4">Severity</th>
                <th className="p-4">Triggered</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 font-mono text-sm">{a.id}</td>
                  <td className="p-4">{a.device_id}</td>
                  <td className="p-4">{a.metric_name}</td>
                  <td className="p-4">{a.current_value ?? "—"}</td>
                  <td className="p-4">{a.severity ?? "—"}</td>
                  <td className="p-4 text-sm text-gray-600">
                    {a.triggered_at
                      ? new Date(a.triggered_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="p-4">
                    <select
                      value={a.status}
                      onChange={(e) => updateStatus(a.id, e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                      disabled={updatingId === a.id}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
