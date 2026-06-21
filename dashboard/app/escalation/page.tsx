"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import { GitBranch, RefreshCw, Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight } from "lucide-react"

type RuleOpt = { id: number; device_id: string; metric_name: string }

type PolicyRow = {
  id: number
  rule_id: number
  level: number
  escalate_after_minutes: number
  notify_via: string
  notify_to: string
}

type RuleGroup = {
  rule: RuleOpt
  policies: PolicyRow[]
  expanded: boolean
}

const channelStyle: Record<string, string> = {
  EMAIL: "bg-blue-50 text-blue-700",
}

const emptyForm = { ruleId: "", level: "0", escalateAfterMinutes: "30", notifyVia: "EMAIL", notifyTo: "" }

export default function EscalationPage() {
  const [rules, setRules]         = useState<RuleOpt[]>([])
  const [groups, setGroups]       = useState<RuleGroup[]>([])
  const [loading, setLoading]     = useState(true)
  const [ruleFilter, setRuleFilter] = useState("")
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  // edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm]   = useState({ escalateAfterMinutes: "", notifyTo: "" })

  const buildGroups = useCallback((rules: RuleOpt[], policies: PolicyRow[], existing: RuleGroup[]) => {
    const expandedSet = new Set(existing.filter(g => g.expanded).map(g => g.rule.id))
    const policyMap = new Map<number, PolicyRow[]>()
    policies.forEach(p => {
      if (!policyMap.has(p.rule_id)) policyMap.set(p.rule_id, [])
      policyMap.get(p.rule_id)!.push(p)
    })
    // only show rules that have at least one policy, plus all rules for the dropdown
    const rulesWithPolicies = rules.filter(r => policyMap.has(r.id))
    return rulesWithPolicies.map(r => ({
      rule: r,
      policies: (policyMap.get(r.id) ?? []).sort((a, b) => a.level - b.level),
      expanded: expandedSet.has(r.id) || rulesWithPolicies.length <= 5,
    }))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, p] = await Promise.all([
        api.get("/rules", { params: { limit: 200 } }),
        api.get("/admin/escalation-policies"),
      ])
      const rData = r.data
      const fetchedRules: RuleOpt[] = Array.isArray(rData) ? rData : (rData?.data ?? [])
      const fetchedPolicies: PolicyRow[] = Array.isArray(p.data) ? p.data : []
      setRules(fetchedRules)
      setGroups(prev => buildGroups(fetchedRules, fetchedPolicies, prev))
    } catch (err) {
      console.error("Failed to load escalation data:", err)
      toast.error("Failed to load escalation data")
    } finally {
      setLoading(false)
    }
  }, [buildGroups])

  useEffect(() => { load() }, [load])

  const toggleGroup = (ruleId: number) => {
    setGroups(prev => prev.map(g => g.rule.id === ruleId ? { ...g, expanded: !g.expanded } : g))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.ruleId || !form.notifyTo) { toast.error("Rule and notify target are required"); return }
    setSubmitting(true)
    try {
      await api.post("/admin/escalation-policy", {
        ruleId: Number(form.ruleId),
        level: Number(form.level),
        escalateAfterMinutes: Number(form.escalateAfterMinutes),
        notifyVia: form.notifyVia,
        notifyTo: form.notifyTo,
      })
      toast.success("Escalation level added")
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      toast.error(typeof msg === "string" ? msg : "Create failed")
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (p: PolicyRow) => {
    setEditingId(p.id)
    setEditForm({ escalateAfterMinutes: String(p.escalate_after_minutes), notifyTo: p.notify_to })
  }

  const saveEdit = async (p: PolicyRow) => {
    try {
      await api.put(`/admin/escalation-policy/${p.id}`, {
        escalateAfterMinutes: Number(editForm.escalateAfterMinutes),
        notifyVia: p.notify_via,
        notifyTo: editForm.notifyTo,
      })
      toast.success("Policy updated")
      setEditingId(null)
      load()
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      toast.error(typeof msg === "string" ? msg : "Update failed")
    }
  }

  const deletePolicy = async (id: number) => {
    if (!confirm("Delete this escalation level?")) return
    try {
      await api.delete(`/admin/escalation-policy/${id}`)
      toast.success("Policy deleted")
      load()
    } catch (err) { console.error("Delete policy failed:", err); toast.error("Delete failed") }
  }

  const filteredGroups = ruleFilter
    ? groups.filter(g => String(g.rule.id) === ruleFilter)
    : groups

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide"

  const totalPolicies = groups.reduce((s, g) => s + g.policies.length, 0)

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-600 mb-1">Configuration</p>
          <h1 className="text-3xl font-bold text-slate-800">Escalation</h1>
          <p className="text-slate-500 text-sm mt-1">Define who gets notified and when if alerts go unacknowledged</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load}
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 transition">
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={() => { setShowForm(v => !v); setForm(emptyForm) }}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
            {showForm ? <X size={15} /> : <Plus size={15} />}
            {showForm ? "Cancel" : "Add Level"}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm">
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Add escalation level</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configure a notification step for an existing rule</p>
          </div>
          <form onSubmit={submit} className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-3 sm:col-span-2">
              <label className={labelCls}>Rule</label>
              <select value={form.ruleId} onChange={(e) => setForm(f => ({ ...f, ruleId: e.target.value }))}
                className={inputCls} required>
                <option value="">Select a rule...</option>
                {rules.map(r => (
                  <option key={r.id} value={r.id}>#{r.id} — {r.device_id} / {r.metric_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Level</label>
              <input type="number" min={0} value={form.level}
                onChange={(e) => setForm(f => ({ ...f, level: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>After (minutes)</label>
              <input type="number" min={1} value={form.escalateAfterMinutes}
                onChange={(e) => setForm(f => ({ ...f, escalateAfterMinutes: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Notify via</label>
              <select value={form.notifyVia} onChange={(e) => setForm(f => ({ ...f, notifyVia: e.target.value }))}
                className={inputCls}>
                <option value="EMAIL">EMAIL</option>
              </select>
            </div>
            <div className="lg:col-span-2 sm:col-span-2">
              <label className={labelCls}>Notify to (email)</label>
              <input type="email" value={form.notifyTo}
                onChange={(e) => setForm(f => ({ ...f, notifyTo: e.target.value }))}
                placeholder="ops@company.com" className={inputCls} required />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={submitting}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-60">
                {submitting ? "Saving..." : "Save Policy"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <select value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 flex-1 min-w-[200px]">
          <option value="">All rules ({groups.length})</option>
          {groups.map(g => (
            <option key={g.rule.id} value={g.rule.id}>
              #{g.rule.id} — {g.rule.device_id} / {g.rule.metric_name} ({g.policies.length} levels)
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400 ml-auto">
          {totalPolicies} total {totalPolicies === 1 ? "level" : "levels"} across {groups.length} {groups.length === 1 ? "rule" : "rules"}
        </p>
      </div>

      {/* Policy groups */}
      {loading ? (
        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-12 text-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <GitBranch size={22} className="text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm">No escalation policies configured</p>
          <p className="text-slate-400 text-xs mt-1">Click "Add Level" to create the first one</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map(g => (
            <div key={g.rule.id} className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm overflow-hidden">

              {/* Rule header — clickable to expand/collapse */}
              <button onClick={() => toggleGroup(g.rule.id)}
                className="w-full px-5 py-4 flex items-center gap-3 hover:bg-slate-50 transition text-left">
                {g.expanded
                  ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
                  : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-400">#{g.rule.id}</span>
                    <span className="font-semibold text-slate-800">{g.rule.device_id}</span>
                    <span className="text-slate-400">/</span>
                    <span className="text-slate-600">{g.rule.metric_name}</span>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full shrink-0">
                  {g.policies.length} {g.policies.length === 1 ? "level" : "levels"}
                </span>
              </button>

              {/* Policies table */}
              {g.expanded && (
                <div className="border-t border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="px-5 py-2.5">Level</th>
                        <th className="px-5 py-2.5">After</th>
                        <th className="px-5 py-2.5">Via</th>
                        <th className="px-5 py-2.5">Notify To</th>
                        <th className="px-5 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {g.policies.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-5 py-3">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">
                              L{p.level}
                            </span>
                          </td>

                          {/* After (editable) */}
                          <td className="px-5 py-3">
                            {editingId === p.id ? (
                              <input type="number" min={1} value={editForm.escalateAfterMinutes}
                                onChange={(e) => setEditForm(f => ({ ...f, escalateAfterMinutes: e.target.value }))}
                                className="w-20 border border-teal-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500" />
                            ) : (
                              <span className="text-slate-600">{p.escalate_after_minutes}m</span>
                            )}
                          </td>

                          <td className="px-5 py-3">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${channelStyle[p.notify_via] ?? "bg-slate-100 text-slate-600"}`}>
                              {p.notify_via}
                            </span>
                          </td>

                          {/* Notify to (editable) */}
                          <td className="px-5 py-3 text-slate-600 text-xs">
                            {editingId === p.id ? (
                              <input type="email" value={editForm.notifyTo}
                                onChange={(e) => setEditForm(f => ({ ...f, notifyTo: e.target.value }))}
                                className="w-48 border border-teal-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500" />
                            ) : (
                              <span className="break-all">{p.notify_to}</span>
                            )}
                          </td>

                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {editingId === p.id ? (
                                <>
                                  <button onClick={() => saveEdit(p)} title="Save"
                                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition">
                                    <Check size={14} />
                                  </button>
                                  <button onClick={() => setEditingId(null)} title="Cancel"
                                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">
                                    <X size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => startEdit(p)} title="Edit"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition">
                                    <Pencil size={14} />
                                  </button>
                                  <button onClick={() => deletePolicy(p.id)} title="Delete"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
