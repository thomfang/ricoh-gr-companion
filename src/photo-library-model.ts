export type CameraStorage = "in" | "sd1" | string
export type CameraMediaType = "jpeg" | "raw" | "video" | "unknown"

export type CameraPhoto = {
  id: string
  storage: CameraStorage
  folder: string
  file: string
  extension: string
  mediaType: CameraMediaType
  byteSize?: number
  capturedAt?: number
  recordedTime?: string
  aspectRatio?: string
  aperture?: string
  shutterSpeed?: string
  iso?: string
  exposureCompensation?: string
}

export type CameraPhotoDirectory = {
  name: string
  files: string[]
}

export type ThumbnailState =
  | { phase: "idle" | "loading" }
  | { phase: "ready"; image: UIImage }
  | { phase: "failed"; error: string }

export type TransferDestination = "photos" | "files"
export type TransferItemState = {
  photoId: string
  phase: "queued" | "downloading" | "saving" | "succeeded" | "failed" | "cancelled"
  receivedBytes: number
  totalBytes?: number
  error?: string
}

export type TransferBatchState = {
  destination: TransferDestination | null
  running: boolean
  completed: number
  total: number
  items: Record<string, TransferItemState>
}

export type PhotoLibraryState = {
  phase: "idle" | "loading" | "ready" | "failed"
  photos: CameraPhoto[]
  selectedIds: Set<string>
  thumbnails: Record<string, ThumbnailState>
  transfer: TransferBatchState
  error: string | null
}

export const emptyTransferState: TransferBatchState = {
  destination: null,
  running: false,
  completed: 0,
  total: 0,
  items: {},
}

export const initialPhotoLibraryState: PhotoLibraryState = {
  phase: "idle",
  photos: [],
  selectedIds: new Set(),
  thumbnails: {},
  transfer: emptyTransferState,
  error: null,
}

function mediaTypeForExtension(extension: string): CameraMediaType {
  if (["JPG", "JPEG", "HEIF", "HEIC"].includes(extension)) return "jpeg"
  if (["DNG", "PEF"].includes(extension)) return "raw"
  if (["MOV", "MP4"].includes(extension)) return "video"
  return "unknown"
}

export function photoFromPath(folder: string, file: string, storage: CameraStorage = "in"): CameraPhoto {
  const extension = file.includes(".") ? file.split(".").pop()?.toUpperCase() ?? "" : ""
  return {
    id: `${storage}:${folder}/${file}`,
    storage,
    folder,
    file,
    extension,
    mediaType: mediaTypeForExtension(extension),
  }
}

export function flattenPhotoDirectories(dirs: CameraPhotoDirectory[], storage: CameraStorage = "in"): CameraPhoto[] {
  return dirs.flatMap(dir => dir.files.map(file => photoFromPath(dir.name, file, storage)))
}

export function togglePhotoSelection(state: PhotoLibraryState, photoId: string): PhotoLibraryState {
  if (state.transfer.running) return state
  const selectedIds = new Set(state.selectedIds)
  selectedIds.has(photoId) ? selectedIds.delete(photoId) : selectedIds.add(photoId)
  return { ...state, selectedIds }
}

export function clearPhotoSelection(state: PhotoLibraryState): PhotoLibraryState {
  return { ...state, selectedIds: new Set() }
}

export function formatByteCount(value?: number): string | undefined {
  if (value === undefined) return undefined
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
