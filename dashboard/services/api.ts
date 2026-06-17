import axios, { type AxiosInstance } from "axios"

/**
 * In the browser, default to same-origin `/api` so Next.js can proxy to the backend (no CORS).
 * Set NEXT_PUBLIC_API_BASE to call the API directly (then configure backend CORS).
 * Server-side (if used): point at BACKEND_ORIGIN or localhost.
 */
function resolveBaseURL(): string {
  const explicit = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "")
  if (explicit) return explicit

  if (typeof window !== "undefined") {
    return "/api"
  }

  const origin = process.env.BACKEND_ORIGIN?.replace(/\/$/, "") || "http://127.0.0.1:5000"
  return `${origin}/api`
}

const baseURL = resolveBaseURL()

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL,
    headers: {
      "Content-Type": "application/json",
    },
  })

  const key = process.env.NEXT_PUBLIC_ADMIN_API_KEY
  if (key) {
    client.interceptors.request.use((config) => {
      config.headers["x-api-key"] = key
      return config
    })
  }

  return client
}

const api = createClient()

export default api

export { baseURL }
