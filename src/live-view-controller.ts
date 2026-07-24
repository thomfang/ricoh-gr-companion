import { AbortController } from "scripting"
import { cameraGet, ensureSuccessfulResponse } from "./camera-client"
import { appendMjpegChunk, extractJpegFrames } from "./mjpeg-parser"

const MAX_PENDING_BYTES = 8 * 1024 * 1024
const MAX_FRAME_BYTES = 4 * 1024 * 1024
const MIN_RENDER_INTERVAL_MS = 200

type LiveViewCallbacks = {
  onState: (message: string) => void
  onFrame: (image: UIImage, framesDecoded: number) => void
  onError: (message: string) => void
  onStopped: (message: string) => void
}

/** A single, abortable LiveView connection. It never persists JPEG bytes. */
export class LiveViewController {
  private generation = 0
  private controller: AbortController | null = null
  private cancelReader: (() => Promise<void>) | null = null
  private activeTask: Promise<void> | null = null

  get running(): boolean { return this.controller !== null }

  start(callbacks: LiveViewCallbacks): Promise<void> {
    if (this.activeTask) return this.activeTask
    const task = this.run(callbacks)
    this.activeTask = task
    void task.finally(() => { if (this.activeTask === task) this.activeTask = null })
    return task
  }

  private async run(callbacks: LiveViewCallbacks): Promise<void> {
    const generation = ++this.generation
    const controller = new AbortController()
    this.controller = controller
    callbacks.onState("正在连接 LiveView…")
    try {
      const response = await cameraGet("/v1/liveview", {}, { signal: controller.signal, timeout: 20, debugLabel: "ricoh-gr-liveview-preview" })
      if (!this.isCurrent(generation)) return
      ensureSuccessfulResponse(response, "LiveView")
      const contentType = response.headers.get("content-type") ?? "未提供"
      if (!contentType.toLowerCase().includes("multipart/x-mixed-replace")) throw new Error(`不是 MJPEG 响应：${contentType}`)

      const reader = response.body.getReader()
      this.cancelReader = async () => { await reader.cancel("LiveView stopped") }
      callbacks.onState("LiveView 已连接，正在接收最新帧…")
      let remainder = new Uint8Array()
      let framesDecoded = 0
      let lastRenderAt = 0
      while (this.isCurrent(generation)) {
        const read = await reader.read()
        if (read.done) break
        const chunk = read.value
        if (!chunk || chunk.byteLength === 0) continue
        const parsed = extractJpegFrames(appendMjpegChunk(remainder, chunk))
        remainder = parsed.remainder.byteLength > MAX_PENDING_BYTES ? new Uint8Array() : parsed.remainder
        for (let index = parsed.frames.length - 1; index >= 0; index -= 1) {
          const jpegBytes = parsed.frames[index]
          if (!this.isCurrent(generation) || jpegBytes.byteLength > MAX_FRAME_BYTES) continue
          const now = Date.now()
          if (now - lastRenderAt < MIN_RENDER_INTERVAL_MS) break
          const data = Data.fromUint8Array(jpegBytes)
          const image = data ? UIImage.fromData(data) : null
          if (!image) continue
          framesDecoded += 1
          lastRenderAt = now
          callbacks.onFrame(image, framesDecoded)
          break
        }
      }
      if (this.isCurrent(generation)) callbacks.onStopped("LiveView 流已结束。")
    } catch (error) {
      if (this.isCurrent(generation)) callbacks.onError(error instanceof Error ? error.message : String(error))
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
    if (cancel) await cancel().catch(() => undefined)
    if (task) {
      await Promise.race([task.catch(() => undefined), delay(500)])
      if (this.activeTask === task) this.activeTask = null
    }
  }

  private isCurrent(generation: number): boolean { return this.controller !== null && this.generation === generation }
}

function delay(milliseconds: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, milliseconds)) }
