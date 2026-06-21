"use client"

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import { X } from "lucide-react"
import type { RuleRow, RuleSeverity, TriggerMode } from "@/types/entities"

type DeviceOpt = { device_id: string; name: string }

export default function RuleForm({
  existingRule,
  onClose,
  onSaved,
}: {
  existingRule?: RuleRow | null
  onClose: () => void
  onSaved: (rule: RuleRow) => void
}) {
  const isEdit = Boolean(existingRule?.id)

  const [devices, setDevices] = useState<DeviceOpt[]>([])

  const [rule, setRule] = useState({
    deviceId: "",
    metricName: "",
    minValue: "" as string | number,
    maxValue: "" as string | number,
    packetThreshold: 3,
    durationMinutes: 0,
    severity: "LOW",
    enabled: true,
    triggerMode: "BOTH" as TriggerMode,
  })

  useEffect(() => {
    api.get<{ data: DeviceOpt[] } | DeviceOpt[]>("/devices", { params: { limit: 200 } }).then(({ data }) => {
      setDevices(Array.isArray(data) ? data : (data.data ?? []))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!existingRule?.id) return
    setRule({
      deviceId: String(existingRule.device_id ?? ""),
      metricName: String(existingRule.metric_name ?? ""),
      minValue: existingRule.min_value ?? "",
      maxValue: existingRule.max_value ?? "",
      packetThreshold: Number(existingRule.packet_threshold ?? 3),
      durationMinutes: Number(existingRule.duration_minutes ?? 0),
      severity: String(existingRule.severity ?? "LOW") as RuleSeverity,
      enabled: Boolean(existingRule.enabled),
      triggerMode: (existingRule.trigger_mode ?? "BOTH") as TriggerMode,
    })
  }, [existingRule])

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setRule((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? checked
          : name === "packetThreshold" || name === "durationMinutes"
            ? value === "" ? "" : Number(value)
            : value,
    }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const minValue = Number(rule.minValue)
    const maxValue = Number(rule.maxValue)
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      toast.error("Min and max must be valid numbers")
      return
    }
    if (minValue >= maxValue) {
      toast.error("Min value must be smaller than max value")
      return
    }
    const payload = {
      deviceId: rule.deviceId,
      metricName: rule.metricName,
      minValue,
      maxValue,
      packetThreshold: Number(rule.packetThreshold) || 3,
      durationMinutes: Number(rule.durationMinutes) || 0,
      severity: rule.severity,
      enabled: rule.enabled,
      triggerMode: rule.triggerMode,
    }
    try {
      if (isEdit && existingRule?.id) {
        const { data } = await api.put(`/rules/${existingRule.id}`, payload)
        onSaved(data.rule)
      } else {
        const { data } = await api.post("/rules", payload)
        onSaved(data.rule)
      }
      onClose()
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error)
          : "Request failed"
      toast.error(msg || "Request failed")
    }
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-400"

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{isEdit ? "Edit Rule" : "Create Rule"}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{isEdit ? "Update threshold configuration" : "Define a new monitoring rule"}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={submit} className="overflow-y-auto flex-1">
          <div className="p-6 space-y-4">
            <Field label="Device">
              {isEdit ? (
                <input value={rule.deviceId} disabled className={inputCls} />
              ) : (
                <select name="deviceId" value={rule.deviceId} onChange={handleChange}
                  className={inputCls} required>
                  <option value="">Select a device...</option>
                  {devices.map((d) => (
                    <option key={d.device_id} value={d.device_id}>
                      {d.device_id} — {d.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Metric Name">
              <input name="metricName" placeholder="e.g. temperature" value={rule.metricName}
                onChange={handleChange} disabled={isEdit} className={inputCls} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min Value">
                <input name="minValue" type="number" step="any" placeholder="0" value={rule.minValue}
                  onChange={handleChange} className={inputCls} required />
              </Field>
              <Field label="Max Value">
                <input name="maxValue" type="number" step="any" placeholder="100" value={rule.maxValue}
                  onChange={handleChange} className={inputCls} required />
              </Field>
            </div>
            {/* Trigger mode selector */}
            <Field label="Trigger Mode">
              <div className="grid grid-cols-3 gap-2">
                {(["PACKET_ONLY", "DURATION_ONLY", "BOTH"] as TriggerMode[]).map((mode) => {
                  const labels: Record<TriggerMode, { title: string; sub: string }> = {
                    PACKET_ONLY:   { title: "Packet",   sub: "N bad readings" },
                    DURATION_ONLY: { title: "Duration", sub: "sustained X min" },
                    BOTH:          { title: "Both",     sub: "count + time" },
                  }
                  const active = rule.triggerMode === mode
                  return (
                    <button key={mode} type="button"
                      onClick={() => setRule((prev) => ({ ...prev, triggerMode: mode }))}
                      className={`rounded-xl border px-3 py-2.5 text-left transition
                        ${active
                          ? "border-teal-500 bg-teal-50 ring-1 ring-teal-400"
                          : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                      <p className={`text-xs font-bold ${active ? "text-teal-700" : "text-slate-700"}`}>
                        {labels[mode].title}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${active ? "text-teal-500" : "text-slate-400"}`}>
                        {labels[mode].sub}
                      </p>
                    </button>
                  )
                })}
              </div>
            </Field>

            {/* Conditional fields based on trigger mode */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Packet Threshold">
                <input name="packetThreshold" type="number" min={1} step={1} value={rule.packetThreshold}
                  onChange={handleChange}
                  disabled={rule.triggerMode === "DURATION_ONLY"}
                  className={inputCls} />
              </Field>
              <Field label="Duration (min)">
                <input name="durationMinutes" type="number" min={rule.triggerMode === "DURATION_ONLY" ? 1 : 0} step={1}
                  value={rule.durationMinutes}
                  onChange={handleChange}
                  disabled={rule.triggerMode === "PACKET_ONLY"}
                  className={inputCls} />
              </Field>
            </div>
            <Field label="Severity">
              <select name="severity" value={rule.severity} onChange={handleChange} className={inputCls}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </Field>
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Enable rule</p>
                <p className="text-xs text-slate-400">Rule will actively evaluate incoming data</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" name="enabled" checked={rule.enabled} onChange={handleChange} className="sr-only peer" />
                <div className="w-10 h-5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-teal-500 rounded-full peer
                  peer-checked:after:translate-x-5 peer-checked:bg-teal-600
                  after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit"
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition">
              {isEdit ? "Save Changes" : "Create Rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
