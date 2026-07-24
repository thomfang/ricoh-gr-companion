import type { AbortSignal } from "scripting"
import { AppError } from "./app-error"
import { cameraGet, contentLength, ensureSuccessfulResponse } from "./camera-client"
import { type CameraApiProfile, type CameraPhotoListCandidate } from "./camera-profile"
import { flattenPhotoDirectories, photoFromPath, type CameraPhoto, type CameraPhotoDirectory, type CameraStorage } from "./photo-library-model"

const MAX_LIST_BODY_BYTES = 2 * 1024 * 1024
const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024

export type PhotoListResult = {
  photos: CameraPhoto[]
  topLevelKeys: string[]
}

export type PhotoListDiagnostic = {
  profileId: string
  routeKind: string
  status: number
  statusText: string
  contentType?: string
  contentLength?: string
  topLevelKeys?: string[]
  itemCount?: number
  recognizedFormat?: "files" | "dirs" | "unrecognized"
  parseError?: string
}

export async function fetchCameraPhotoList(profile: CameraApiProfile, signal?: AbortSignal): Promise<CameraPhoto[]> {
  return (await fetchCameraPhotoListResult(profile, signal)).photos
}

export async function fetchCameraPhotoListResult(profile: CameraApiProfile, signal?: AbortSignal): Promise<PhotoListResult> {
  let primaryError: unknown
  for (const [index, candidate] of profile.photoListCandidates.entries()) {
    try {
      return await requestPhotoList(profile, candidate, signal)
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error
      if (index === 0) primaryError = error
    }
  }
  throw primaryError ?? new AppError("invalid-photo-list")
}

async function requestPhotoList(profile: CameraApiProfile, candidate: CameraPhotoListCandidate, signal?: AbortSignal): Promise<PhotoListResult> {
  const response = await cameraGet(profile, candidate.path, candidate.query, { signal, timeout: 12, debugLabel: "ricoh-gr-photo-list" })
  ensureSuccessfulResponse(response, "Photo list")
  const declaredLength = contentLength(response)
  if (declaredLength !== undefined && declaredLength > MAX_LIST_BODY_BYTES) throw new AppError("response-too-large")
  const body = await response.text()
  if (body.length > MAX_LIST_BODY_BYTES) throw new AppError("response-too-large")
  let value: unknown
  try { value = JSON.parse(body) as unknown } catch { throw new AppError("invalid-json") }
  return { photos: parseCameraPhotoList(value), topLevelKeys: objectKeys(value) }
}

export async function fetchCameraThumbnail(profile: CameraApiProfile, photo: CameraPhoto, signal?: AbortSignal): Promise<UIImage> {
  let primaryError: unknown
  for (const [index, size] of profile.thumbnailSizes.entries()) {
    try {
      return await requestCameraThumbnail(profile, photo, size, signal)
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error
      if (index === 0) primaryError = error
    }
  }
  throw primaryError ?? new AppError("thumbnail-decode-failed")
}

async function requestCameraThumbnail(profile: CameraApiProfile, photo: CameraPhoto, size: string, signal?: AbortSignal): Promise<UIImage> {
  const response = await cameraGet(profile, profile.originalPath(photo), { storage: photo.storage, size }, { signal, timeout: 20, debugLabel: "ricoh-gr-thumbnail" })
  ensureSuccessfulResponse(response, `Thumbnail ${photo.file}`)
  const declaredLength = contentLength(response)
  if (declaredLength !== undefined && declaredLength > MAX_THUMBNAIL_BYTES) throw new AppError("thumbnail-too-large")
  const data = await response.data()
  if (data.size > MAX_THUMBNAIL_BYTES) throw new AppError("thumbnail-too-large")
  const image = UIImage.fromData(data)
  if (!image) throw new AppError("thumbnail-decode-failed")
  return image
}

export async function fetchCameraPhotoInfo(profile: CameraApiProfile, photo: CameraPhoto, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await cameraGet(profile, profile.photoInfoPath(photo), { storage: photo.storage }, { signal, timeout: 12, debugLabel: "ricoh-gr-photo-info" })
  ensureSuccessfulResponse(response, `Photo info ${photo.file}`)
  const value = await response.json() as unknown
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("invalid-photo-detail")
  return value as Record<string, unknown>
}

export async function probeCameraPhotoList(profile: CameraApiProfile): Promise<PhotoListDiagnostic> {
  const candidate = profile.photoListCandidates[0]
  if (!candidate) throw new AppError("invalid-photo-list")
  const response = await cameraGet(profile, candidate.path, candidate.query, { timeout: 12, debugLabel: "ricoh-gr-photo-list-probe" })
  const diagnostic: PhotoListDiagnostic = {
    profileId: profile.id,
    routeKind: candidate.path,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type") ?? undefined,
    contentLength: response.headers.get("content-length") ?? undefined,
  }
  if (!response.ok) return diagnostic
  const body = await response.text()
  try {
    const value = JSON.parse(body) as unknown
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
    diagnostic.topLevelKeys = objectKeys(value)
    diagnostic.itemCount = parseCameraPhotoList(value).length
    diagnostic.recognizedFormat = Array.isArray(record.files) ? "files" : Array.isArray(record.dirs) ? "dirs" : "unrecognized"
  } catch (error) {
    diagnostic.parseError = error instanceof Error ? error.message : String(error)
  }
  return diagnostic
}

export function parseCameraPhotoList(value: unknown): CameraPhoto[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("invalid-photo-list")
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
  if (!Array.isArray(dirs)) throw new AppError("invalid-photo-list")
  return dirs.flatMap(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return []
    const record = entry as Record<string, unknown>
    const name = typeof record.name === "string" ? record.name : ""
    const files = Array.isArray(record.files) ? record.files.filter((file): file is string => typeof file === "string") : []
    return name ? [{ name, files }] : []
  })
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
