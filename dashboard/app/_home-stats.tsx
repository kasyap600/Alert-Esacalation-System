"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import api from "@/services/api"

export default function HomeStats() {
  const [devices, setDevices] = useState<number | null>(null)
  const [rules, setRules] = useState<number | null>(null)
  const [openAlerts, setOpenAlerts] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const [d, r, a] = await Promise.all([
          api.get("/devices"),
          api.get("/rules"),
          api.get("/alerts"),
        ])
        if (cancelled) return
        setDevices(Array.isArray(d.data) ? d.data.length : 0)
        setRules(Array.isArray(r.data) ? r.data.length : 0)
        const alerts = Array.isArray(a.data) ? a.data : []
        setOpenAlerts(alerts.filter((x: { status?: string }) => x.status === "OPEN").length)
      } catch {
        if (!cancelled) {
          setDevices(null)
          setRules(null)
          setOpenAlerts(null)
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const card = (
    label: string,
    value: number | null,
    href: string,
  ) => (
    <Link
      href={href}
      className="bg-white border border-gray-100 shadow-sm rounded-xl p-6 hover:border-blue-200 transition"
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-semibold text-gray-800 mt-1">
        {value === null ? "—" : value}
      </p>
    </Link>
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {card("Devices", devices, "/devices")}
      {card("Rules", rules, "/rules")}
      {card("Open alerts", openAlerts, "/alerts")}
    </div>
  )
}
