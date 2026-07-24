import { Button, HStack, Image, LazyVGrid, NavigationLink, Rectangle, ScrollView, Spacer, Text, VStack, ZStack } from "scripting"
import { errorFromCode, localizedError } from "./app-error"
import type { CameraApiProfile } from "./camera-profile"
import { PhotoDetailScreen } from "./PhotoDetailScreen"
import { clearPhotoSelection, formatByteCount, togglePhotoSelection, type CameraPhoto, type PhotoLibraryState, type ThumbnailState, type TransferDestination } from "./photo-library-model"
import type { I18nData } from "./i18n/en"
import { theme } from "./ui/theme"

const gridColumns = [
  { size: { type: "flexible" as const, minimum: 96 }, spacing: 3 },
  { size: { type: "flexible" as const, minimum: 96 }, spacing: 3 },
  { size: { type: "flexible" as const, minimum: 96 }, spacing: 3 },
]

type PhotoLibraryProps = {
  profile?: CameraApiProfile
  state: PhotoLibraryState
  t: I18nData
  onSelectState: (state: PhotoLibraryState) => void
  onRefresh: () => void
  onRetryThumbnail: (photoId: string) => void
  onTransfer: (destination: TransferDestination) => void
  onCancelTransfer: () => void
}

export function PhotoLibraryWorkspace({ profile, state, t, onSelectState, onRefresh, onRetryThumbnail, onTransfer, onCancelTransfer }: PhotoLibraryProps) {
  const selectedCount = state.selectedIds.size
  return <ZStack alignment="top">
    <Rectangle fill={theme.canvas} ignoresSafeArea />
    <ScrollView navigationTitle={t.photoLibrary} navigationBarTitleDisplayMode="inline" background="clear">
      <VStack alignment="leading" spacing={18} padding={{ top: 12, leading: 16, bottom: 28, trailing: 16 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <LibraryHeader state={state} t={t} onRefresh={onRefresh} onClear={() => onSelectState(clearPhotoSelection(state))} />
        {state.phase === "idle" && <EmptyLibrary t={t} onRefresh={onRefresh} />}
        {state.phase === "loading" && state.photos.length === 0 && <LoadingLibrary t={t} />}
        {state.phase === "failed" && state.photos.length === 0 && <FailedLibrary state={state} t={t} onRefresh={onRefresh} />}
        {state.photos.length > 0 && <>
          {state.phase === "failed" && <Text font="caption" foregroundStyle={theme.live}>{state.error ?? t.libraryError}</Text>}
          <LazyVGrid columns={gridColumns} spacing={3}>
            {state.photos.map(photo => <PhotoTile
              profile={profile}
              photo={photo}
              thumbnail={state.thumbnails[photo.id]}
              selected={state.selectedIds.has(photo.id)}
              transferPhase={state.transfer.items[photo.id]?.phase}
              action={() => onSelectState(togglePhotoSelection(state, photo.id))}
              retry={() => onRetryThumbnail(photo.id)}
              tForTile={t}
            />)}
          </LazyVGrid>
        </>}
        {selectedCount > 0 && <TransferPanel state={state} t={t} onTransfer={onTransfer} onCancel={onCancelTransfer} />}
      </VStack>
    </ScrollView>
  </ZStack>
}

function LibraryHeader({ state, t, onRefresh, onClear }: { state: PhotoLibraryState; t: I18nData; onRefresh: () => void; onClear: () => void }) {
  return <VStack alignment="leading" spacing={10}>
    <HStack alignment="firstTextBaseline">
      <VStack alignment="leading" spacing={3}>
        <Text font="title2" fontWeight="bold" foregroundStyle={theme.paper}>{t.photoLibrary}</Text>
        <Text font="caption" foregroundStyle={theme.paperMuted}>{state.photos.length ? t.photoCount(state.photos.length) : t.libraryHint}</Text>
      </VStack>
      <Spacer />
      <Button title={t.refreshLibrary} action={onRefresh} systemImage="arrow.clockwise" disabled={state.phase === "loading" || state.transfer.running} />
    </HStack>
    {state.selectedIds.size > 0 && <HStack><Text font="subheadline" fontWeight="semibold" foregroundStyle={theme.library}>{t.selectedCount(state.selectedIds.size)}</Text><Spacer /><Button title={t.clearSelection} action={onClear} disabled={state.transfer.running} /></HStack>}
  </VStack>
}

function EmptyLibrary({ t, onRefresh }: { t: I18nData; onRefresh: () => void }) {
  return <VStack spacing={14} padding={32} frame={{ maxWidth: "infinity", minHeight: 330 }} background={theme.canvasRaised}>
    <Image systemName="photo.stack" imageScale="large" symbolRenderingMode="hierarchical" foregroundStyle={theme.library} />
    <Text font="headline" foregroundStyle={theme.paper}>{t.libraryEmpty}</Text>
    <Text font="subheadline" foregroundStyle={theme.paperMuted}>{t.libraryHint}</Text>
    <Button title={t.refreshLibrary} action={onRefresh} systemImage="wifi" />
  </VStack>
}

function LoadingLibrary({ t }: { t: I18nData }) {
  return <VStack spacing={14} frame={{ maxWidth: "infinity", minHeight: 300 }}><Image systemName="arrow.triangle.2.circlepath" foregroundStyle={theme.library} /><Text foregroundStyle={theme.paperMuted}>{t.readingLibrary}</Text></VStack>
}

function FailedLibrary({ state, t, onRefresh }: { state: PhotoLibraryState; t: I18nData; onRefresh: () => void }) {
  const displayError = state.error ? localizedError(errorFromCode(state.error) ?? state.error, t) : t.wifiHint
  return <VStack alignment="leading" spacing={12} padding={22} frame={{ maxWidth: "infinity", minHeight: 220, alignment: "leading" }} background={theme.canvasRaised}>
    <Image systemName="wifi.slash" imageScale="large" foregroundStyle={theme.live} />
    <Text font="headline" foregroundStyle={theme.paper}>{t.libraryError}</Text>
    <Text font="subheadline" foregroundStyle={theme.paperMuted}>{displayError}</Text>
    <Button title={t.refreshLibrary} action={onRefresh} />
  </VStack>
}

function PhotoTile({ profile, photo, thumbnail, selected, transferPhase, action, retry, tForTile }: { profile?: CameraApiProfile; photo: CameraPhoto; thumbnail?: ThumbnailState; selected: boolean; transferPhase?: string; action: () => void; retry: () => void; tForTile: I18nData }) {
  const detail = [photo.extension || "FILE", formatByteCount(photo.byteSize)].filter(Boolean).join(" · ")
  return <VStack alignment="leading" spacing={6} padding={6} frame={{ maxWidth: "infinity", minHeight: 148, alignment: "leading" }} background={selected ? theme.selectedSurface : theme.canvasRaised}>
    {profile ? <NavigationLink destination={<PhotoDetailScreen profile={profile} photo={photo} thumbnail={thumbnail} t={tForTile} />}>
      <ZStack frame={{ maxWidth: "infinity", minHeight: 94, maxHeight: 94 }} background={theme.opticalBlack}>
        {thumbnail?.phase === "ready" && <Image image={thumbnail.image} aspectRatio={{ contentMode: "fill" }} frame={{ maxWidth: "infinity", minHeight: 94, maxHeight: 94 }} clipped />}
        {(!thumbnail || thumbnail.phase === "idle" || thumbnail.phase === "loading") && <Image systemName={photo.mediaType === "raw" ? "doc.richtext" : "photo"} foregroundStyle={theme.paperMuted} />}
        {thumbnail?.phase === "failed" && <Button title="" action={retry} systemImage="arrow.clockwise" />}
        {selected && <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topTrailing" }} padding={7}><Image systemName="checkmark.circle.fill" symbolRenderingMode="palette" foregroundStyle={["white", theme.library]} /></VStack>}
      </ZStack>
    </NavigationLink> : <ZStack frame={{ maxWidth: "infinity", minHeight: 94, maxHeight: 94 }} background={theme.opticalBlack}><Image systemName="photo" foregroundStyle={theme.paperMuted} /></ZStack>}
    <Button title={photo.file} action={action} />
    <HStack><Text font="caption2" foregroundStyle={theme.charcoalMuted}>{detail}</Text><Spacer />{Boolean(transferPhase) && <Image systemName={transferSymbol(transferPhase!)} foregroundStyle={transferPhase === "succeeded" ? theme.capture : transferPhase === "failed" ? theme.live : theme.library} />}</HStack>
  </VStack>
}

function TransferPanel({ state, t, onTransfer, onCancel }: { state: PhotoLibraryState; t: I18nData; onTransfer: (destination: TransferDestination) => void; onCancel: () => void }) {
  const transfer = state.transfer
  return <VStack alignment="leading" spacing={12} padding={18} frame={{ maxWidth: "infinity", alignment: "leading" }} background={theme.canvasRaised}>
    <HStack><Image systemName="square.and.arrow.down" foregroundStyle={theme.library} /><Text font="headline" foregroundStyle={theme.paper}>{t.importSelected(state.selectedIds.size)}</Text><Spacer /></HStack>
    {transfer.running ? <>
      <Text font="subheadline" foregroundStyle={theme.paperMuted}>{t.transferProgress(transfer.completed, transfer.total)}</Text>
      <Button title={t.cancelTransfer} action={onCancel} systemImage="xmark.circle" />
    </> : <HStack spacing={12}>
      <Button title={t.saveToPhotos} action={() => onTransfer("photos")} systemImage="photo.badge.arrow.down" />
      <Button title={t.exportToFiles} action={() => onTransfer("files")} systemImage="folder" />
    </HStack>}
  </VStack>
}

function transferSymbol(phase: string): string {
  if (phase === "succeeded") return "checkmark.circle.fill"
  if (phase === "failed") return "exclamationmark.circle.fill"
  if (phase === "cancelled") return "xmark.circle"
  return "arrow.down.circle"
}
