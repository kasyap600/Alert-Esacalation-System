"use client"

import { useCallback, useEffect, useState } from "react"
import RuleTable from "@/components/RuleTable"
import RuleForm from "@/components/RuleForm"
import api from "@/services/api"
import { Plus, Search, RefreshCw, ChevronLeft, ChevronRight, CheckSquare, Square, Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import type { RuleRow } from "@/types/entities"

const PAGE_SIZE = 25

interface Pagination {
  total: number
  page: number
  limit: number
  pages: number
}

export default function RulesPage() {
  const [allRules, setAllRules]     = useState<RuleRow[]>([])
  const [rules, setRules]           = useState<RuleRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: PAGE_SIZE, pages: 1 })
  const [loading, setLoading]       = useState(true)
  const [query, setQuery]           = useState("")
  const [page, setPage]             = useState(1)
  const [open, setOpen]             = useState(false)
  const [editingRule, setEditingRule] = useState<RuleRow | null>(null)
  const [clientSide, setClientSide] = useState(false)
  const [selected, setSelected]     = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const loadRules = useCallback(async (targetPage = 1) => {
    setLoading(true)
    setSelected(new Set())
    try {
      const { data } = await api.get<{ data: RuleRow[]; pagination: Pagination } | RuleRow[]>(
        "/rules", { params: { page: targetPage, limit: PAGE_SIZE } }
      )
      if (Array.isArray(data)) {
        setClientSide(true)
        setAllRules(data)
        const total = data.length
        const pages = Math.ceil(total / PAGE_SIZE)
        const start = (targetPage - 1) * PAGE_SIZE
        setRules(data.slice(start, start + PAGE_SIZE))
        setPagination({ total, page: targetPage, limit: PAGE_SIZE, pages })
      } else {
        setClientSide(false)
        setAllRules([])
        setRules(data.data ?? [])
        setPagination(data.pagination)
      }
    } catch (e) {
      console.error(e)
      toast.error("Failed to load rules")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRules(1) }, [loadRules])

  const goToPage = (p: number) => {
    setPage(p)
    if (clientSide) {
      const start = (p - 1) * PAGE_SIZE
      setRules(allRules.slice(start, start + PAGE_SIZE))
      setPagination((prev) => ({ ...prev, page: p }))
      setSelected(new Set())
    } else {
      loadRules(p)
    }
  }

  const handleSaved = () => {
    loadRules(page)
    toast.success(editingRule ? "Rule updated" : "Rule created")
  }

  const handleDelete = async (rule: RuleRow) => {
    if (!confirm(`Delete rule #${rule.id} for ${rule.metric_name}?`)) return
    try {
      await api.delete(`/rules/${rule.id}`)
      toast.success("Rule deleted")
      loadRules(page)
    } catch (err) {
      console.error("Failed to delete rule:", err)
      toast.error("Failed to delete rule")
    }
  }

  const filtered = rules.filter((rule) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      rule.device_id.toLowerCase().includes(q) ||
      rule.metric_name.toLowerCase().includes(q) ||
      rule.severity.toLowerCase().includes(q)
    )
  })

  // Bulk selection
  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id))
  const someSelected = selected.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(r => r.id)))
    }
  }

  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} rule${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return
    setBulkDeleting(true)
    try {
      const results = await Promise.allSettled([...selected].map(id => api.delete(`/rules/${id}`)))
      const failed = results.filter(r => r.status === "rejected").length
      const succeeded = results.length - failed
      if (failed === 0) {
        toast.success(`${succeeded} rule${succeeded > 1 ? "s" : ""} deleted`)
      } else if (succeeded === 0) {
        toast.error("All deletes failed — check permissions")
      } else {
        toast.error(`${succeeded} deleted, ${failed} failed`)
      }
      loadRules(page)
    } catch (err) {
      console.error("Bulk delete error:", err)
      toast.error("Bulk delete failed")
    } finally {
      setBulkDeleting(false)
    }
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
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-600 mb-1">Configuration</p>
          <h1 className="text-3xl font-bold text-slate-800">Rules</h1>
          <p className="text-slate-500 text-sm mt-1">Define threshold rules for your IoT devices</p>
        </div>
        <button
          onClick={() => { setEditingRule(null); setOpen(true) }}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition"
        >
          <Plus size={16} /> Add Rule
        </button>
      </div>

      {/* Search + refresh */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by device, metric, or severity..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <button onClick={() => loadRules(page)}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="bg-slate-800 rounded-2xl px-5 py-3 flex items-center gap-4">
          <span className="text-white text-sm font-semibold">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={bulkDelete} disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition disabled:opacity-60">
              <Trash2 size={13} />
              {bulkDeleting ? "Deleting..." : `Delete ${selected.size}`}
            </button>
            <button onClick={() => setSelected(new Set())} disabled={bulkDeleting}
              className="px-4 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold rounded-lg transition">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading rules...</p>
          </div>
        ) : (
          <>
            {/* Select-all header */}
            {filtered.length > 0 && (
              <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                <button onClick={toggleAll} className="text-slate-400 hover:text-teal-600 transition flex items-center gap-2 text-xs font-medium">
                  {allSelected
                    ? <CheckSquare size={15} className="text-teal-600" />
                    : <Square size={15} />}
                  {allSelected ? "Deselect all" : `Select all ${filtered.length}`}
                </button>
              </div>
            )}

            <RuleTable
              rules={filtered}
              selected={selected}
              onToggle={toggleOne}
              onEdit={(r) => { setEditingRule(r); setOpen(true) }}
              onDelete={handleDelete}
            />

            {total > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  Showing <span className="font-semibold text-slate-700">{from}–{to}</span> of{" "}
                  <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> rules
                  {someSelected && <span className="ml-2 text-teal-600 font-semibold">· {selected.size} selected</span>}
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

      {open && (
        <RuleForm
          existingRule={editingRule}
          onSaved={handleSaved}
          onClose={() => { setOpen(false); setEditingRule(null) }}
        />
      )}
    </div>
  )
}
