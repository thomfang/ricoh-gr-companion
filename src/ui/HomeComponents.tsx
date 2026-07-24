import { HStack, Image, Rectangle, Spacer, Text, VStack, ZStack } from "scripting"
import type { I18nData } from "../i18n/en"
import { theme } from "./theme"

export function CameraHomeHeader({ t, cameraIdentity, isConnecting, isCameraConnected }: { t: I18nData; cameraIdentity: string; isConnecting: boolean; isCameraConnected: boolean }) {
  const status = isConnecting ? t.connectingShort : isCameraConnected ? t.connectedShort : t.notConnectedShort
  const symbol = isConnecting ? "dot.radiowaves.left.and.right" : isCameraConnected ? "circle.fill" : "circle"
  const color = isConnecting ? theme.library : isCameraConnected ? theme.capture : theme.charcoalMuted
  return <HStack spacing={9} padding={{ top: 6, bottom: 6 }}>
    <Image systemName={symbol} foregroundStyle={color} symbolRenderingMode="hierarchical" />
    <Text font="caption" fontWeight="semibold" foregroundStyle={theme.paperMuted}>{status}</Text>
    <Spacer />
    <Text font="caption" foregroundStyle={theme.charcoalMuted}>{cameraIdentity}</Text>
  </HStack>
}

export function HomeIntroduction({ t }: { t: I18nData }) {
  return <VStack alignment="leading" spacing={10} padding={{ top: 22, bottom: 28 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <Text font="caption" fontWeight="semibold" foregroundStyle={theme.library}>{t.grMark}</Text>
    <Text font="largeTitle" fontWeight="bold" fontDesign="rounded" foregroundStyle={theme.paper}>{t.libraryHeadline}</Text>
    <Text font="body" foregroundStyle={theme.paperMuted}>{t.homeTagline}</Text>
  </VStack>
}

export function LibraryHero({ t }: { t: I18nData }) {
  return <VStack alignment="leading" spacing={14} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <ZStack frame={{ maxWidth: "infinity", minHeight: 190 }} background={theme.opticalBlack}>
      <Image systemName="photo.on.rectangle.angled" imageScale="large" symbolRenderingMode="hierarchical" foregroundStyle={theme.paperMuted} />
      <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={18}><Text font="caption" fontWeight="semibold" foregroundStyle={theme.paperMuted}>{t.libraryEyebrow}</Text></VStack>
    </ZStack>
    <HStack alignment="firstTextBaseline"><VStack alignment="leading" spacing={4}><Text font="title2" fontWeight="bold" foregroundStyle={theme.paper}>{t.photoLibrary}</Text><Text font="subheadline" foregroundStyle={theme.paperMuted}>{t.homeLibraryDetail}</Text></VStack><Spacer /><Image systemName="arrow.up.right" foregroundStyle={theme.library} /></HStack>
    <Rectangle fill={theme.line} frame={{ maxWidth: "infinity", height: 1 }} />
  </VStack>
}

export function CaptureEntry({ t }: { t: I18nData }) {
  return <VStack alignment="leading" spacing={14} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <HStack spacing={16} padding={{ top: 8, bottom: 8 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <ZStack frame={{ width: 52, height: 52 }} background={theme.canvasRaised}><Image systemName="viewfinder" imageScale="large" symbolRenderingMode="hierarchical" foregroundStyle={theme.capture} /></ZStack>
      <VStack alignment="leading" spacing={4}><Text font="title3" fontWeight="bold" foregroundStyle={theme.paper}>{t.liveView}</Text><Text font="subheadline" foregroundStyle={theme.paperMuted}>{t.captureEntryDetail}</Text></VStack>
      <Spacer />
      <Image systemName="chevron.right" foregroundStyle={theme.charcoalMuted} />
    </HStack>
    <Rectangle fill={theme.line} frame={{ maxWidth: "infinity", height: 1 }} />
  </VStack>
}
