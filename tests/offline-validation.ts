import { Script } from "scripting"
import { cameraUrl, photoPath } from "../src/camera-client"
import { parseCameraPhotoList } from "../src/camera-library"
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
expect(identifyCameraModel("RICOH GR III") === "GR III", "GR III detection")
expect(identifyCameraModel("ricoh   gr iii x") === "GR IIIx", "normalized GR IIIx detection")
expect(identifyCameraModel("unrelated camera") === "unknown", "unknown camera detection")

const emptyDetailedList = parseCameraPhotoList({ files: [] })
expect(emptyDetailedList.length === 0, "empty detailed photo list")
const detailedList = parseCameraPhotoList({ files: [{ dir: "100RICOH", file: "R0000001.JPG", storage: 1, size: 1234, recorded_time: "2026-07-24" }] })
expect(detailedList.length === 1 && detailedList[0].storage === "sd1" && detailedList[0].byteSize === 1234, "detailed photo list")
const directoryList = parseCameraPhotoList({ dirs: [{ name: "100RICOH", files: ["R0000002.JPG"] }, { name: "EMPTY", files: [] }] })
expect(directoryList.length === 1 && directoryList[0].file === "R0000002.JPG", "directory photo list")
let invalidPhotoListRejected = false
try { parseCameraPhotoList({ unexpected: [] }) } catch { invalidPhotoListRejected = true }
expect(invalidPhotoListRejected, "invalid photo list rejection")

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
const markerSplitA = extractJpegFrames(new Uint8Array([9, 0xff]))
const markerSplitB = extractJpegFrames(appendMjpegChunk(markerSplitA.remainder, new Uint8Array([0xd8, 7, 0xff])))
const markerSplitC = extractJpegFrames(appendMjpegChunk(markerSplitB.remainder, new Uint8Array([0xd9])))
expect(markerSplitC.frames.length === 1, "MJPEG markers split across chunks")
const multiple = extractJpegFrames(new Uint8Array([...jpeg, 0, ...jpeg]))
expect(multiple.frames.length === 2 && multiple.remainder.byteLength === 0, "MJPEG multiple frames")
const incomplete = extractJpegFrames(new Uint8Array([1, 0xff, 0xd8, 2, 3]))
expect(incomplete.frames.length === 0 && incomplete.remainder.byteLength === 4, "MJPEG incomplete frame remainder")
console.log("Offline validation passed")
Script.exit()
