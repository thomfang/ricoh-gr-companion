import { AppError } from "./app-error"
import type { SafeCameraProfile } from "./ricoh-ble"
import type { CameraIdentity } from "./models"
import { identifyCameraModel } from "./models"

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function peripheralUnavailableError(): AppError { return new AppError("peripheral-unavailable") }

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

export function formatReadValue(data: Data): { text?: string; hex: string } {
  const text = (data.toDecodedString("utf8") ?? "").replace(/\u0000/g, "").trim()
  const isPrintable = text.length > 0 && /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(text)
  return { text: isPrintable ? text : undefined, hex: data.toHexString() }
}

export function operationModeCode(profile: SafeCameraProfile): "capture" | "playback" | "ble-startup" | "other" | "power-off-transfer" | "unknown" {
  switch (profile.operationMode) {
    case 0x00: return "capture"
    case 0x01: return "playback"
    case 0x02: return "ble-startup"
    case 0x03: return "other"
    case 0x04: return "power-off-transfer"
    default: return "unknown"
  }
}

export function parseProfileIdentity(profile: SafeCameraProfile): CameraIdentity {
  const rawModel = profile.model?.trim() || "RICOH GR"
  const firmware = profile.firmware?.trim() || undefined
  return { model: identifyCameraModel(rawModel), displayModel: rawModel, firmware }
}

export function profileIdentityParts(profile: SafeCameraProfile): { model: string; firmware: string } {
  const identity = parseProfileIdentity(profile)
  return { model: identity.displayModel, firmware: identity.firmware ?? "" }
}
