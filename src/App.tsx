import { AbortController, useEffect, useState } from "scripting"
import { errorToken, localizedError, AppError } from "./app-error"
import { resolveCameraApiProfile, type CameraModelSelection } from "./camera-profile"
import { fetchCameraPhotoList, fetchCameraThumbnail, probeCameraPhotoList, type PhotoListDiagnostic } from "./camera-library"
import { parseProfileIdentity } from "./formatters"
import { getI18n, type AppLocale } from "./i18n"
import type { I18nData } from "./i18n/en"
import { LiveViewController } from "./live-view-controller"
import type { CameraIdentity, CameraModel, DiscoveredCamera } from "./models"
import { emptyTransferState, initialPhotoLibraryState, type PhotoLibraryState, type TransferDestination, type TransferItemState } from "./photo-library-model"
import { PhotoTransferController } from "./photo-transfer"
import { cameraFromAdvertisement, isRicohCandidate, readSafeProfile, stopBleScan } from "./ricoh-ble"
import { HomeScreen } from "./ui/HomeScreen"
import type { DataConnectionState } from "./ui/types"

const KNOWN_CAMERA_KEY = "ricoh-gr-known-peripheral"
const CAMERA_MODEL_KEY = "ricoh-gr-camera-model"
const LOCALE_KEY = "ricoh-gr-app-locale"

type KnownCamera = { id: string; name: string; model?: string }
type ConnectionStatus = { kind: "not-connected" | "connecting" | "scanning" | "connected" | "scan-failed" | "connection-failed"; detail?: unknown }
type PreviewStatus = "idle" | "connecting" | "waiting" | "connected" | "stopped" | "ended" | { kind: "error"; detail: string }

