"use client"

import { useCallback, useEffect, useState } from "react"
import RuleTable from "@/components/RuleTable"
import RuleForm from "@/components/RuleForm"
import api from "@/services/api"
import { Plus } from "lucide-react"
import toast from "react-hot-toast"
import type { RuleRow } from "@/types/entities"

export default function RulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RuleRow | null>(null)

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<RuleRow[]>("/rules")
      setRules(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      toast.error("Failed to load rules")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const handleSaved = () => {
    loadRules()
    toast.success(editingRule ? "Rule updated" : "Rule created")
  }

  const handleDelete = async (rule: RuleRow) => {
    if (!confirm(`Delete rule #${rule.id} for ${rule.metric_name}?`)) return
    try {
      await api.delete(`/rules/${rule.id}`)
      toast.success("Rule deleted")
      loadRules()
    } catch {
      toast.error("Failed to delete rule")
    }
  }

  const filteredRules = rules.filter((rule) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      rule.device_id.toLowerCase().includes(q) ||
      rule.metric_name.toLowerCase().includes(q) ||
      rule.severity.toLowerCase().includes(q)
    )
  })

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-800">Rules</h1>
          <p className="text-gray-500 text-sm mt-1">
            Create, edit, and delete monitoring thresholds
          </p>
        </div>

        <button
          onClick={() => {
            setEditingRule(null)
            setOpen(true)
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 transition text-white px-4 py-2.5 rounded-lg shadow-sm"
        >
          <Plus size={18} />
          Add Rule
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by device, metric, severity..."
            className="border rounded px-3 py-2 w-full max-w-sm"
          />
          <button
            type="button"
            onClick={loadRules}
            className="px-3 py-2 border rounded text-sm"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="p-6 text-gray-500">Loading rules...</p>
        ) : (
          <RuleTable
            rules={filteredRules}
            onEdit={(r) => {
              setEditingRule(r)
              setOpen(true)
            }}
            onDelete={handleDelete}
          />
        )}
      </div>

      {open && (
        <RuleForm
          existingRule={editingRule}
          onSaved={handleSaved}
          onClose={() => {
            setOpen(false)
            setEditingRule(null)
          }}
        />
      )}
    </div>
  )
}
