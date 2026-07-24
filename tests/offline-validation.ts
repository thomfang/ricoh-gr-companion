import { Script } from "scripting"
import { cameraUrl, photoPath } from "../src/camera-client"
import { identifyCameraModel } from "../src/models"
import { appendMjpegChunk, extractJpegFrames } from "../src/mjpeg-parser"
import { clearPhotoSelection, photoFromPath, togglePhotoSelection, initialPhotoLibraryState, type PhotoLibraryState } from "../src/photo-library-model"

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

expect(cameraUrl("/v1/photos", { limit: 20, after: "A B" }).endsWith("limit=20&after=A%20B"), "query encoding")
expect(photoPath("100 RICOH", "R#1.JPG") === "/v1/photos/100%20RICOH/R%231.JPG", "photo path encoding")
expect(identifyCameraModel("RICOH GR IIIx") === "GR IIIx", "GR IIIx detection")
expect(identifyCameraModel("RICOH GR IV") === "GR IV", "GR IV detection")

const photo = photoFromPath("100RICOH", "R0000001.JPG")
let state: PhotoLibraryState = { ...initialPhotoLibraryState, phase: "ready", photos: [photo] }
state = togglePhotoSelection(state, photo.id)
expect(state.selectedIds.has(photo.id), "selection toggle")
state = clearPhotoSelection(state)
expect(state.selectedIds.size === 0, "selection clear")

const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 0xff, 0xd9])
const first = appendMjpegChunk(new Uint8Array(), jpeg.slice(0, 3))
const second = extractJpegFrames(appendMjpegChunk(first, jpeg.slice(3)))
expect(second.frames.length === 1 && second.frames[0].byteLength === jpeg.byteLength, "MJPEG split frame")
console.log("Offline validation passed")
Script.exit()