/** Application coordinator: owns BLE, HTTP, thumbnail, transfer and LiveView lifecycles. */
export default function App() {
  const [locale, setLocale] = useState<AppLocale>(() => Storage.get<AppLocale>(LOCALE_KEY) ?? "system")
  const t = getI18n(locale)
  const [connection, setConnection] = useState<ConnectionStatus>({ kind: "not-connected" })
  const [detectedIdentity, setDetectedIdentity] = useState<CameraIdentity | null>(null)
  const [cameraModelSelection, setCameraModelSelection] = useState<CameraModelSelection>(() => Storage.get<CameraModelSelection>(CAMERA_MODEL_KEY) ?? "auto")
  const [isConnecting, setIsConnecting] = useState(false)
  const [isCameraConnected, setIsCameraConnected] = useState(false)
  const [dataConnection, setDataConnection] = useState<DataConnectionState>("unknown")
  const [liveViewController] = useState(() => new LiveViewController())
  const [transferController] = useState(() => new PhotoTransferController())
  const [libraryRequest] = useState(() => ({ controller: null as AbortController | null, generation: 0 }))
  const [previewImage, setPreviewImage] = useState<UIImage | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle")
  const [previewFrames, setPreviewFrames] = useState(0)
  const [photoLibrary, setPhotoLibrary] = useState<PhotoLibraryState>(initialPhotoLibraryState)
  const [libraryReport, setLibraryReport] = useState<PhotoListDiagnostic | null>(null)
  const detectedModel: CameraModel = detectedIdentity?.model ?? "unknown"
  const cameraProfile = resolveCameraApiProfile(cameraModelSelection, detectedModel)
  const cameraIdentity = detectedIdentity ? t.profileIdentity(detectedIdentity.displayModel, detectedIdentity.firmware ?? "") : t.notConnected
  const connectionStatus = localizeConnection(connection, t)
  const previewStatusText = localizePreviewStatus(previewStatus, t)
  const libraryReportLines = libraryReport ? localizePhotoDiagnostic(libraryReport, t) : []

  function changeCameraModel(next: CameraModelSelection) {
    if (next === cameraModelSelection) return
    Storage.set(CAMERA_MODEL_KEY, next)
    libraryRequest.controller?.abort()
    libraryRequest.generation += 1
    transferController.cancel()
    void liveViewController.stop()
    setCameraModelSelection(next)
    setPhotoLibrary(initialPhotoLibraryState)
    setLibraryReport(null)
    setDataConnection("unknown")
    setPreviewImage(null)
    setPreviewFrames(0)
    setIsPreviewing(false)
    setPreviewStatus("idle")
  }

  function requireProfile() {
    if (!cameraProfile) throw new AppError("profile-unresolved")
    return cameraProfile
  }

  function changeLocale(next: AppLocale) {
    Storage.set(LOCALE_KEY, next)
    setLocale(next)
  }

  async function stopScan() { await stopBleScan().catch(() => undefined) }

  async function connectCamera(camera: DiscoveredCamera) {
    setIsConnecting(true)
    setConnection({ kind: "connecting" })
    try {
      await stopScan()
      const peripheral = (await BluetoothCentralManager.retrievePeripherals([camera.id]))[0]
      if (!peripheral) throw new AppError("peripheral-unavailable")
      peripheral.onDisconnected = error => {
        setIsCameraConnected(false)
        setConnection(error ? { kind: "connection-failed", detail: error } : { kind: "not-connected" })
      }
      peripheral.onConnectFailed = error => {
        setIsCameraConnected(false)
        setConnection({ kind: "connection-failed", detail: error })
      }
      await BluetoothCentralManager.connect(peripheral, { notifyOnDisconnection: true, enableAutoReconnect: false })
      const profile = await readSafeProfile(peripheral)
      const identity = parseProfileIdentity(profile)
      Storage.set(KNOWN_CAMERA_KEY, { id: camera.id, name: camera.name, model: identity.model })
      setDetectedIdentity(identity)
      setIsCameraConnected(true)
      setConnection({ kind: "connected" })
    } catch (error) {
      setDetectedIdentity(null)
      setIsCameraConnected(false)
      setConnection({ kind: "connection-failed", detail: error })
    } finally {
      setIsConnecting(false)
    }
  }

  async function scanAndConnect() {
    if (isConnecting) return
    setIsConnecting(true)
    setConnection({ kind: "scanning" })
    let selected = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    try {
      await BluetoothCentralManager.startScan((peripheral, advertisementData, rssi) => {
        const name = advertisementData.localName ?? peripheral.name ?? "RICOH GR"
        if (selected || !isRicohCandidate(name, advertisementData.serviceUUIDs ?? [])) return
        const camera = cameraFromAdvertisement(peripheral, advertisementData, rssi)
        if (!camera.connectable) return
        selected = true
        if (timeout) clearTimeout(timeout)
        void connectCamera(camera)
      }, { allowDuplicates: true })
      timeout = setTimeout(() => {
        if (!selected) {
          void stopScan()
          setIsConnecting(false)
          setConnection({ kind: "scan-failed", detail: new AppError("camera-not-found") })
        }
      }, 8000)
    } catch (error) {
      setIsConnecting(false)
      setConnection({ kind: "scan-failed", detail: error })
    }
  }

  async function reconnectCamera() {
    await stopPreview()
    const known = Storage.get<KnownCamera>(KNOWN_CAMERA_KEY)
    if (known?.id) await connectCamera({ id: known.id, name: known.name || "RICOH GR", rssi: 0, connectable: true, advertisedServices: [] })
    else await scanAndConnect()
  }

  async function refreshPhotoLibrary() {
    libraryRequest.controller?.abort()
    const controller = new AbortController()
    const generation = ++libraryRequest.generation
    libraryRequest.controller = controller
    setDataConnection("checking")
    setPhotoLibrary(current => ({ ...current, phase: "loading", error: null }))
    try {
      const photos = await fetchCameraPhotoList(requireProfile(), controller.signal)
      if (generation !== libraryRequest.generation) return
      setDataConnection("ready")
      setPhotoLibrary(current => {
        const availableIds = new Set(photos.map(photo => photo.id))
        const selectedIds = new Set([...current.selectedIds].filter(id => availableIds.has(id)))
        return { ...current, phase: "ready", photos, selectedIds, thumbnails: {}, error: null }
      })
      void loadThumbnails(photos, controller, generation)
    } catch (error) {
      if (generation !== libraryRequest.generation) return
      setDataConnection("offline")
      setPhotoLibrary(current => ({ ...current, phase: "failed", error: errorToken(error) }))
    }
  }

  async function loadThumbnails(photos: PhotoLibraryState["photos"], controller: AbortController, generation: number) {
    let nextIndex = 0
    const worker = async () => {
      while (nextIndex < photos.length && generation === libraryRequest.generation) {
        const photo = photos[nextIndex++]
        await loadThumbnail(photo, controller, generation)
      }
    }
    await Promise.all([worker(), worker(), worker()])
  }

  async function loadThumbnail(photo: PhotoLibraryState["photos"][number], controller = libraryRequest.controller, generation = libraryRequest.generation) {
    const photoId = photo.id
    if (!controller) return
    setPhotoLibrary(current => ({ ...current, thumbnails: { ...current.thumbnails, [photoId]: { phase: "loading" } } }))
    try {
      const image = await fetchCameraThumbnail(requireProfile(), photo, controller.signal)
      if (generation !== libraryRequest.generation) return
      setPhotoLibrary(current => ({ ...current, thumbnails: { ...current.thumbnails, [photoId]: { phase: "ready", image } } }))
    } catch (error) {
      if (generation !== libraryRequest.generation) return
      setPhotoLibrary(current => ({ ...current, thumbnails: { ...current.thumbnails, [photoId]: { phase: "failed", error: errorToken(error) } } }))
    }
  }

  function retryThumbnail(photoId: string) {
    const photo = photoLibrary.photos.find(item => item.id === photoId)
    if (photo) void loadThumbnail(photo)
  }

  async function probePhotoLibrary() {
    setLibraryReport(null)
    setDataConnection("checking")
    try {
      const report = await probeCameraPhotoList(requireProfile())
      setLibraryReport(report)
      setDataConnection(report.status >= 200 && report.status < 300 ? "ready" : "offline")
    } catch (error) {
      setLibraryReport({ profileId: cameraProfile?.id ?? "unresolved", routeKind: "", status: 0, statusText: localizedError(error, t), parseError: localizedError(error, t) })
      setDataConnection("offline")
    }
  }

  async function startTransfer(destination: TransferDestination) {
    const selected = photoLibrary.photos.filter(photo => photoLibrary.selectedIds.has(photo.id))
    if (selected.length === 0 || photoLibrary.transfer.running) return
    const items = Object.fromEntries(selected.map(photo => [photo.id, { photoId: photo.id, phase: "queued", receivedBytes: 0 } as TransferItemState]))
    setPhotoLibrary(current => ({ ...current, transfer: { destination, running: true, completed: 0, total: selected.length, items } }))
    try {
      await transferController.transfer(requireProfile(), selected, destination, item => {
        setPhotoLibrary(current => {
          const nextItems = { ...current.transfer.items, [item.photoId]: item }
          const completed = Object.values(nextItems).filter(value => ["succeeded", "failed", "cancelled"].includes(value.phase)).length
          return { ...current, transfer: { ...current.transfer, items: nextItems, completed } }
        })
      })
    } catch (error) {
      const message = localizedError(error, t)
      setPhotoLibrary(current => {
        const nextItems = Object.fromEntries(Object.entries(current.transfer.items).map(([id, item]) => [id, ["succeeded", "failed", "cancelled"].includes(item.phase) ? item : { ...item, phase: "failed" as const, error: message }]))
        return { ...current, transfer: { ...current.transfer, items: nextItems, completed: Object.keys(nextItems).length } }
      })
    } finally {
      setPhotoLibrary(current => {
        const succeeded = new Set(Object.values(current.transfer.items).filter(item => item.phase === "succeeded").map(item => item.photoId))
        return { ...current, selectedIds: new Set([...current.selectedIds].filter(id => !succeeded.has(id))), transfer: { ...current.transfer, running: false } }
      })
    }
  }

  function cancelTransfer() { transferController.cancel() }

  function startPreview() {
    if (liveViewController.running || !cameraProfile) {
      if (!cameraProfile) setPreviewStatus({ kind: "error", detail: t.profileUnresolved })
      return
    }
    setPreviewImage(null)
    setPreviewFrames(0)
    setIsPreviewing(true)
    setPreviewStatus("connecting")
    void liveViewController.start(cameraProfile, {
      onState: state => setPreviewStatus(state === "receiving" ? "waiting" : "connecting"),
      onFrame: (image, framesDecoded) => { setPreviewImage(image); setPreviewFrames(framesDecoded); setPreviewStatus("connected"); setDataConnection("ready") },
      onError: error => { setIsPreviewing(false); setPreviewStatus({ kind: "error", detail: localizedError(error, t) }); setDataConnection("offline") },
      onStopped: state => { setIsPreviewing(false); setPreviewStatus(state === "ended" ? "ended" : "stopped") },
    })
  }

  async function stopPreview() {
    await liveViewController.stop()
    setIsPreviewing(false)
    setPreviewImage(null)
    setPreviewStatus("stopped")
  }

  useEffect(() => {
    void reconnectCamera()
    return () => {
      libraryRequest.controller?.abort()
      transferController.cancel()
      void liveViewController.stop()
      void stopScan()
    }
  }, [])

  return <HomeScreen
    t={t}
    cameraIdentity={cameraIdentity}
    connectionStatus={connectionStatus}
    isConnecting={isConnecting}
    isCameraConnected={isCameraConnected}
    dataConnection={dataConnection}
    photoLibrary={photoLibrary}
    setPhotoLibrary={setPhotoLibrary}
    refreshPhotoLibrary={refreshPhotoLibrary}
    retryThumbnail={retryThumbnail}
    startTransfer={startTransfer}
    cancelTransfer={cancelTransfer}
    libraryReport={libraryReportLines}
    probePhotoLibrary={probePhotoLibrary}
    cameraModelSelection={cameraModelSelection}
    changeCameraModel={changeCameraModel}
    detectedModel={detectedModel}
    cameraProfile={cameraProfile}
    previewImage={previewImage}
    isPreviewing={isPreviewing}
    previewStatus={previewStatusText}
    previewFrames={previewFrames}
    startPreview={startPreview}
    stopPreview={stopPreview}
    locale={locale}
    changeLocale={changeLocale}
    reconnectCamera={reconnectCamera}
  />
}

