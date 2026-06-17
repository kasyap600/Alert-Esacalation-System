"use client"
import type { RuleRow } from "@/types/entities"

export default function RuleTable({
  rules,
  onEdit,
  onDelete,
}: {
  rules: RuleRow[]
  onEdit: (rule: RuleRow) => void
  onDelete: (rule: RuleRow) => void
}) {
  if (!rules || rules.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No rules configured
      </div>
    )
  }

  return (
    <table className="w-full">
      <thead className="border-b bg-gray-50">
        <tr className="text-left text-sm text-gray-600">
          <th className="p-4">Device</th>
          <th className="p-4">Metric</th>
          <th className="p-4">Min</th>
          <th className="p-4">Max</th>
          <th className="p-4">Threshold</th>
          <th className="p-4">Duration (m)</th>
          <th className="p-4">Severity</th>
          <th className="p-4">Status</th>
          <th className="p-4 text-right">Actions</th>
        </tr>
      </thead>

      <tbody>
        {rules.map((rule) => (
          <tr key={rule.id} className="border-b hover:bg-gray-50">
            <td className="p-4 font-medium">{rule.device_id}</td>
            <td className="p-4">{rule.metric_name}</td>
            <td className="p-4">{rule.min_value}</td>
            <td className="p-4">{rule.max_value}</td>
            <td className="p-4">{rule.packet_threshold}</td>
            <td className="p-4">{rule.duration_minutes ?? 0}</td>
            <td className="p-4">
              <span
                className={`
                px-2 py-1 rounded text-xs
                ${
                  rule.severity === "HIGH"
                    ? "bg-red-100 text-red-600"
                    : rule.severity === "MEDIUM"
                      ? "bg-orange-100 text-orange-600"
                      : "bg-green-100 text-green-600"
                }
              `}
              >
                {rule.severity}
              </span>
            </td>
            <td className="p-4">
              {rule.enabled ? (
                <span className="text-green-600">Active</span>
              ) : (
                <span className="text-gray-400">Disabled</span>
              )}
            </td>
            <td className="p-4 text-right space-x-2">
              <button
                type="button"
                onClick={() => onEdit(rule)}
                className="text-blue-600 hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(rule)}
                className="text-red-600 hover:underline"
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
