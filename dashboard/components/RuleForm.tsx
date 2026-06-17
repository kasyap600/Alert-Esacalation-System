"use client"

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import type { RuleRow, RuleSeverity } from "@/types/entities"

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

  const [rule, setRule] = useState({
    deviceId: "",
    metricName: "",
    minValue: "" as string | number,
    maxValue: "" as string | number,
    packetThreshold: 1,
    durationMinutes: 0,
    severity: "LOW",
    enabled: true,
  })

  useEffect(() => {
    if (!existingRule?.id) return
    setRule({
      deviceId: String(existingRule.device_id ?? ""),
      metricName: String(existingRule.metric_name ?? ""),
      minValue: existingRule.min_value ?? "",
      maxValue: existingRule.max_value ?? "",
      packetThreshold: Number(existingRule.packet_threshold ?? 1),
      durationMinutes: Number(existingRule.duration_minutes ?? 0),
      severity: String(existingRule.severity ?? "LOW") as RuleSeverity,
      enabled: Boolean(existingRule.enabled),
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
            ? value === ""
              ? ""
              : Number(value)
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
      packetThreshold: Number(rule.packetThreshold) || 1,
      durationMinutes: Number(rule.durationMinutes) || 0,
      severity: rule.severity,
      enabled: rule.enabled,
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
          ? String(
              (err as { response?: { data?: { error?: string } } }).response
                ?.data?.error,
            )
          : "Request failed"
      toast.error(msg || "Request failed")
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-xl w-[420px] max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">
          {isEdit ? "Edit Rule" : "Create Rule"}
        </h2>

        <form onSubmit={submit} className="space-y-3">
          <input
            name="deviceId"
            placeholder="Device ID"
            value={rule.deviceId}
            onChange={handleChange}
            disabled={isEdit}
            className="border p-2 w-full rounded disabled:bg-gray-100"
            required
          />

          <input
            name="metricName"
            placeholder="Metric name"
            value={rule.metricName}
            onChange={handleChange}
            disabled={isEdit}
            className="border p-2 w-full rounded disabled:bg-gray-100"
            required
          />

          <input
            name="minValue"
            type="number"
            step="any"
            placeholder="Min"
            value={rule.minValue}
            onChange={handleChange}
            className="border p-2 w-full rounded"
            required
          />

          <input
            name="maxValue"
            type="number"
            step="any"
            placeholder="Max"
            value={rule.maxValue}
            onChange={handleChange}
            className="border p-2 w-full rounded"
            required
          />

          <input
            name="packetThreshold"
            type="number"
            min={1}
            step={1}
            placeholder="Packet threshold"
            value={rule.packetThreshold}
            onChange={handleChange}
            className="border p-2 w-full rounded"
          />

          <input
            name="durationMinutes"
            type="number"
            min={0}
            step={1}
            placeholder="Duration (minutes), 0 = immediate"
            value={rule.durationMinutes}
            onChange={handleChange}
            className="border p-2 w-full rounded"
          />

          <select
            name="severity"
            value={rule.severity}
            onChange={handleChange}
            className="border p-2 w-full rounded"
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-medium text-gray-700">Enable rule</span>
            <input
              type="checkbox"
              name="enabled"
              checked={rule.enabled}
              onChange={handleChange}
              className="w-5 h-5"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 border rounded">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">
              {isEdit ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
