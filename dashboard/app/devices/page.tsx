"use client"

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
} from "react"
import api from "@/services/api"
import toast from "react-hot-toast"

type DeviceRow = {
  device_id: string
  name: string
  location?: string
  device_type?: string
  is_active?: boolean
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [filtered, setFiltered] = useState<DeviceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [editingDevice, setEditingDevice] = useState<DeviceRow | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    device_id: "",
    name: "",
    location: "",
    device_type: "",
  })

  const loadDevices = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<DeviceRow[]>("/devices")
      const list = Array.isArray(data) ? data : []
      setDevices(list)
      setFiltered(list)
    } catch {
      toast.error("Failed to load devices")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  useEffect(() => {
    let result = devices

    if (search) {
      result = result.filter((d) =>
        `${d.name} ${d.device_id}`.toLowerCase().includes(search.toLowerCase()),
      )
    }

    if (typeFilter) {
      result = result.filter((d) => d.device_type === typeFilter)
    }

    if (statusFilter) {
      result = result.filter((d) =>
        statusFilter === "active" ? d.is_active : !d.is_active,
      )
    }

    setFiltered(result)
  }, [search, typeFilter, statusFilter, devices])

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
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
          name: form.name,
          location: form.location || null,
          device_type: form.device_type,
        })
        toast.success("Device updated")
      } else {
        const payload: Record<string, unknown> = {
          name: form.name,
          location: form.location || null,
          device_type: form.device_type,
        }
        if (String(form.device_id || "").trim()) {
          payload.device_id = String(form.device_id).trim()
        }
        await api.post("/devices", payload)
        toast.success("Device created")
      }

      setShowModal(false)
      setEditingDevice(null)
      setForm({
        device_id: "",
        name: "",
        location: "",
        device_type: "",
      })
      loadDevices()
    } catch {
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
      loadDevices()
    } catch {
      toast.error("Delete failed")
    }
  }

  const toggleDevice = async (id: string) => {
    try {
      await api.patch(`/devices/${encodeURIComponent(id)}/toggle`)
      toast.success("Status updated")
      loadDevices()
    } catch {
      toast.error("Toggle failed")
    }
  }

  const openEdit = (device: DeviceRow) => {
    setEditingDevice(device)
    setForm({
      device_id: device.device_id,
      name: device.name,
      location: device.location || "",
      device_type: device.device_type || "",
    })
    setShowModal(true)
  }

  const openCreate = () => {
    setEditingDevice(null)
    setForm({
      device_id: "",
      name: "",
      location: "",
      device_type: "",
    })
    setShowModal(true)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold">Devices</h1>
          <p className="text-gray-500">Manage connected IoT devices</p>
        </div>

        <button
          onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          + Add Device
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          placeholder="Search by device name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded w-full max-w-xs"
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="">All Types</option>
          <option value="temperature_sensor">Temperature</option>
          <option value="pressure_sensor">Pressure</option>
          <option value="humidity_sensor">Humidity</option>
          <option value="vibration_sensor">Vibration</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setSearch("")
            setTypeFilter("")
            setStatusFilter("")
          }}
          className="px-3 border rounded"
        >
          Reset
        </button>
      </div>

      <div className="bg-white rounded-xl shadow border">
        {loading ? (
          <p className="p-4">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-lg">No devices found</p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-3 bg-blue-600 text-white px-4 py-2 rounded"
            >
              + Add Device
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b text-left text-gray-500 text-sm">
              <tr>
                <th className="p-4">Device ID</th>
                <th className="p-4">Name</th>
                <th className="p-4">Type</th>
                <th className="p-4">Status</th>
                <th className="p-4">Location</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.device_id}
                  className="border-b hover:bg-gray-50"
                >
                  <td className="p-4 font-mono text-sm">{d.device_id}</td>
                  <td className="p-4">{d.name}</td>
                  <td className="p-4">{d.device_type}</td>
                  <td className="p-4">
                    <span
                      className={
                        d.is_active ? "text-green-600" : "text-red-500"
                      }
                    >
                      {d.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-4">{d.location}</td>
                  <td className="p-4 flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      className="text-blue-600"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDevice(d.device_id)}
                      className="text-red-500"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleDevice(d.device_id)}
                      className="text-gray-600"
                    >
                      Toggle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl space-y-4 w-full max-w-md">
            <h2 className="text-xl font-semibold">
              {editingDevice ? "Edit Device" : "Add Device"}
            </h2>

            {editingDevice ? (
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Device ID
                </label>
                <input
                  name="device_id"
                  value={form.device_id}
                  disabled
                  className="border p-2 w-full rounded bg-gray-100 text-gray-700"
                />
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  Device ID will be set automatically from the next database id
                  (e.g. <span className="font-mono">87</span>). Optional: set a
                  custom ID below.
                </p>
                <input
                  name="device_id"
                  placeholder="Custom device ID (optional)"
                  value={form.device_id}
                  onChange={handleChange}
                  className="border p-2 w-full rounded"
                />
              </>
            )}

            <input
              name="name"
              placeholder="Name"
              value={form.name}
              onChange={handleChange}
              className="border p-2 w-full rounded"
            />

            <select
              name="device_type"
              value={form.device_type}
              onChange={handleChange}
              className="border p-2 w-full rounded"
            >
              <option value="">Select Type</option>
              <option value="temperature_sensor">Temperature</option>
              <option value="pressure_sensor">Pressure</option>
              <option value="humidity_sensor">Humidity</option>
              <option value="vibration_sensor">Vibration</option>
            </select>

            <input
              name="location"
              placeholder="Location"
              value={form.location}
              onChange={handleChange}
              className="border p-2 w-full rounded"
            />

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDevice}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
