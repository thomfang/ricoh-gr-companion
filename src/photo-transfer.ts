import { AbortController } from "scripting"
import { cameraGet, contentLength, ensureSuccessfulResponse, photoPath } from "./camera-client"
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

  async transfer(photos: CameraPhoto[], destination: TransferDestination, onProgress: TransferProgress): Promise<void> {
    if (this.running || photos.length === 0) return
    this.cancelled = false
    this.controller = new AbortController()
    let exportDirectory: string | null = null
    try {
      if (destination === "files") {
        exportDirectory = await DocumentPicker.pickDirectory()
        if (!exportDirectory) return
      }
      for (const photo of photos) {
        if (this.cancelled) {
          onProgress({ photoId: photo.id, phase: "cancelled", receivedBytes: 0 })
          continue
        }
        await this.transferOne(photo, destination, exportDirectory, onProgress)
      }
    } finally {
      if (destination === "files") DocumentPicker.stopAcessingSecurityScopedResources()
      this.controller = null
    }
  }

  private async transferOne(photo: CameraPhoto, destination: TransferDestination, exportDirectory: string | null, onProgress: TransferProgress): Promise<void> {
    const temporaryPath = `${FileManager.temporaryDirectory}/${Date.now()}-${safeFileName(photo.file)}`
    let receivedBytes = 0
    try {
      onProgress({ photoId: photo.id, phase: "downloading", receivedBytes: 0 })
      const response = await cameraGet(photoPath(photo.folder, photo.file), { storage: photo.storage }, { signal: this.controller?.signal, timeout: 180, debugLabel: "ricoh-gr-photo-download" })
      ensureSuccessfulResponse(response, `Download ${photo.file}`)
      const totalBytes = contentLength(response)
      if (totalBytes !== undefined && totalBytes > MAX_DOWNLOAD_BYTES) throw new Error("文件超过 128 MB 安全上限")

      const reader = response.dataStream.getReader()
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          if (!chunk.value || chunk.value.size === 0) continue
          receivedBytes += chunk.value.size
          if (receivedBytes > MAX_DOWNLOAD_BYTES) throw new Error("文件超过 128 MB 安全上限")
          await FileManager.appendData(temporaryPath, chunk.value)
          onProgress({ photoId: photo.id, phase: "downloading", receivedBytes, totalBytes })
        }
      } finally {
        reader.releaseLock()
      }
      if (totalBytes !== undefined && receivedBytes !== totalBytes) throw new Error(`下载不完整：${receivedBytes}/${totalBytes} bytes`)
      if (receivedBytes === 0) throw new Error("相机返回了空文件")

      onProgress({ photoId: photo.id, phase: "saving", receivedBytes, totalBytes })
      if (destination === "photos") {
        const saved = photo.mediaType === "video"
          ? await Photos.saveVideo(temporaryPath, { fileName: photo.file })
          : await Photos.savePhoto(temporaryPath, { fileName: photo.file })
        if (!saved) throw new Error("未能保存到系统照片库")
      } else {
        if (!exportDirectory) throw new Error("未选择导出目录")
        await FileManager.copyFile(temporaryPath, await availableDestinationPath(exportDirectory, photo.file))
      }
      onProgress({ photoId: photo.id, phase: "succeeded", receivedBytes, totalBytes })
    } catch (error) {
      const cancelled = this.cancelled || (error instanceof Error && error.name === "AbortError")
      onProgress({ photoId: photo.id, phase: cancelled ? "cancelled" : "failed", receivedBytes, error: cancelled ? undefined : errorMessage(error) })
    } finally {
      if (await FileManager.exists(temporaryPath)) await FileManager.remove(temporaryPath).catch(() => undefined)
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
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
