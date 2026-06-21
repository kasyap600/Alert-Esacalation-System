import { type NextRequest, NextResponse } from "next/server"

const backendOrigin =
  process.env.BACKEND_ORIGIN?.replace(/\/$/, "") || "http://127.0.0.1:5000"

export async function GET(_req: NextRequest) {
  try {
    const headers: Record<string, string> = {}
    const key = process.env.ADMIN_API_KEY
    if (key) headers["x-api-key"] = key

    const res = await fetch(`${backendOrigin}/metrics`, { headers })
    if (!res.ok) {
      return NextResponse.json(null, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(null, { status: 502 })
  }
}
