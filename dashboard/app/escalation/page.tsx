"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"

type RuleOpt = { id: number; device_id: string; metric_name: string }

type PolicyRow = {
  rule_id: number
  level: number
  escalate_after_minutes: number
  notify_via: string
  notify_to: string
}

export default function EscalationPage() {
  const [rules, setRules] = useState<RuleOpt[]>([])
  const [policies, setPolicies] = useState<PolicyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    ruleId: "",
    level: "1",
    escalateAfterMinutes: "30",
    notifyVia: "EMAIL",
    notifyTo: "",
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, p] = await Promise.all([
        api.get("/rules"),
        api.get("/admin/escalation-policies"),
      ])
      setRules(Array.isArray(r.data) ? r.data : [])
      setPolicies(Array.isArray(p.data) ? p.data : [])
    } catch {
      toast.error("Failed to load escalation data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.ruleId || !form.notifyTo) {
      toast.error("Rule and notify target are required")
      return
    }
    try {
      await api.post("/admin/escalation-policy", {
        ruleId: Number(form.ruleId),
        level: Number(form.level),
        escalateAfterMinutes: Number(form.escalateAfterMinutes),
        notifyVia: form.notifyVia,
        notifyTo: form.notifyTo,
      })
      toast.success("Escalation level added")
      setForm((f) => ({ ...f, notifyTo: "" }))
      load()
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data
              ?.error
          : null
      toast.error(typeof msg === "string" ? msg : "Create failed")
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-gray-800">Escalation</h1>
        <p className="text-gray-500 text-sm mt-1">
          View policies and add escalation levels for a rule (admin API)
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl">
        <h2 className="text-lg font-semibold mb-4">Add escalation level</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Rule</label>
            <select
              value={form.ruleId}
              onChange={(e) =>
                setForm((f) => ({ ...f, ruleId: e.target.value }))
              }
              className="border rounded w-full p-2"
              required
            >
              <option value="">Select rule</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} — {r.device_id} / {r.metric_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Level</label>
              <input
                type="number"
                min={0}
                value={form.level}
                onChange={(e) =>
                  setForm((f) => ({ ...f, level: e.target.value }))
                }
                className="border rounded w-full p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                After (minutes)
              </label>
              <input
                type="number"
                min={1}
                value={form.escalateAfterMinutes}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    escalateAfterMinutes: e.target.value,
                  }))
                }
                className="border rounded w-full p-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Notify via</label>
            <select
              value={form.notifyVia}
              onChange={(e) =>
                setForm((f) => ({ ...f, notifyVia: e.target.value }))
              }
              className="border rounded w-full p-2"
            >
              <option value="EMAIL">EMAIL</option>
              <option value="SMS">SMS</option>
              <option value="SLACK">SLACK</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Notify to (email / phone / webhook)
            </label>
            <input
              value={form.notifyTo}
              onChange={(e) =>
                setForm((f) => ({ ...f, notifyTo: e.target.value }))
              }
              className="border rounded w-full p-2"
              placeholder="e.g. ops@company.com"
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Save policy
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-semibold">Configured policies</h2>
          <button
            type="button"
            onClick={load}
            className="text-sm px-3 py-1 border rounded"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="p-6 text-gray-500">Loading…</p>
        ) : policies.length === 0 ? (
          <p className="p-8 text-center text-gray-500">
            No escalation policies yet
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-4">Rule ID</th>
                <th className="p-4">Level</th>
                <th className="p-4">After (min)</th>
                <th className="p-4">Via</th>
                <th className="p-4">To</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p, i) => (
                <tr key={`${p.rule_id}-${p.level}-${i}`} className="border-b">
                  <td className="p-4 font-mono">{p.rule_id}</td>
                  <td className="p-4">{p.level}</td>
                  <td className="p-4">{p.escalate_after_minutes}</td>
                  <td className="p-4">{p.notify_via}</td>
                  <td className="p-4 break-all">{p.notify_to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
