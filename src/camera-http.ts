import { fetch } from "scripting"
import { formatError } from "./formatters"

const CAMERA_HTTP_BASE_URL = "http://192.168.0.1"

export async function probeCameraProps(): Promise<string[]> {
  const response = await fetch(`${CAMERA_HTTP_BASE_URL}/v1/props`, {
    method: "GET",
    allowInsecureRequest: true,
    timeout: 8,
    debugLabel: "ricoh-gr-props-probe",
  })
  const body = await response.text()
  return [
    `HTTP 状态：${response.status} ${response.statusText}`,
    `Content-Type：${response.headers.get("content-type") ?? "未提供"}`,
    `Content-Length：${response.headers.get("content-length") ?? "未提供"}`,
    summarizePropsBody(body),
    "响应正文未展示、未保存；探针没有请求 LiveView。",
  ]
}

function summarizePropsBody(body: string): string {
  try {
    const value = JSON.parse(body) as unknown
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return `JSON 顶层字段：${Object.keys(value as Record<string, unknown>).join(", ") || "无"}`
    }
    return "响应不是 JSON 对象；未显示正文。"
  } catch {
    return "响应不是可解析 JSON；未显示正文。"
  }
}

export async function probeLiveViewPrefix(): Promise<string[]> {
  const response = await fetch(`${CAMERA_HTTP_BASE_URL}/v1/liveview`, {
    method: "GET",
    allowInsecureRequest: true,
    timeout: 8,
    debugLabel: "ricoh-gr-liveview-prefix-probe",
  })
  const lines = [
    `HTTP 状态：${response.status} ${response.statusText}`,
    `Content-Type：${response.headers.get("content-type") ?? "未提供"}`,
    `Content-Length：${response.headers.get("content-length") ?? "流式响应通常未提供"}`,
  ]
  if (!response.ok) return [...lines, "LiveView 响应非成功状态；未读取正文。"]

  const reader = response.body.getReader()
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    const timeoutResult = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("首段读取超时（2 秒）")), 2000)
    })
    const firstChunk = await Promise.race([reader.read(), timeoutResult])
    const bytes = firstChunk.value ?? new Uint8Array()
    const inspected = bytes.slice(0, 4096)
    lines.push(`首段读取：${inspected.byteLength} bytes（上限 4096 bytes）`)
    lines.push(jpegMarkerSummary(inspected))
    lines.push("已立即取消 LiveView 流；未保存、未渲染、未持续预览。")
    return lines
  } finally {
    if (timeout) clearTimeout(timeout)
    await reader.cancel("C.1 bounded prefix probe complete").catch(() => undefined)
  }
}

function jpegMarkerSummary(bytes: Uint8Array): string {
  if (bytes.length < 2) return "首段不足以判断 JPEG 标记。"
  for (let index = 0; index < bytes.length - 1; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd8) return `检测到 JPEG SOI 标记 FF D8（偏移 ${index}）。`
  }
  return "首段未检测到 JPEG SOI 标记 FF D8；可能先包含 multipart 边界或响应头。"
}
export function cameraHttpFailureReport(error: unknown): string[] {
  return [
    `HTTP 探测失败：${formatError(error)}`,
    "请确认：相机 WLAN 已手动开启、iPhone 已加入相机热点，且相机仍处于开机状态。",
  ]
}
