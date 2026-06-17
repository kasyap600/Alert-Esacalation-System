"use client"

import { useCallback, useEffect, useState } from "react"
import api from "@/services/api"
import { getBackendOrigin } from "@/lib/backendOrigin"
import toast from "react-hot-toast"

type QueueHealth = {
  stream?: string
  streamLength?: number
  dlq?: { length?: number }
  notificationDlq?: { length?: number }
  pending?: { count?: number }
  checkedAt?: string
}

export default function TelemetryPage() {
  const [queue, setQueue] = useState<QueueHealth | null>(null)
  const [metrics, setMetrics] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = await api.get<QueueHealth>("/admin/queue-health")
      setQueue(q.data)

      const origin = getBackendOrigin()
      const headers: Record<string, string> = {}
      const key = process.env.NEXT_PUBLIC_ADMIN_API_KEY
      if (key) headers["x-api-key"] = key

      const mRes = await fetch(`${origin}/metrics`, { headers })
      if (mRes.ok) {
        setMetrics(await mRes.json())
      } else {
        setMetrics(null)
      }
    } catch {
      toast.error("Failed to load telemetry / queue info")
      setQueue(null)
      setMetrics(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const ingestUrl = `${getBackendOrigin()}/api/ingest`

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-gray-800">Telemetry</h1>
        <p className="text-gray-500 text-sm mt-1">
          Ingestion endpoint and pipeline health
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
        <h2 className="font-semibold">Ingest</h2>
        <p className="text-sm text-gray-600">
          Devices send telemetry to this URL (see backend for auth headers):
        </p>
        <code className="block bg-gray-100 p-3 rounded text-sm break-all">
          POST {ingestUrl}
        </code>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Queue health</h2>
          <button
            type="button"
            onClick={load}
            className="text-sm px-3 py-1 border rounded"
          >
            Refresh
          </button>
        </div>
        {loading && !queue ? (
          <p className="text-gray-500">Loading…</p>
        ) : queue ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-500">Persist stream length</dt>
              <dd className="font-mono">{queue.streamLength ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Telemetry DLQ</dt>
              <dd className="font-mono">{queue.dlq?.length ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Notification DLQ</dt>
              <dd className="font-mono">{queue.notificationDlq?.length ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Pending (consumer group)</dt>
              <dd className="font-mono">{queue.pending?.count ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Checked</dt>
              <dd>{queue.checkedAt ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-gray-500">No data</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold mb-2">Process metrics snapshot</h2>
        <p className="text-xs text-gray-500 mb-3">
          From <code className="bg-gray-100 px-1 rounded">GET /metrics</code>{" "}
          (may require auth in production).
        </p>
        {metrics ? (
          <pre className="bg-gray-50 p-4 rounded text-xs overflow-x-auto max-h-96">
            {JSON.stringify(metrics, null, 2)}
          </pre>
        ) : (
          <p className="text-gray-500 text-sm">Not available or unauthorized</p>
        )}
      </div>
    </div>
  )
}
