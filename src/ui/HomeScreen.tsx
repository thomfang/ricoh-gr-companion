import { Button, HStack, Image, Navigation, NavigationLink, NavigationStack, Rectangle, ScrollView, Text, VStack, ZStack } from "scripting"
import { PhotoLibraryWorkspace } from "../PhotoLibraryGrid"
import { SettingsScreen } from "./SettingsScreen"
import { CameraHomeHeader, CaptureEntry, HomeIntroduction, LibraryHero } from "./HomeComponents"
import { theme } from "./theme"
import type { HomeScreenProps } from "./types"
import { ViewfinderScreen } from "./ViewfinderScreen"

export function HomeScreen(props: HomeScreenProps) {
  const dismiss = Navigation.useDismiss()
  const { t } = props
  return <NavigationStack>
    <ZStack alignment="top">
      <Rectangle fill={theme.canvas} ignoresSafeArea />
      <ScrollView navigationTitle={t.appTitle} navigationBarTitleDisplayMode="inline" toolbar={{ cancellationAction: <Button title={t.close} action={dismiss} systemImage="xmark" />, topBarTrailing: <NavigationLink destination={<SettingsScreen t={t} locale={props.locale} changeLocale={props.changeLocale} cameraIdentity={props.cameraIdentity} connectionStatus={props.connectionStatus} reconnectCamera={props.reconnectCamera} isConnecting={props.isConnecting} isCameraConnected={props.isCameraConnected} dataConnection={props.dataConnection} libraryReport={props.libraryReport} probePhotoLibrary={props.probePhotoLibrary} />}><HStack spacing={5}><Image systemName="gearshape" /><Text>{t.settings}</Text></HStack></NavigationLink> }} background="clear">
        <VStack alignment="leading" spacing={22} padding={{ top: 12, leading: 20, bottom: 28, trailing: 20 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <CameraHomeHeader t={t} cameraIdentity={props.cameraIdentity} isConnecting={props.isConnecting} isCameraConnected={props.isCameraConnected} />
          <HomeIntroduction t={t} />
          <NavigationLink destination={<PhotoLibraryWorkspace state={props.photoLibrary} t={t} onSelectState={props.setPhotoLibrary} onRefresh={props.refreshPhotoLibrary} onRetryThumbnail={props.retryThumbnail} onTransfer={props.startTransfer} onCancelTransfer={props.cancelTransfer} />}><LibraryHero t={t} /></NavigationLink>
          <NavigationLink destination={<ViewfinderScreen t={t} previewImage={props.previewImage} isPreviewing={props.isPreviewing} previewStatus={props.previewStatus} previewFrames={props.previewFrames} startPreview={props.startPreview} stopPreview={props.stopPreview} />}><CaptureEntry t={t} /></NavigationLink>
          <Text font="caption" foregroundStyle={theme.charcoalMuted}>{props.isCameraConnected ? props.connectionStatus : t.connectionHint}</Text>
        </VStack>
      </ScrollView>
    </ZStack>
  </NavigationStack>
}
