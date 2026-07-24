import type { I18nData } from "./i18n/en"

export type AppErrorCode =
  | "response-too-large"
  | "invalid-json"
  | "invalid-photo-list"
  | "thumbnail-too-large"
  | "thumbnail-decode-failed"
  | "invalid-photo-detail"
  | "download-too-large"
  | "download-incomplete"
  | "download-empty"
  | "save-to-photos-failed"
  | "export-directory-missing"
  | "profile-unresolved"
  | "liveview-invalid-content-type"
  | "peripheral-unavailable"
  | "camera-not-found"
  | "service-discovery-timeout"
  | "characteristic-discovery-timeout"

export const APP_ERROR_CODES: ReadonlySet<string> = new Set<AppErrorCode>([
  "response-too-large", "invalid-json", "invalid-photo-list", "thumbnail-too-large", "thumbnail-decode-failed", "invalid-photo-detail",
  "download-too-large", "download-incomplete", "download-empty", "save-to-photos-failed", "export-directory-missing", "profile-unresolved",
  "liveview-invalid-content-type", "peripheral-unavailable", "camera-not-found", "service-discovery-timeout", "characteristic-discovery-timeout",
])

export function errorFromCode(value: string): AppError | undefined {
  return APP_ERROR_CODES.has(value) ? new AppError(value as AppErrorCode) : undefined
}

export class AppError extends Error {
  constructor(readonly code: AppErrorCode, readonly details: Record<string, string | number> = {}) {
    super(code)
    this.name = "AppError"
  }
}

export function errorToken(error: unknown): string {
  return error instanceof AppError ? error.code : error instanceof Error ? error.message : String(error)
}

export function localizedError(error: unknown, t: I18nData): string {
  if (!(error instanceof AppError)) return error instanceof Error ? error.message : String(error)
  const number = (key: string) => typeof error.details[key] === "number" ? error.details[key] as number : 0
  const string = (key: string) => typeof error.details[key] === "string" ? error.details[key] as string : ""
  switch (error.code) {
    case "response-too-large": return t.responseTooLarge
    case "invalid-json": return t.invalidJsonResponse
    case "invalid-photo-list": return t.invalidPhotoListResponse
    case "thumbnail-too-large": return t.thumbnailTooLarge
    case "thumbnail-decode-failed": return t.thumbnailDecodeFailed
    case "invalid-photo-detail": return t.invalidPhotoDetailResponse
    case "download-too-large": return t.downloadTooLarge
    case "download-incomplete": return t.downloadIncomplete(number("received"), number("expected"))
    case "download-empty": return t.downloadEmpty
    case "save-to-photos-failed": return t.saveToPhotosFailed
    case "export-directory-missing": return t.exportDirectoryMissing
    case "profile-unresolved": return t.profileUnresolved
    case "liveview-invalid-content-type": return t.liveViewInvalidContentType(string("contentType"))
    case "peripheral-unavailable": return t.peripheralUnavailable
    case "camera-not-found": return t.cameraNotFound
    case "service-discovery-timeout": return t.serviceDiscoveryTimeout
    case "characteristic-discovery-timeout": return t.characteristicDiscoveryTimeout
  }
}
