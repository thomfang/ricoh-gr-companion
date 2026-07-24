import { HomeScreen } from "./HomeScreen"
import { getI18n } from "../i18n"
import { initialPhotoLibraryState } from "../photo-library-model"

const t = getI18n("zh")

export default function GlassHomePreview() {
  return (
    <HomeScreen
      t={t}
      cameraIdentity="RICOH GR IIIx"
      connectionStatus="已连接 · 可开始浏览或实时取景"
      isConnecting={false}
      isCameraConnected={true}
      dataConnection="ready"
      photoLibrary={initialPhotoLibraryState}
      setPhotoLibrary={() => undefined}
      refreshPhotoLibrary={() => undefined}
      retryThumbnail={() => undefined}
      startTransfer={() => undefined}
      cancelTransfer={() => undefined}
      libraryReport={[]}
      probePhotoLibrary={() => undefined}
      previewImage={null}
      isPreviewing={false}
      previewStatus={t.noFrame}
      previewFrames={0}
      startPreview={() => undefined}
      stopPreview={() => undefined}
      locale="zh"
      changeLocale={() => undefined}
      reconnectCamera={() => undefined}
    />
  )
}
