import { AbortController } from "scripting"
import { AppError } from "./app-error"
import { cameraGet, contentLength, ensureSuccessfulResponse } from "./camera-client"
import { type CameraApiProfile } from "./camera-profile"
import type { CameraPhoto, TransferDestination, TransferItemState } from "./photo-library-model"

const MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024

export type TransferProgress = (item: TransferItemState) => void

export class PhotoTransferController {
  private controller: AbortController | null = null
  private cancelled = false

  get running(): boolean { return this.controller !== null }

  cancel(): void {
    this.cancelled = true
    this.controller?.abort()
  }

  async transfer(profile: CameraApiProfile, photos: CameraPhoto[], destination: TransferDestination, onProgress: TransferProgress): Promise<void> {
    if (this.running || photos.length === 0) return
    this.cancelled = false
    this.controller = new AbortController()
    let exportDirectory: string | null = null
    let hasSecurityScope = false
    try {
      if (destination === "files") {
        exportDirectory = await DocumentPicker.pickDirectory()
        if (!exportDirectory) {
          for (const photo of photos) onProgress({ photoId: photo.id, phase: "cancelled", receivedBytes: 0 })
          return
        }
        hasSecurityScope = true
      }
      for (const photo of photos) {
        if (this.cancelled) {
          onProgress({ photoId: photo.id, phase: "cancelled", receivedBytes: 0 })
          continue
        }
        await this.transferOne(profile, photo, destination, exportDirectory, onProgress)
      }
    } finally {
      if (hasSecurityScope) {
        try { DocumentPicker.stopAcessingSecurityScopedResources() } catch {}
      }
      this.controller = null
    }
  }

  private async transferOne(profile: CameraApiProfile, photo: CameraPhoto, destination: TransferDestination, exportDirectory: string | null, onProgress: TransferProgress): Promise<void> {
    const temporaryPath = `${FileManager.temporaryDirectory}/${Date.now()}-${safeFileName(photo.file)}`
    let receivedBytes = 0
    let totalBytes: number | undefined
    try {
      onProgress({ photoId: photo.id, phase: "downloading", receivedBytes: 0 })
      const response = await cameraGet(profile, profile.originalPath(photo), { storage: photo.storage }, { signal: this.controller?.signal, timeout: 180, debugLabel: "ricoh-gr-photo-download" })
      ensureSuccessfulResponse(response, `Download ${photo.file}`)
      totalBytes = contentLength(response)
      if (totalBytes !== undefined && totalBytes > MAX_DOWNLOAD_BYTES) throw new AppError("download-too-large")

      const reader = response.dataStream.getReader()
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          if (!chunk.value || chunk.value.size === 0) continue
          receivedBytes += chunk.value.size
          if (receivedBytes > MAX_DOWNLOAD_BYTES) throw new AppError("download-too-large")
          await FileManager.appendData(temporaryPath, chunk.value)
          onProgress({ photoId: photo.id, phase: "downloading", receivedBytes, totalBytes })
        }
      } finally {
        reader.releaseLock()
      }
      if (totalBytes !== undefined && receivedBytes !== totalBytes) throw new AppError("download-incomplete", { received: receivedBytes, expected: totalBytes })
      if (receivedBytes === 0) throw new AppError("download-empty")
      if (this.cancelled) throw abortError()

      onProgress({ photoId: photo.id, phase: "saving", receivedBytes, totalBytes })
      if (destination === "photos") {
        const saved = photo.mediaType === "video"
          ? await Photos.saveVideo(temporaryPath, { fileName: photo.file })
          : await Photos.savePhoto(temporaryPath, { fileName: photo.file })
        if (!saved) throw new AppError("save-to-photos-failed")
      } else {
        if (!exportDirectory) throw new AppError("export-directory-missing")
        await FileManager.copyFile(temporaryPath, await availableDestinationPath(exportDirectory, photo.file))
      }
      onProgress({ photoId: photo.id, phase: "succeeded", receivedBytes, totalBytes })
    } catch (error) {
      const cancelled = this.cancelled || (error instanceof Error && error.name === "AbortError")
      onProgress({ photoId: photo.id, phase: cancelled ? "cancelled" : "failed", receivedBytes, totalBytes, error: cancelled ? undefined : errorMessage(error) })
    } finally {
      try {
        if (await FileManager.exists(temporaryPath)) await FileManager.remove(temporaryPath)
      } catch {}
    }
  }
}

async function availableDestinationPath(directory: string, file: string): Promise<string> {
  const safeName = safeFileName(file)
  const dot = safeName.lastIndexOf(".")
  const stem = dot > 0 ? safeName.slice(0, dot) : safeName
  const extension = dot > 0 ? safeName.slice(dot) : ""
  let candidate = `${directory}/${safeName}`
  let suffix = 2
  while (await FileManager.exists(candidate)) {
    candidate = `${directory}/${stem} ${suffix}${extension}`
    suffix += 1
  }
  return candidate
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_") || "RICOH_GR_PHOTO"
}
function abortError(): Error { const error = new Error("Transfer cancelled"); error.name = "AbortError"; return error }
function errorMessage(error: unknown): string { return error instanceof AppError ? error.code : error instanceof Error ? error.message : String(error) }
