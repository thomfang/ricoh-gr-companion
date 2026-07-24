import type { CameraIdentity } from "./models"
import { identifyCameraModel } from "./models"

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

export function formatReadValue(data: Data): string {
  const text = (data.toDecodedString("utf8") ?? "").replace(/\u0000/g, "").trim()
  const isPrintable = text.length > 0 && /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(text)
  return isPrintable ? `文本: ${text}` : `HEX: ${data.toHexString()}`
}

export function operationModeStatus(profile: string[]): string {
  const line = profile.find(value => value.startsWith("Operation Mode")) ?? ""
  if (line.includes("HEX: 02")) return "BLE_STARTUP（待机）· WLAN 已阻止"
  if (line.includes("HEX: 04")) return "POWER_OFF_TRANSFER（关机传输）· WLAN 已阻止"
  if (line.includes("HEX: 00")) return "CAPTURE（拍摄模式）· WLAN 仍需后续映射验证"
  if (line.includes("HEX: 01")) return "PLAYBACK（回放模式）· WLAN 仍需后续映射验证"
  if (line.includes("HEX: 03")) return "OTHER（未知工作状态）· WLAN 已阻止"
  return "未取得 Operation Mode · WLAN 已阻止"
}

export function parseProfileIdentity(profile: string[]): CameraIdentity {
  const rawModel = profile.find(value => value.startsWith("型号"))?.replace(/^型号（[^）]+）：(?:文本: )?/, "") ?? "RICOH GR"
  const firmware = profile.find(value => value.startsWith("固件修订"))?.replace(/^固件修订（[^）]+）：(?:文本: )?/, "")
  return { model: identifyCameraModel(rawModel), displayModel: rawModel, firmware }
}

export function profileIdentity(profile: string[]): string {
  const identity = parseProfileIdentity(profile)
  return identity.firmware ? `${identity.displayModel} · 固件 ${identity.firmware}` : identity.displayModel
}
