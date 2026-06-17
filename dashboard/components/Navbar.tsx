"use client"

import Link from "next/link"

export default function Navbar() {
  return (
    <div className="w-full bg-black text-white p-4 flex justify-between">

      <h1 className="text-xl font-bold">
        IoT Dashboard
      </h1>

      <div className="flex gap-6">

        <Link href="/">Dashboard</Link>

        <Link href="/rules">Rules</Link>

      </div>

    </div>
  )
}