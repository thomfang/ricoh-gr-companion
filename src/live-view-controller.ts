import { AbortController } from "scripting"
import { AppError } from "./app-error"
import { cameraGet, ensureSuccessfulResponse } from "./camera-client"
import type { CameraApiProfile } from "./camera-profile"
import { appendMjpegData, extractLatestJpegData } from "./mjpeg-parser"

const MAX_PENDING_BYTES = 8 * 1024 * 1024
const MAX_FRAME_BYTES = 4 * 1024 * 1024
export const LIVE_VIEW_TARGET_FPS = 30
const MIN_RENDER_INTERVAL_MS = Math.floor(1000 / LIVE_VIEW_TARGET_FPS)

type LiveViewCallbacks = {
  onState: (message: string) => void
  onFrame: (image: UIImage, framesDecoded: number) => void
  onError: (error: unknown) => void
  onStopped: (message: string) => void
}

/** A single, abortable LiveView connection. It never persists JPEG bytes. */
export class LiveViewController {
  private generation = 0
  private controller: AbortController | null = null
  private cancelReader: (() => Promise<void>) | null = null
  private activeTask: Promise<void> | null = null

  get running(): boolean { return this.controller !== null }

  start(profile: CameraApiProfile, callbacks: LiveViewCallbacks): Promise<void> {
    if (this.activeTask) return this.activeTask
    const task = this.run(profile, callbacks)
    this.activeTask = task
    void task.finally(() => { if (this.activeTask === task) this.activeTask = null })
    return task
  }

  private async run(profile: CameraApiProfile, callbacks: LiveViewCallbacks): Promise<void> {
    const generation = ++this.generation
    const controller = new AbortController()
    this.controller = controller
    callbacks.onState("connecting")
    try {
      const response = await cameraGet(profile, profile.liveViewPath, {}, { signal: controller.signal, timeout: 20, debugLabel: "ricoh-gr-liveview-preview" })
      if (!this.isCurrent(generation)) return
      ensureSuccessfulResponse(response, "LiveView")
      const contentType = response.headers.get("content-type") ?? ""
      if (!contentType.toLowerCase().includes("multipart/x-mixed-replace")) throw new AppError("liveview-invalid-content-type", { contentType })

      const reader = response.dataStream.getReader()
      this.cancelReader = async () => { await reader.cancel("LiveView stopped") }
      callbacks.onState("receiving")
      let remainder: Data | null = null
      let framesDecoded = 0
      let lastRenderAt = 0
      try {
        while (this.isCurrent(generation)) {
          const read = await reader.read()
          if (read.done) break
          const chunk = read.value
          if (!chunk || chunk.size === 0) continue
          const parsed = extractLatestJpegData(appendMjpegData(remainder, chunk, MAX_PENDING_BYTES), MAX_FRAME_BYTES)
          remainder = parsed.remainder
          const frame = parsed.latestFrame
          if (!frame || !this.isCurrent(generation)) continue
          const now = Date.now()
          if (now - lastRenderAt < MIN_RENDER_INTERVAL_MS) continue
          const image = UIImage.fromData(frame)
          if (!image) continue
          framesDecoded += 1
          lastRenderAt = now
          callbacks.onFrame(image, framesDecoded)
        }
      } finally {
        reader.releaseLock()
      }
      if (this.isCurrent(generation)) callbacks.onStopped("ended")
    } catch (error) {
      if (this.isCurrent(generation)) callbacks.onError(error)
    } finally {
      if (this.generation === generation) {
        this.controller = null
        this.cancelReader = null
      }
    }
  }

  async stop(): Promise<void> {
    const task = this.activeTask
    if (!task && !this.controller) return
    this.generation += 1
    this.controller?.abort()
    this.controller = null
    const cancel = this.cancelReader
    this.cancelReader = null
    if (cancel) await Promise.race([cancel().catch(() => undefined), delay(500)])
    if (task) await Promise.race([task.catch(() => undefined), delay(500)])
  }

  private isCurrent(generation: number): boolean { return this.controller !== null && this.generation === generation }
}

function delay(milliseconds: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, milliseconds)) }
