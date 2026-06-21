"use client"

import { Pencil, Trash2, ShieldCheck, Square, CheckCircle2 } from "lucide-react"
import type { RuleRow } from "@/types/entities"

const severityStyle: Record<string, string> = {
  HIGH:   "bg-red-50 text-red-700",
  MEDIUM: "bg-orange-50 text-orange-700",
  LOW:    "bg-green-50 text-green-700",
}

export default function RuleTable({
  rules,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  rules: RuleRow[]
  selected?: Set<number>
  onToggle?: (id: number) => void
  onEdit: (rule: RuleRow) => void
  onDelete: (rule: RuleRow) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {onToggle && <th className="px-4 py-3 w-10" />}
            <th className="px-5 py-3">Device</th>
            <th className="px-5 py-3">Metric</th>
            <th className="px-5 py-3">Min</th>
            <th className="px-5 py-3">Max</th>
            <th className="px-5 py-3">Trigger</th>
            <th className="px-5 py-3">Threshold</th>
            <th className="px-5 py-3">Duration</th>
            <th className="px-5 py-3">Severity</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rules.length === 0 && (
            <tr>
              <td colSpan={onToggle ? 11 : 10} className="py-12 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck size={24} className="text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium">No rules configured</p>
                <p className="text-slate-400 text-sm mt-1">Add a rule to start monitoring your devices</p>
              </td>
            </tr>
          )}
          {rules.map((rule) => (
            <tr key={rule.id}
              className={`hover:bg-slate-50/70 transition ${selected?.has(rule.id) ? "bg-teal-50/40" : ""}`}>
              {onToggle && (
                <td className="px-4 py-3">
                  <button onClick={() => onToggle(rule.id)} className="text-slate-400 hover:text-teal-600 transition">
                    {selected?.has(rule.id)
                      ? <CheckCircle2 size={15} className="text-teal-600" />
                      : <Square size={15} />}
                  </button>
                </td>
              )}
              <td className="px-5 py-3.5 font-medium text-slate-800">{rule.device_id}</td>
              <td className="px-5 py-3.5 text-slate-600">{rule.metric_name}</td>
              <td className="px-5 py-3.5 font-mono text-sm text-slate-700">{rule.min_value}</td>
              <td className="px-5 py-3.5 font-mono text-sm text-slate-700">{rule.max_value}</td>
              <td className="px-5 py-3.5">
                {(() => {
                  const mode = rule.trigger_mode ?? "BOTH"
                  const style: Record<string, string> = {
                    PACKET_ONLY:   "bg-blue-50 text-blue-700",
                    DURATION_ONLY: "bg-purple-50 text-purple-700",
                    BOTH:          "bg-teal-50 text-teal-700",
                  }
                  const label: Record<string, string> = {
                    PACKET_ONLY:   "Packet",
                    DURATION_ONLY: "Duration",
                    BOTH:          "Both",
                  }
                  return (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${style[mode] ?? "bg-slate-100 text-slate-600"}`}>
                      {label[mode] ?? mode}
                    </span>
                  )
                })()}
              </td>
              <td className="px-5 py-3.5 text-slate-600">
                {rule.trigger_mode === "DURATION_ONLY" ? "—" : rule.packet_threshold}
              </td>
              <td className="px-5 py-3.5 text-slate-600">
                {rule.trigger_mode === "PACKET_ONLY" ? "—" : `${rule.duration_minutes ?? 0}m`}
              </td>
              <td className="px-5 py-3.5">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${severityStyle[rule.severity] ?? "bg-slate-100 text-slate-600"}`}>
                  {rule.severity}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full
                  ${rule.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${rule.enabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {rule.enabled ? "Active" : "Disabled"}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => onEdit(rule)} title="Edit"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => onDelete(rule)} title="Delete"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
