import { SettingsScreen } from "./SettingsScreen"
import { GR3_CAMERA_API_PROFILE } from "../camera-profile"
import { getI18n } from "../i18n"

export default function SettingsPreview() {
  const t = getI18n("zh")
  return <SettingsScreen
    t={t}
    locale="system"
    changeLocale={() => undefined}
    cameraModelSelection="GR IIIx"
    changeCameraModel={() => undefined}
    detectedModel="GR IIIx"
    cameraProfile={GR3_CAMERA_API_PROFILE}
    cameraIdentity={t.profileIdentity("RICOH GR IIIx", "1.21")}
    connectionStatus={t.cameraConnected("RICOH GR IIIx")}
    reconnectCamera={() => undefined}
    isConnecting={false}
    isCameraConnected={true}
    dataConnection="ready"
    libraryReport={[]}
    probePhotoLibrary={() => undefined}
  />
}
