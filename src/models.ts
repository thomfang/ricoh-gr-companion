export type CameraModel = "GR III" | "GR IIIx" | "GR IV" | "unknown"

export type DiscoveredCamera = {
  id: string
  name: string
  rssi: number
  connectable: boolean
  advertisedServices: string[]
}

export type CameraIdentity = {
  model: CameraModel
  displayModel: string
  firmware?: string
}

export const MODELS: CameraModel[] = ["GR III", "GR IIIx", "GR IV", "unknown"]

export function identifyCameraModel(value: string): CameraModel {
  const normalized = value.toUpperCase().replace(/\s+/g, " ")
  if (normalized.includes("GR IV")) return "GR IV"
  if (normalized.includes("GR IIIX") || normalized.includes("GR III X")) return "GR IIIx"
  if (normalized.includes("GR III")) return "GR III"
  return "unknown"
}
