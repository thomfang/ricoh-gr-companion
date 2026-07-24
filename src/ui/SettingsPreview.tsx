import { SettingsScreen } from "./SettingsScreen"
import { getI18n } from "../i18n"

export default function SettingsPreview() {
  return <SettingsScreen
    t={getI18n("zh")}
    locale="system"
    changeLocale={() => undefined}
    cameraIdentity="RICOH GR IIIx · 固件 1.21"
    connectionStatus="已连接 RICOH GR IIIx"
    reconnectCamera={() => undefined}
    isConnecting={false}
    isCameraConnected={true}
    dataConnection="ready"
    libraryReport={[]}
    probePhotoLibrary={() => undefined}
  />
}
