/** Base URL for non-`/api` routes (e.g. `/metrics`, `/health`). */
export function getBackendOrigin(): string {
  const base =
    process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5000/api"
  const trimmed = base.replace(/\/$/, "")
  const withoutApi = trimmed.replace(/\/api$/, "")
  return withoutApi || "http://localhost:5000"
}
