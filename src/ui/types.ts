import type { AppLocale } from "../i18n"
import type { I18nData } from "../i18n/en"
import type { PhotoLibraryState, TransferDestination } from "../photo-library-model"

export type DataConnectionState = "unknown" | "checking" | "ready" | "offline"

export type HomeScreenProps = {
  t: I18nData
  cameraIdentity: string
  connectionStatus: string
  isConnecting: boolean
  isCameraConnected: boolean
  dataConnection: DataConnectionState
  photoLibrary: PhotoLibraryState
  setPhotoLibrary: (state: PhotoLibraryState) => void
  refreshPhotoLibrary: () => void
  retryThumbnail: (photoId: string) => void
  startTransfer: (destination: TransferDestination) => void
  cancelTransfer: () => void
  libraryReport: string[]
  probePhotoLibrary: () => void
  previewImage: UIImage | null
  isPreviewing: boolean
  previewStatus: string
  previewFrames: number
  startPreview: () => void
  stopPreview: () => void
  locale: AppLocale
  changeLocale: (locale: AppLocale) => void
  reconnectCamera: () => void
}

export type SettingsScreenProps = Pick<HomeScreenProps, "t" | "cameraIdentity" | "connectionStatus" | "isConnecting" | "isCameraConnected" | "dataConnection" | "locale" | "changeLocale" | "reconnectCamera" | "libraryReport" | "probePhotoLibrary">

export type ViewfinderScreenProps = Pick<HomeScreenProps, "t" | "previewImage" | "isPreviewing" | "previewStatus" | "previewFrames" | "startPreview" | "stopPreview">
