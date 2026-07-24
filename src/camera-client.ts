import { fetch, type AbortSignal } from "scripting"
import type { CameraApiProfile } from "./camera-profile"

export type CameraRequestOptions = {
  signal?: AbortSignal
  timeout?: number
  debugLabel?: string
}

export class CameraHttpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = "CameraHttpError"
  }
}

export function cameraUrl(profile: CameraApiProfile, path: string, query: Record<string, string | number | undefined> = {}): string {
  const parameters = Object.entries(query)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&")
  return `${profile.baseUrl}${path}${parameters ? `?${parameters}` : ""}`
}

export function photoPath(profile: CameraApiProfile, folder: string, file: string): string {
  return profile.originalPath({ folder, file })
}

export function cameraGet(
  profile: CameraApiProfile,
  path: string,
  query: Record<string, string | number | undefined> = {},
  options: CameraRequestOptions = {},
): ReturnType<typeof fetch> {
  return fetch(cameraUrl(profile, path, query), {
    method: "GET",
    allowInsecureRequest: true,
    timeout: options.timeout ?? 15,
    signal: options.signal,
    debugLabel: options.debugLabel,
  })
}

export function ensureSuccessfulResponse(response: { ok: boolean; status: number; statusText: string }, operation: string): void {
  if (!response.ok) throw new CameraHttpError(`${operation}: HTTP ${response.status} ${response.statusText}`, response.status)
}

export function contentLength(response: { headers: { get(name: string): string | null } }): number | undefined {
  const raw = response.headers.get("content-length")
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}
