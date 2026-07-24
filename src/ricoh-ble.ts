import { AppError } from "./app-error"
import { formatError } from "./formatters"
import type { DiscoveredCamera } from "./models"

const RICOH_SERVICE_UUIDS = new Set([
  "9A5ED1C5-74CC-4C50-B5B6-66A48E7CCFF1",
  "4B445988-CAA0-4DD3-941D-37B4F52ACA86",
  "9F00F387-8345-4BBC-8B92-B87B52E3091A",
  "0F291746-0C80-4726-87A7-3C501FD3B4B6",
].map(value => value.toUpperCase()))

const SAFE_DEVICE_INFO = {
  "2A24": "model",
  "2A26": "firmware",
  "2A28": "software",
  "2A29": "manufacturer",
} as const
const DEVICE_INFORMATION_SERVICE_UUID = "180A"
const CAMERA_SERVICE_UUID = "4B445988-CAA0-4DD3-941D-37B4F52ACA86"
const OPERATION_MODE_UUID = "1452335A-EC7F-4877-B8AB-0F72E18BB295"

type SafeDeviceInfoUuid = keyof typeof SAFE_DEVICE_INFO
export type SafeProfileField = typeof SAFE_DEVICE_INFO[SafeDeviceInfoUuid] | "operationMode"

export type SafeProfileReadFailure = {
  field: SafeProfileField
  serviceUuid: string
  characteristicUuid: string
  error: string
}

export type SafeCameraProfile = {
  model?: string
  firmware?: string
  software?: string
  manufacturer?: string
  operationMode?: number
  readFailures: SafeProfileReadFailure[]
}

function normalizeGattUuid(uuid: string): string {
  const upper = uuid.toUpperCase()
  const bluetoothBaseMatch = upper.match(/^0000([0-9A-F]{4})-0000-1000-8000-00805F9B34FB$/)
  return bluetoothBaseMatch?.[1] ?? upper
}

function decodeDeviceInfo(data: Data): string {
  return (data.toDecodedString("utf8") ?? "").replace(/\u0000/g, "").trim()
}

function decodeOperationMode(data: Data): number {
  const hex = data.toHexString().replace(/[^0-9A-F]/gi, "")
  if (hex.length < 2) throw new Error("Operation mode value is empty")
  return Number.parseInt(hex.slice(0, 2), 16)
}

export function isRicohCandidate(name: string, advertisedServices: string[]): boolean {
  const upperName = name.toUpperCase()
  const hasRicohName = upperName === "GR" || upperName.startsWith("GR_") || upperName.includes("RICOH") || upperName.includes("PENTAX") || upperName.includes("GRIII") || upperName.includes("GR III")
  return hasRicohName || advertisedServices.some(uuid => RICOH_SERVICE_UUIDS.has(uuid.toUpperCase()))
}

export function cameraFromAdvertisement(peripheral: BluetoothPeripheral, advertisementData: BluetoothAdvertisementData, rssi: number): DiscoveredCamera {
  return {
    id: peripheral.id,
    name: advertisementData.localName ?? peripheral.name ?? "RICOH GR",
    rssi,
    connectable: advertisementData.isConnectable ?? true,
    advertisedServices: advertisementData.serviceUUIDs ?? [],
  }
}

export async function stopBleScan(): Promise<void> {
  if (await BluetoothCentralManager.isScanning) await BluetoothCentralManager.stopScan()
}

export async function discoverServices(peripheral: BluetoothPeripheral): Promise<BluetoothService[]> {
  return new Promise<BluetoothService[]>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new AppError("service-discovery-timeout")), 8000)
    peripheral.onDiscoverServices = (error, discovered) => {
      clearTimeout(timeout)
      peripheral.onDiscoverServices = null
      error ? reject(error) : resolve(discovered ?? [])
    }
    void peripheral.discoverServices().catch(error => {
      clearTimeout(timeout)
      peripheral.onDiscoverServices = null
      reject(error)
    })
  })
}

export async function discoverCharacteristics(peripheral: BluetoothPeripheral, service: BluetoothService): Promise<BluetoothCharacteristic[]> {
  return new Promise<BluetoothCharacteristic[]>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new AppError("characteristic-discovery-timeout")), 8000)
    peripheral.onDiscoverCharacteristics = (error, discovered) => {
      clearTimeout(timeout)
      peripheral.onDiscoverCharacteristics = null
      error ? reject(error) : resolve(discovered ?? [])
    }
    void peripheral.discoverCharacteristics(service).catch(error => {
      clearTimeout(timeout)
      peripheral.onDiscoverCharacteristics = null
      reject(error)
    })
  })
}

export type GattDiagnostic = {
  services: Array<{ uuid: string; primary: boolean; characteristics: Array<{ uuid: string; properties: string[] }>; error?: string }>
}

export async function discoverGatt(peripheral: BluetoothPeripheral): Promise<GattDiagnostic> {
  const result: GattDiagnostic = { services: [] }
  for (const service of await discoverServices(peripheral)) {
    const entry: GattDiagnostic["services"][number] = { uuid: service.uuid, primary: Boolean(service.isPrimary), characteristics: [] }
    try {
      entry.characteristics = (await discoverCharacteristics(peripheral, service)).map(characteristic => ({ uuid: characteristic.uuid, properties: characteristic.properties }))
    } catch (error) {
      entry.error = formatError(error)
    }
    result.services.push(entry)
  }
  return result
}

export async function readSafeProfile(peripheral: BluetoothPeripheral): Promise<SafeCameraProfile> {
  const profile: SafeCameraProfile = { readFailures: [] }

  for (const service of await discoverServices(peripheral)) {
    const serviceUuid = normalizeGattUuid(service.uuid)
    if (serviceUuid !== DEVICE_INFORMATION_SERVICE_UUID && serviceUuid !== CAMERA_SERVICE_UUID) continue

    for (const characteristic of await discoverCharacteristics(peripheral, service)) {
      const characteristicUuid = normalizeGattUuid(characteristic.uuid)
      const field = serviceUuid === DEVICE_INFORMATION_SERVICE_UUID
        ? SAFE_DEVICE_INFO[characteristicUuid as SafeDeviceInfoUuid]
        : characteristicUuid === OPERATION_MODE_UUID ? "operationMode" : undefined
      if (!field || !characteristic.properties.includes("read")) continue

      try {
        const data = await peripheral.readValue(characteristic)
        if (field === "operationMode") profile.operationMode = decodeOperationMode(data)
        else profile[field] = decodeDeviceInfo(data)
      } catch (error) {
        profile.readFailures.push({
          field,
          serviceUuid: service.uuid,
          characteristicUuid: characteristic.uuid,
          error: formatError(error),
        })
      }
    }
  }

  return profile
}
