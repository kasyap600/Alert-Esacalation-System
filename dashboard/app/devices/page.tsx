"use client"

import {
  useCallback, useEffect, useState, type ChangeEvent,
} from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import { Plus, Search, RotateCcw, Pencil, Trash2, ToggleLeft, ToggleRight, Cpu, ChevronLeft, ChevronRight } from "lucide-react"

type DeviceRow = {
  device_id: string
  name: string
  location?: string
  device_type?: string
  is_active?: boolean
}

interface Pagination {
  total: number
  page: number
  limit: number
  pages: number
}

const PAGE_SIZE = 25

const TYPE_LABELS: Record<string, string> = {
  temperature_sensor: "Temperature",
  pressure_sensor:    "Pressure",
  humidity_sensor:    "Humidity",
  vibration_sensor:   "Vibration",
}

export default function DevicesPage() {
  const [allDevices, setAllDevices] = useState<DeviceRow[]>([])  // full list when backend returns plain array
  const [devices, setDevices]       = useState<DeviceRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: PAGE_SIZE, pages: 1 })
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [clientSide, setClientSide] = useState(false)
  const [search, setSearch]         = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [showModal, setShowModal]   = useState(false)
  const [editingDevice, setEditingDevice] = useState<DeviceRow | null>(null)
  const [saving, setSaving]         = useState(false)

  const [form, setForm] = useState({
    device_id: "", name: "", location: "", device_type: "",
  })

  const loadDevices = useCallback(async (targetPage = 1) => {
    setLoading(true)
    try {
      const { data } = await api.get<{ data: DeviceRow[]; pagination: Pagination } | DeviceRow[]>(
        "/devices", { params: { page: targetPage, limit: PAGE_SIZE } }
      )
      if (Array.isArray(data)) {
        // Backend returned plain array — do client-side pagination
        setClientSide(true)
        setAllDevices(data)
        const total = data.length
        const pages = Math.ceil(total / PAGE_SIZE)
        const start = (targetPage - 1) * PAGE_SIZE
        setDevices(data.slice(start, start + PAGE_SIZE))
        setPagination({ total, page: targetPage, limit: PAGE_SIZE, pages })
      } else {
        setClientSide(false)
        setAllDevices([])
        setDevices(data.data ?? [])
        setPagination(data.pagination)
      }
    } catch (err) {
      console.error("Failed to load devices:", err)
      toast.error("Failed to load devices")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDevices(1) }, [loadDevices])

  const goToPage = (p: number) => {
    setPage(p)
    if (clientSide) {
      const start = (p - 1) * PAGE_SIZE
      setDevices(allDevices.slice(start, start + PAGE_SIZE))
      setPagination((prev) => ({ ...prev, page: p }))
    } else {
      loadDevices(p)
    }
  }

  // Client-side filter on the current page
  const filtered = devices.filter((d) => {
    if (search && !`${d.name} ${d.device_id}`.toLowerCase().includes(search.toLowerCase())) return false
    if (typeFilter && d.device_type !== typeFilter) return false
    if (statusFilter && (statusFilter === "active" ? !d.is_active : d.is_active)) return false
    return true
  })

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const saveDevice = async () => {
    if (!form.name || !form.device_type) {
      toast.error("Name and type are required")
      return
    }
    try {
      setSaving(true)
      if (editingDevice) {
        await api.put(`/devices/${encodeURIComponent(editingDevice.device_id)}`, {
          name: form.name, location: form.location || null, device_type: form.device_type,
        })
        toast.success("Device updated")
      } else {
        const payload: Record<string, unknown> = {
          name: form.name, location: form.location || null, device_type: form.device_type,
        }
        if (String(form.device_id || "").trim()) payload.device_id = String(form.device_id).trim()
        await api.post("/devices", payload)
        toast.success("Device created")
      }
      setShowModal(false)
      setEditingDevice(null)
      setForm({ device_id: "", name: "", location: "", device_type: "" })
      loadDevices(page)
    } catch (err) {
      console.error("Could not save device:", err)
      toast.error("Could not save device")
    } finally {
      setSaving(false)
    }
  }

  const deleteDevice = async (id: string) => {
    if (!confirm("Delete this device?")) return
    try {
      await api.delete(`/devices/${encodeURIComponent(id)}`)
      toast.success("Device deleted")
      loadDevices(page)
    } catch (err) { console.error("Delete failed:", err); toast.error("Delete failed") }
  }

  const toggleDevice = async (id: string) => {
    try {
      await api.patch(`/devices/${encodeURIComponent(id)}/toggle`)
      toast.success("Status updated")
      loadDevices(page)
    } catch (err) { console.error("Toggle failed:", err); toast.error("Toggle failed") }
  }

  const openEdit = (device: DeviceRow) => {
    setEditingDevice(device)
    setForm({ device_id: device.device_id, name: device.name, location: device.location || "", device_type: device.device_type || "" })
    setShowModal(true)
  }

  const openCreate = () => {
    setEditingDevice(null)
    setForm({ device_id: "", name: "", location: "", device_type: "" })
    setShowModal(true)
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
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-600 mb-1">Management</p>
          <h1 className="text-3xl font-bold text-slate-800">Devices</h1>
          <p className="text-slate-500 text-sm mt-1">Manage connected IoT sensors and hardware</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition">
          <Plus size={16} /> Add Device
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input placeholder="Search by name or ID..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button type="button" onClick={() => { setSearch(""); setTypeFilter(""); setStatusFilter("") }}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 border border-slate-200 rounded-lg transition">
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading devices...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Cpu size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">No devices found</p>
            <p className="text-slate-400 text-sm mt-1 mb-4">Add your first device to get started</p>
            <button onClick={openCreate} className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
              + Add Device
            </button>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Device ID</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((d) => (
                  <tr key={d.device_id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600">{d.device_id}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-800">{d.name}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                        {TYPE_LABELS[d.device_type ?? ""] ?? d.device_type ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full
                        ${d.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${d.is_active ? "bg-emerald-500" : "bg-red-400"}`} />
                        {d.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-500">{d.location || "—"}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(d)} title="Edit"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleDevice(d.device_id)} title="Toggle"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition">
                          {d.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        <button onClick={() => deleteDevice(d.device_id)} title="Delete"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {total > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  Showing <span className="font-semibold text-slate-700">{from}–{to}</span> of <span className="font-semibold text-slate-700">{total}</span> devices
                </p>
                {pages > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => goToPage(page - 1)} disabled={page === 1}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
                      <ChevronLeft size={16} />
                    </button>
                    {pageNumbers().map((p, i) =>
                      p === "..." ? (
                        <span key={`e-${i}`} className="px-2 text-slate-400 text-sm select-none">…</span>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">
                {editingDevice ? "Edit Device" : "Add Device"}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {editingDevice ? "Update device information" : "Register a new IoT device"}
              </p>
            </div>
            <div className="p-6 space-y-4">
              {editingDevice ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Device ID</label>
                  <input value={form.device_id} disabled
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-slate-500" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Device ID <span className="text-slate-400 normal-case font-normal">(optional)</span>
                  </label>
                  <input name="device_id" placeholder="Auto-generated if left blank"
                    value={form.device_id} onChange={handleChange}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Name *</label>
                <input name="name" placeholder="e.g. Warehouse Sensor A1"
                  value={form.name} onChange={handleChange}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Type *</label>
                <select name="device_type" value={form.device_type} onChange={handleChange}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="">Select type</option>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Location <span className="text-slate-400 normal-case font-normal">(optional)</span>
                </label>
                <input name="location" placeholder="e.g. Building A, Floor 2"
                  value={form.location} onChange={handleChange}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
            <div className="p-6 pt-0 flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button type="button" onClick={saveDevice} disabled={saving}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-60">
                {saving ? "Saving..." : editingDevice ? "Save Changes" : "Add Device"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