function localizeConnection(status: ConnectionStatus, t: I18nData): string {
  switch (status.kind) {
    case "not-connected": return t.notConnected
    case "connecting": return t.connecting
    case "scanning": return t.scanning
    case "connected": return t.connectedShort
    case "scan-failed": return t.scanFailed(status.detail ? localizedError(status.detail, t) : "")
    case "connection-failed": return t.connectionFailed(status.detail ? localizedError(status.detail, t) : "")
  }
}

function localizePreviewStatus(status: PreviewStatus, t: I18nData): string {
  if (typeof status === "object") return t.previewError(status.detail)
  switch (status) {
    case "idle": return t.noFrame
    case "connecting": return t.liveViewConnecting
    case "waiting": return t.liveViewWaitingForFrame
    case "connected": return t.liveViewConnected
    case "stopped": return t.liveViewStopped
    case "ended": return t.liveViewStreamEnded
  }
}

function localizePhotoDiagnostic(report: PhotoListDiagnostic, t: I18nData): string[] {
  const format = report.recognizedFormat === "files" ? "files" : report.recognizedFormat === "dirs" ? "dirs → name/files" : t.diagnosticUnrecognized
  const lines = [
    t.diagnosticProfileId(report.profileId),
    t.diagnosticRouteKind(report.routeKind || t.diagnosticNone),
    t.diagnosticHttpStatus(report.status, report.statusText),
    t.diagnosticContentType(report.contentType ?? t.diagnosticNotProvided),
    t.diagnosticContentLength(report.contentLength ?? t.diagnosticNotProvided),
  ]
  if (report.topLevelKeys) lines.push(t.diagnosticTopLevelKeys(report.topLevelKeys.join(", ") || t.diagnosticNone))
  if (report.itemCount !== undefined) lines.push(t.diagnosticItemCount(report.itemCount))
  if (report.recognizedFormat) lines.push(t.diagnosticRecognizedFormat(format))
  if (report.parseError) lines.push(t.diagnosticParseFailed(report.parseError))
  lines.push(t.diagnosticRedactedSummary)
  return lines
}
