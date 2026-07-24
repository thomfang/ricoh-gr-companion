import type { AbortSignal } from "scripting"
import { cameraGet, contentLength, ensureSuccessfulResponse, photoPath } from "./camera-client"
import { flattenPhotoDirectories, photoFromPath, type CameraPhoto, type CameraPhotoDirectory, type CameraStorage } from "./photo-library-model"

const MAX_LIST_BODY_BYTES = 2 * 1024 * 1024
const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024

export type PhotoListResult = {
  photos: CameraPhoto[]
  topLevelKeys: string[]
}

export async function fetchCameraPhotoList(signal?: AbortSignal): Promise<CameraPhoto[]> {
  return (await fetchCameraPhotoListResult(signal)).photos
}

export async function fetchCameraPhotoListResult(signal?: AbortSignal): Promise<PhotoListResult> {
  try {
    return await requestPhotoList("/v1/photos", { limit: 100 }, signal)
  } catch (primaryError) {
    if (signal?.aborted || isAbortError(primaryError)) throw primaryError
    try {
      return await requestPhotoList("/v1/photos/infos", { storage: "in", after: "" }, signal)
    } catch {
      throw primaryError
    }
  }
}

async function requestPhotoList(path: string, query: Record<string, string | number>, signal?: AbortSignal): Promise<PhotoListResult> {
  const response = await cameraGet(path, query, { signal, timeout: 12, debugLabel: "ricoh-gr-photo-list" })
  ensureSuccessfulResponse(response, "Photo list")
  const declaredLength = contentLength(response)
  if (declaredLength !== undefined && declaredLength > MAX_LIST_BODY_BYTES) throw new Error("相机照片列表响应过大")
  const body = await response.text()
  if (body.length > MAX_LIST_BODY_BYTES) throw new Error("相机照片列表响应超过安全上限")
  const value = JSON.parse(body) as unknown
  return { photos: parseCameraPhotoList(value), topLevelKeys: objectKeys(value) }
}

export async function fetchCameraThumbnail(photo: CameraPhoto, signal?: AbortSignal): Promise<UIImage> {
  const response = await cameraGet(photoPath(photo.folder, photo.file), { storage: photo.storage, size: "thumb" }, { signal, timeout: 20, debugLabel: "ricoh-gr-thumbnail" })
  ensureSuccessfulResponse(response, `Thumbnail ${photo.file}`)
  const declaredLength = contentLength(response)
  if (declaredLength !== undefined && declaredLength > MAX_THUMBNAIL_BYTES) throw new Error("缩略图超过安全上限")
  const data = await response.data()
  if (data.size > MAX_THUMBNAIL_BYTES) throw new Error("缩略图超过安全上限")
  const image = UIImage.fromData(data)
  if (!image) throw new Error("相机返回的缩略图无法解码")
  return image
}

export async function fetchCameraPhotoInfo(photo: CameraPhoto, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await cameraGet(`${photoPath(photo.folder, photo.file)}/info`, { storage: photo.storage }, { signal, timeout: 12, debugLabel: "ricoh-gr-photo-info" })
  ensureSuccessfulResponse(response, `Photo info ${photo.file}`)
  const value = await response.json() as unknown
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("照片详情不是 JSON 对象")
  return value as Record<string, unknown>
}

export async function probeCameraPhotoList(): Promise<string[]> {
  const response = await cameraGet("/v1/photos", { limit: 20 }, { timeout: 12, debugLabel: "ricoh-gr-photo-list-probe" })
  const lines = [
    `HTTP 状态：${response.status} ${response.statusText}`,
    `Content-Type：${response.headers.get("content-type") ?? "未提供"}`,
    `Content-Length：${response.headers.get("content-length") ?? "未提供"}`,
  ]
  if (!response.ok) return [...lines, "相机照片列表返回非成功状态；未处理响应正文。"]
  return [...lines, ...summarizePhotoList(await response.text()), "只显示脱敏结构摘要；未显示照片路径或 WLAN 凭据。"]
}

export function parseCameraPhotoList(value: unknown): CameraPhoto[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("相机照片列表不是 JSON 对象")
  const record = value as Record<string, unknown>

  if (Array.isArray(record.files)) {
    return record.files.flatMap(item => parseInfoPhoto(item))
  }

  const dirs = parsePhotoDirectories(value)
  return flattenPhotoDirectories(dirs)
}

function parseInfoPhoto(value: unknown): CameraPhoto[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const record = value as Record<string, unknown>
  const folder = stringValue(record.dir) ?? stringValue(record.folder)
  const file = stringValue(record.file) ?? stringValue(record.name)
  if (!folder || !file) return []
  const storage = storageFromValue(record.storage ?? record.memory)
  return [{
    ...photoFromPath(folder, file, storage),
    byteSize: numberValue(record.size),
    capturedAt: numberValue(record.datetime),
    recordedTime: stringValue(record.recorded_time),
    aspectRatio: stringValue(record.aspect_ratio),
    aperture: stringValue(record.av),
    shutterSpeed: stringValue(record.tv),
    iso: stringValue(record.sv),
    exposureCompensation: stringValue(record.xv),
  }]
}

function parsePhotoDirectories(value: unknown): CameraPhotoDirectory[] {
  const dirs = (value as Record<string, unknown>).dirs
  if (!Array.isArray(dirs)) throw new Error("相机照片列表未包含可识别的 dirs 或 files 数组")
  return dirs.flatMap(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return []
    const record = entry as Record<string, unknown>
    const name = typeof record.name === "string" ? record.name : ""
    const files = Array.isArray(record.files) ? record.files.filter((file): file is string => typeof file === "string") : []
    return name ? [{ name, files }] : []
  })
}

function summarizePhotoList(body: string): string[] {
  try {
    const value = JSON.parse(body) as unknown
    const photos = parseCameraPhotoList(value)
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
    const format = Array.isArray(record.files) ? "files 详情数组" : Array.isArray(record.dirs) ? "dirs → name/files" : "未识别"
    return [
      `JSON 顶层字段：${objectKeys(value).join(", ") || "无"}`,
      `列表条目数：${photos.length}`,
      `已识别格式：${format}`,
    ]
  } catch (error) {
    return [`照片列表解析失败：${error instanceof Error ? error.message : String(error)}`]
  }
}

function isAbortError(error: unknown): boolean { return error instanceof Error && error.name === "AbortError" }
function objectKeys(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value as Record<string, unknown>) : []
}
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined }
function numberValue(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined }
function storageFromValue(value: unknown): CameraStorage {
  if (value === 1 || value === "sd1") return "sd1"
  if (typeof value === "string" && value) return value
  return "in"
}
