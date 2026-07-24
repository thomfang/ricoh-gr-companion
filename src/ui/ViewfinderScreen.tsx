import { Button, HStack, Image, Rectangle, ScrollView, Spacer, Text, VStack, ZStack } from "scripting"
import type { ViewfinderScreenProps } from "./types"
import { theme } from "./theme"

export function ViewfinderScreen({ t, previewImage, isPreviewing, previewStatus, previewFrames, startPreview, stopPreview }: ViewfinderScreenProps) {
  return <ZStack alignment="top" onDisappear={() => { void stopPreview() }}>
    <Rectangle fill={theme.canvas} ignoresSafeArea />
    <ScrollView navigationTitle={t.liveView} navigationBarTitleDisplayMode="inline" background="clear">
      <VStack spacing={18} padding={{ top: 12, leading: 16, bottom: 28, trailing: 16 }} frame={{ maxWidth: "infinity" }}>
        <VStack spacing={10} padding={8} frame={{ maxWidth: "infinity", minHeight: 380 }} background={theme.opticalBlack}>
          <ZStack frame={{ maxWidth: "infinity", minHeight: 326 }}>
            {previewImage
              ? <Image image={previewImage} aspectRatio={{ value: 4 / 3, contentMode: "fit" }} frame={{ maxWidth: "infinity" }} />
              : <VStack spacing={12}><Image systemName="viewfinder" imageScale="large" foregroundStyle={theme.charcoalMuted} /><Text font="caption" foregroundStyle={theme.charcoalMuted}>{t.noFrame}</Text></VStack>}
            <ViewfinderGuides />
          </ZStack>
          <HStack>
            <HStack spacing={7}><Image systemName={isPreviewing ? "record.circle.fill" : "circle"} foregroundStyle={isPreviewing ? theme.live : theme.charcoalMuted} /><Text font="caption" fontWeight="semibold" foregroundStyle={isPreviewing ? theme.live : theme.paperMuted}>{isPreviewing ? t.liveBadge : t.standbyBadge}</Text></HStack>
            <Spacer />
            <Text font="caption" foregroundStyle={theme.paperMuted}>{t.frames(previewFrames)}</Text>
          </HStack>
        </VStack>
        <Text font="subheadline" frame={{ maxWidth: "infinity", alignment: "center" }} foregroundStyle={theme.paperMuted}>{previewStatus}</Text>
        <Button title={isPreviewing ? t.stopPreview : t.startPreview} action={isPreviewing ? stopPreview : startPreview} systemImage={isPreviewing ? "stop.fill" : "play.fill"} frame={{ maxWidth: "infinity" }} />
        <Text font="caption" foregroundStyle={theme.charcoalMuted}>{t.previewSafety}</Text>
      </VStack>
    </ScrollView>
  </ZStack>
}

function ViewfinderGuides() {
  return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} allowsHitTesting={false}>
    <Rectangle fill="clear" stroke={{ color: "white", opacity: 0.22 }} padding={{ top: 24, leading: 24, bottom: 24, trailing: 24 }} />
    <Image systemName="plus" imageScale="small" foregroundStyle="white" opacity={0.45} />
  </ZStack>
}
