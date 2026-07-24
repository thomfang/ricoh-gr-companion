export type MjpegParseResult = {
  frames: Uint8Array[]
  remainder: Uint8Array
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

export function appendMjpegChunk(remainder: Uint8Array, chunk: Uint8Array): Uint8Array {
  if (remainder.byteLength === 0) return chunk
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
