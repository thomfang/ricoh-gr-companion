import { AbortController, HStack, Image, Rectangle, ScrollView, Spacer, Text, useEffect, useState, VStack, ZStack } from "scripting"
import { fetchCameraPhotoInfo } from "./camera-library"
import type { I18nData } from "./i18n/en"
import { formatByteCount, type CameraPhoto, type ThumbnailState } from "./photo-library-model"
import { theme } from "./ui/theme"

export function PhotoDetailScreen({ photo, thumbnail, t }: { photo: CameraPhoto; thumbnail?: ThumbnailState; t: I18nData }) {
  const [info, setInfo] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setInfo(null)
    setError(null)
    void fetchCameraPhotoInfo(photo, controller.signal).then(value => {
      if (active) setInfo(value)
    }).catch(value => {
      if (active && !(value instanceof Error && value.name === "AbortError")) setError(value instanceof Error ? value.message : String(value))
    })
    return () => { active = false; controller.abort() }
  }, [photo.id])

  const rows = detailRows(photo, info, t)
  return <ZStack alignment="top">
    <Rectangle fill={theme.canvas} ignoresSafeArea />
    <ScrollView navigationTitle={t.photoDetails} navigationBarTitleDisplayMode="inline" background="clear">
      <VStack alignment="leading" spacing={22} padding={{ top: 12, leading: 18, bottom: 28, trailing: 18 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <ZStack frame={{ maxWidth: "infinity", minHeight: 280 }} background={theme.opticalBlack}>
          {thumbnail?.phase === "ready" ? <Image image={thumbnail.image} aspectRatio={{ contentMode: "fit" }} frame={{ maxWidth: "infinity", maxHeight: 360 }} /> : <Image systemName={photo.mediaType === "raw" ? "doc.richtext" : "photo"} imageScale="large" foregroundStyle={theme.paperMuted} />}
        </ZStack>
        <VStack alignment="leading" spacing={5}><Text font="title2" fontWeight="bold" foregroundStyle={theme.paper}>{photo.file}</Text><Text font="caption" foregroundStyle={theme.charcoalMuted}>{photo.folder} · {photo.storage}</Text></VStack>
        <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          {rows.map(row => <HStack key={row.label} padding={{ top: 10, bottom: 10 }}><Text font="subheadline" foregroundStyle={theme.paperMuted}>{row.label}</Text><Spacer /><Text font="subheadline" fontWeight="semibold" foregroundStyle={theme.paper}>{row.value}</Text></HStack>)}
        </VStack>
        {!info && !error && <Text font="caption" foregroundStyle={theme.paperMuted}>{t.readingLibrary}</Text>}
        {Boolean(error) && <Text font="caption" foregroundStyle={theme.charcoalMuted}>{t.noMetadata}</Text>}
      </VStack>
    </ScrollView>
  </ZStack>
}

function detailRows(photo: CameraPhoto, info: Record<string, unknown> | null, t: I18nData): Array<{ label: string; value: string }> {
  const value = (key: string, fallback?: string | number) => {
    const candidate = info?.[key] ?? fallback
    return typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : undefined
  }
  return [
    { label: t.fileInformation, value: photo.extension || "—" },
    { label: t.fileSize, value: value("recorded_size", formatByteCount(photo.byteSize)) ?? "—" },
    { label: t.capturedTime, value: value("recorded_time", photo.recordedTime) ?? "—" },
    { label: t.aperture, value: value("av", photo.aperture) ?? "—" },
    { label: t.shutterSpeed, value: value("tv", photo.shutterSpeed) ?? "—" },
    { label: t.sensitivity, value: value("sv", photo.iso) ?? "—" },
    { label: t.exposureCompensation, value: value("xv", photo.exposureCompensation) ?? "—" },
  ]
}
