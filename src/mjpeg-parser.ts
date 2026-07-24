export type MjpegParseResult = {
  frames: Uint8Array[]
  remainder: Uint8Array
}

export type DataMjpegParseResult = {
  latestFrame: Data | null
  remainder: Data | null
}

const MARKER = 0xff
const SOI = 0xd8
const EOI = 0xd9

/**
 * Incrementally extracts complete JPEG frames from a multipart MJPEG byte stream.
 * Multipart boundaries are intentionally ignored: GR firmware variants may differ,
 * while JPEG SOI/EOI markers are stable. Based on the proven GR III Android parser.
 */
export function extractJpegFrames(buffer: Uint8Array): MjpegParseResult {
  const frames: Uint8Array[] = []
  let searchFrom = 0

  while (true) {
    const start = indexOfMarker(buffer, searchFrom, SOI)
    if (start < 0) {
      const keepTrailingMarker = buffer.length > 0 && buffer[buffer.length - 1] === MARKER
      return { frames, remainder: keepTrailingMarker ? buffer.slice(-1) : new Uint8Array() }
    }

    const end = indexOfMarker(buffer, start + 2, EOI)
    if (end < 0) return { frames, remainder: buffer.slice(start) }

    const frameEnd = end + 2
    frames.push(buffer.slice(start, frameEnd))
    searchFrom = frameEnd
  }
}

export function appendMjpegData(remainder: Data | null, chunk: Data, maxBytes: number): Data {
  if (!remainder || remainder.size === 0) return chunk.size <= maxBytes ? chunk : chunk.slice(chunk.size - maxBytes)
  const allowedRemainderBytes = Math.max(0, maxBytes - Math.min(chunk.size, maxBytes))
  const boundedRemainder = remainder.size > allowedRemainderBytes ? remainder.slice(remainder.size - allowedRemainderBytes) : remainder
  const boundedChunk = chunk.size > maxBytes ? chunk.slice(chunk.size - maxBytes) : chunk
  return boundedRemainder.size === 0 ? boundedChunk : Data.combine([boundedRemainder, boundedChunk])
}

/** Extracts only the newest complete JPEG as native Data and preserves an incomplete tail. */
export function extractLatestJpegData(buffer: Data, maxFrameBytes: number): DataMjpegParseResult {
  const bytes = buffer.toUint8Array()
  if (!bytes || bytes.length === 0) return { latestFrame: null, remainder: null }
  let latestStart = -1
  let latestEnd = -1
  let searchFrom = 0
  const latestFrame = () => latestStart >= 0 ? buffer.slice(latestStart, latestEnd) : null

  while (true) {
    const start = indexOfMarker(bytes, searchFrom, SOI)
    if (start < 0) {
      const trailingMarker = bytes[bytes.length - 1] === MARKER
      return { latestFrame: latestFrame(), remainder: trailingMarker ? buffer.slice(buffer.size - 1) : null }
    }
    const end = indexOfMarker(bytes, start + 2, EOI)
    if (end < 0) return { latestFrame: latestFrame(), remainder: buffer.slice(start) }
    const frameEnd = end + 2
    if (frameEnd - start <= maxFrameBytes) {
      latestStart = start
      latestEnd = frameEnd
    }
    searchFrom = frameEnd
  }
}


export function appendMjpegChunk(remainder: Uint8Array, chunk: Uint8Array): Uint8Array {
  const combined = new Uint8Array(remainder.byteLength + chunk.byteLength)
  combined.set(remainder)
  combined.set(chunk, remainder.byteLength)
  return combined
}

function indexOfMarker(buffer: Uint8Array, from: number, marker: number): number {
  for (let index = from; index < buffer.length - 1; index += 1) {
    if (buffer[index] === MARKER && buffer[index + 1] === marker) return index
  }
  return -1
}
