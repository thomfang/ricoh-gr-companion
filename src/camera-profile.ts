import type { CameraModel } from "./models"

export type CameraModelSelection = "auto" | "GR III" | "GR IIIx" | "GR IV"
export type CameraProtocolFamily = "gr3" | "gr4"
export type CameraProfileEvidence = "device-verified" | "reference-only" | "unverified"

export type CameraProfilePhoto = {
  folder: string
  file: string
}

export type CameraPhotoListCandidate = {
  path: string
  query: Record<string, string | number>
}

export type CameraApiProfile = {
  id: CameraProtocolFamily
  models: CameraModel[]
  baseUrl: string
  propsPath: string
  liveViewPath: string
  photoListCandidates: CameraPhotoListCandidate[]
  thumbnailSizes: string[]
  photoInfoPath(photo: CameraProfilePhoto): string
  originalPath(photo: CameraProfilePhoto): string
  evidence: CameraProfileEvidence
}

const CAMERA_BASE_URL = "http://192.168.0.1"

function encodedPhotoPath(photo: CameraProfilePhoto): string {
  return `/v1/photos/${encodeURIComponent(photo.folder)}/${encodeURIComponent(photo.file)}`
}

export const GR3_CAMERA_API_PROFILE: CameraApiProfile = {
  id: "gr3",
  models: ["GR III", "GR IIIx"],
  baseUrl: CAMERA_BASE_URL,
  propsPath: "/v1/props",
  liveViewPath: "/v1/liveview",
  photoListCandidates: [
    { path: "/v1/photos/infos", query: { storage: "in", after: "" } },
    { path: "/v1/photos", query: { limit: 100 } },
  ],
  thumbnailSizes: ["thumb", "view", "xs"],
  photoInfoPath: photo => `${encodedPhotoPath(photo)}/info`,
  originalPath: encodedPhotoPath,
  evidence: "reference-only",
}

export const GR4_CAMERA_API_PROFILE: CameraApiProfile = {
  id: "gr4",
  models: ["GR IV"],
  baseUrl: CAMERA_BASE_URL,
  propsPath: "/v1/props",
  liveViewPath: "/v1/liveview",
  photoListCandidates: [
    { path: "/v1/photos", query: { limit: 100 } },
    { path: "/v1/photos/infos", query: { storage: "in", after: "" } },
  ],
  thumbnailSizes: ["thumb", "view", "xs"],
  photoInfoPath: photo => `${encodedPhotoPath(photo)}/info`,
  originalPath: encodedPhotoPath,
  evidence: "unverified",
}

export const CAMERA_API_PROFILES: Readonly<Record<CameraProtocolFamily, CameraApiProfile>> = Object.freeze({
  gr3: GR3_CAMERA_API_PROFILE,
  gr4: GR4_CAMERA_API_PROFILE,
})

export function protocolFamilyForModel(model: CameraModel): CameraProtocolFamily | undefined {
  if (model === "GR III" || model === "GR IIIx") return "gr3"
  if (model === "GR IV") return "gr4"
  return undefined
}

export function protocolFamilyForSelection(
  selection: CameraModelSelection,
  detectedModel: CameraModel = "unknown",
): CameraProtocolFamily | undefined {
  return protocolFamilyForModel(selection === "auto" ? detectedModel : selection)
}

export function cameraProfileForModel(model: CameraModel): CameraApiProfile | undefined {
  const family = protocolFamilyForModel(model)
  return family ? CAMERA_API_PROFILES[family] : undefined
}

/** Auto deliberately remains unresolved when the read-only detected model is unknown. */
export function resolveCameraApiProfile(
  selection: CameraModelSelection,
  detectedModel: CameraModel = "unknown",
): CameraApiProfile | undefined {
  const family = protocolFamilyForSelection(selection, detectedModel)
  return family ? CAMERA_API_PROFILES[family] : undefined
}

export function isCameraApiProfile(value: unknown): value is CameraApiProfile {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<CameraApiProfile>
  return (candidate.id === "gr3" || candidate.id === "gr4")
    && typeof candidate.baseUrl === "string"
    && Array.isArray(candidate.photoListCandidates)
}
