import { PhotoLibraryWorkspace } from "../PhotoLibraryGrid"
import { getI18n } from "../i18n"
import { emptyTransferState, photoFromPath, type PhotoLibraryState } from "../photo-library-model"

const photos = [
  photoFromPath("100RICOH", "R0001234.JPG"),
  { ...photoFromPath("100RICOH", "R0001235.DNG"), byteSize: 27_240_000 },
  photoFromPath("100RICOH", "R0001236.JPG"),
  photoFromPath("100RICOH", "R0001237.JPG"),
  photoFromPath("100RICOH", "R0001238.JPG"),
  photoFromPath("100RICOH", "R0001239.JPG"),
]
const state: PhotoLibraryState = {
  phase: "ready",
  photos,
  selectedIds: new Set([photos[1].id, photos[3].id]),
  thumbnails: Object.fromEntries(photos.map(photo => [photo.id, { phase: "loading" as const }])),
  transfer: emptyTransferState,
  error: null,
}

export default function PhotoLibraryPreview() {
  return <PhotoLibraryWorkspace state={state} t={getI18n("zh")} onSelectState={() => undefined} onRefresh={() => undefined} onRetryThumbnail={() => undefined} onTransfer={() => undefined} onCancelTransfer={() => undefined} />
}
