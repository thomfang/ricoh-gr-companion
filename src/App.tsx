import { AbortController, useEffect, useState } from "scripting"
import { fetchCameraPhotoList, fetchCameraThumbnail, probeCameraPhotoList } from "./camera-library"
import { formatError, parseProfileIdentity, profileIdentity } from "./formatters"
import { getI18n, type AppLocale } from "./i18n"
import { LiveViewController } from "./live-view-controller"
import type { DiscoveredCamera } from "./models"
import { emptyTransferState, initialPhotoLibraryState, type PhotoLibraryState, type TransferDestination, type TransferItemState } from "./photo-library-model"
import { PhotoTransferController } from "./photo-transfer"
import { cameraFromAdvertisement, isRicohCandidate, readSafeProfile, stopBleScan } from "./ricoh-ble"
import { HomeScreen } from "./ui/HomeScreen"
import type { DataConnectionState } from "./ui/types"

const KNOWN_CAMERA_KEY = "ricoh-gr-known-peripheral"
const LOCALE_KEY = "ricoh-gr-app-locale"

type KnownCamera = { id: string; name: string; model?: string }

/** Application coordinator: owns BLE, HTTP, thumbnail, transfer and LiveView lifecycles. */
export default function App() {
  const [locale, setLocale] = useState<AppLocale>(() => Storage.get<AppLocale>(LOCALE_KEY) ?? "system")
  const t = getI18n(locale)
  const [connectionStatus, setConnectionStatus] = useState(t.notConnected)
  const [cameraIdentity, setCameraIdentity] = useState(t.notConnected)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isCameraConnected, setIsCameraConnected] = useState(false)
  const [dataConnection, setDataConnection] = useState<DataConnectionState>("unknown")
  const [liveViewController] = useState(() => new LiveViewController())
  const [transferController] = useState(() => new PhotoTransferController())
  const [libraryRequest] = useState(() => ({ controller: null as AbortController | null, generation: 0 }))
  const [previewImage, setPreviewImage] = useState<UIImage | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewStatus, setPreviewStatus] = useState(t.noFrame)
  const [previewFrames, setPreviewFrames] = useState(0)
  const [photoLibrary, setPhotoLibrary] = useState<PhotoLibraryState>(initialPhotoLibraryState)
  const [libraryReport, setLibraryReport] = useState<string[]>([])

  function changeLocale(next: AppLocale) {
    Storage.set(LOCALE_KEY, next)
    setLocale(next)
  }

  async function stopScan() { await stopBleScan().catch(() => undefined) }

  async function connectCamera(camera: DiscoveredCamera) {
    setIsConnecting(true)
    setConnectionStatus(t.connecting)
    try {
      await stopScan()
      const peripheral = (await BluetoothCentralManager.retrievePeripherals([camera.id]))[0]
      if (!peripheral) throw new Error("Peripheral unavailable")
      peripheral.onDisconnected = error => {
        setIsCameraConnected(false)
        setConnectionStatus(error ? t.connectionFailed(formatError(error)) : t.notConnected)
      }
      peripheral.onConnectFailed = error => {
        setIsCameraConnected(false)
        setConnectionStatus(t.connectionFailed(formatError(error)))
      }
      await BluetoothCentralManager.connect(peripheral, { notifyOnDisconnection: true, enableAutoReconnect: false })
      const profile = await readSafeProfile(peripheral)
      const identity = parseProfileIdentity(profile)
      Storage.set(KNOWN_CAMERA_KEY, { id: camera.id, name: camera.name, model: identity.model })
      const displayIdentity = profileIdentity(profile)
      setCameraIdentity(displayIdentity)
      setIsCameraConnected(true)
      setConnectionStatus(t.cameraConnected(displayIdentity))
    } catch (error) {
      setCameraIdentity(t.notConnected)
      setIsCameraConnected(false)
      setConnectionStatus(t.connectionFailed(formatError(error)))
    } finally {
      setIsConnecting(false)
    }
  }

  async function scanAndConnect() {
    if (isConnecting) return
    setIsConnecting(true)
    setConnectionStatus(t.scanning)
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
          setConnectionStatus(t.scanFailed("No RICOH GR found"))
        }
      }, 8000)
    } catch (error) {
      setIsConnecting(false)
      setConnectionStatus(t.scanFailed(formatError(error)))
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
      const photos = await fetchCameraPhotoList(controller.signal)
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
      setPhotoLibrary(current => ({ ...current, phase: "failed", error: formatError(error) }))
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
      const image = await fetchCameraThumbnail(photo, controller.signal)
      if (generation !== libraryRequest.generation) return
      setPhotoLibrary(current => ({ ...current, thumbnails: { ...current.thumbnails, [photoId]: { phase: "ready", image } } }))
    } catch (error) {
      if (generation !== libraryRequest.generation) return
      setPhotoLibrary(current => ({ ...current, thumbnails: { ...current.thumbnails, [photoId]: { phase: "failed", error: formatError(error) } } }))
    }
  }

  function retryThumbnail(photoId: string) {
    const photo = photoLibrary.photos.find(item => item.id === photoId)
    if (photo) void loadThumbnail(photo)
  }

  async function probePhotoLibrary() {
    setLibraryReport([t.readingLibrary])
    try {
      const report = await probeCameraPhotoList()
      setLibraryReport(report)
      setDataConnection(report[0]?.includes("200") ? "ready" : "offline")
    } catch (error) {
      setLibraryReport([`${t.libraryError} ${formatError(error)}`])
      setDataConnection("offline")
    }
  }

  async function startTransfer(destination: TransferDestination) {
    const selected = photoLibrary.photos.filter(photo => photoLibrary.selectedIds.has(photo.id))
    if (selected.length === 0 || photoLibrary.transfer.running) return
    const items = Object.fromEntries(selected.map(photo => [photo.id, { photoId: photo.id, phase: "queued", receivedBytes: 0 } as TransferItemState]))
    setPhotoLibrary(current => ({ ...current, transfer: { destination, running: true, completed: 0, total: selected.length, items } }))
    await transferController.transfer(selected, destination, item => {
      setPhotoLibrary(current => {
        const nextItems = { ...current.transfer.items, [item.photoId]: item }
        const completed = Object.values(nextItems).filter(value => ["succeeded", "failed", "cancelled"].includes(value.phase)).length
        return { ...current, transfer: { ...current.transfer, items: nextItems, completed } }
      })
    })
    setPhotoLibrary(current => {
      const succeeded = new Set(Object.values(current.transfer.items).filter(item => item.phase === "succeeded").map(item => item.photoId))
      return { ...current, selectedIds: new Set([...current.selectedIds].filter(id => !succeeded.has(id))), transfer: { ...current.transfer, running: false } }
    })
  }

  function cancelTransfer() { transferController.cancel() }

  function startPreview() {
    if (liveViewController.running) return
    setPreviewImage(null)
    setPreviewFrames(0)
    setIsPreviewing(true)
    setPreviewStatus(t.connecting)
    void liveViewController.start({
      onState: () => setPreviewStatus(t.waitingForFrame),
      onFrame: (image, framesDecoded) => { setPreviewImage(image); setPreviewFrames(framesDecoded); setPreviewStatus(t.previewConnected); setDataConnection("ready") },
      onError: message => { setIsPreviewing(false); setPreviewStatus(t.previewError(message)); setDataConnection("offline") },
      onStopped: () => { setIsPreviewing(false); setPreviewStatus(t.previewStopped) },
    })
  }

  async function stopPreview() {
    await liveViewController.stop()
    setIsPreviewing(false)
    setPreviewImage(null)
    setPreviewStatus(t.previewStopped)
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
    libraryReport={libraryReport}
    probePhotoLibrary={probePhotoLibrary}
    previewImage={previewImage}
    isPreviewing={isPreviewing}
    previewStatus={previewStatus}
    previewFrames={previewFrames}
    startPreview={startPreview}
    stopPreview={stopPreview}
    locale={locale}
    changeLocale={changeLocale}
    reconnectCamera={reconnectCamera}
  />
}
