import { NextRequest, NextResponse } from "next/server"

export function middleware(request: NextRequest) {
  // Only inject the backend API key for server-side proxy routes (not public
  // Next.js API routes like /api/metrics which are handled by the app itself).
  const key = process.env.ADMIN_API_KEY
  if (!key) return NextResponse.next()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-api-key", key)

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

// Restrict to the backend proxy prefix only — keeps the key out of any other
// /api/* routes that don't need it.
export const config = {
  matcher: "/api/proxy/:path*",
}
