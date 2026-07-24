import { Button, HStack, Image, Picker, Rectangle, ScrollView, Spacer, Text, VStack, ZStack } from "scripting"
import type { AppLocale } from "../i18n"
import type { SettingsScreenProps } from "./types"
import { theme } from "./theme"

export function SettingsScreen({ t, locale, changeLocale, cameraIdentity, connectionStatus, reconnectCamera, isConnecting, isCameraConnected, dataConnection, libraryReport, probePhotoLibrary }: SettingsScreenProps) {
  return <ZStack alignment="top">
    <Rectangle fill={theme.canvas} ignoresSafeArea />
    <ScrollView navigationTitle={t.settings} navigationBarTitleDisplayMode="inline" background="clear">
      <VStack alignment="leading" spacing={28} padding={20} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <SettingSection icon="camera" title={t.camera}>
          <StatusRow title={t.bluetoothStatus} value={cameraIdentity} active={isCameraConnected} />
          <Text font="caption" foregroundStyle={theme.paperMuted}>{connectionStatus}</Text>
          <Button title={isConnecting ? t.connecting : t.reconnect} action={reconnectCamera} systemImage="antenna.radiowaves.left.and.right" disabled={isConnecting} />
        </SettingSection>
        <SettingSection icon="wifi" title={t.wifiTitle}>
          <StatusRow title={t.wifiStatus} value={dataConnection === "ready" ? t.dataReady : t.dataOffline} active={dataConnection === "ready"} />
          <Text font="subheadline" foregroundStyle={theme.paperMuted}>{t.wifiHint}</Text>
        </SettingSection>
        <SettingSection icon="globe" title={t.language}>
          <VStack alignment="leading" spacing={10} padding={12} frame={{ maxWidth: "infinity", alignment: "leading" }} background={theme.canvasRaised}>
            <Picker title={t.language} value={String(locale)} onChanged={(value: string) => changeLocale(value as AppLocale)} pickerStyle="segmented" frame={{ maxWidth: "infinity" }}>
              <Text tag="system">{t.systemLanguage}</Text>
              <Text tag="zh">{t.chinese}</Text>
              <Text tag="en">{t.english}</Text>
            </Picker>
            <HStack spacing={7}><Image systemName="character.bubble" foregroundStyle={theme.library} /><Text font="caption" foregroundStyle={theme.paperMuted}>{t.languageHint}</Text></HStack>
          </VStack>
        </SettingSection>
        <SettingSection icon="stethoscope" title={t.diagnostics}>
          <Text font="caption" foregroundStyle={theme.paperMuted}>{t.libraryProbeOnly}</Text>
          <Button title={t.runDiagnostics} action={probePhotoLibrary} systemImage="waveform.path.ecg" />
          {libraryReport.length > 0 && <Text textSelection font="caption" foregroundStyle={theme.charcoalMuted}>{libraryReport.join("\n")}</Text>}
        </SettingSection>
      </VStack>
    </ScrollView>
  </ZStack>
}

function SettingSection({ icon, title, children }: { icon: string; title: string; children: any }) {
  return <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <HStack spacing={8}><Image systemName={icon} foregroundStyle={theme.library} /><Text font="caption" fontWeight="semibold" foregroundStyle={theme.charcoalMuted}>{title.toUpperCase()}</Text></HStack>
    {children}
  </VStack>
}

function StatusRow({ title, value, active }: { title: string; value: string; active: boolean }) {
  return <HStack spacing={10} padding={{ top: 8, bottom: 8 }} frame={{ maxWidth: "infinity" }}>
    <Image systemName={active ? "checkmark.circle.fill" : "circle.dashed"} foregroundStyle={active ? theme.capture : theme.charcoalMuted} />
    <VStack alignment="leading" spacing={2}><Text font="subheadline" fontWeight="semibold" foregroundStyle={theme.paper}>{title}</Text><Text font="caption" foregroundStyle={theme.paperMuted}>{value}</Text></VStack>
    <Spacer />
  </HStack>
}
