import { formatError, formatReadValue } from "./formatters"
import type { DiscoveredCamera } from "./models"

const RICOH_SERVICE_UUIDS = new Set([
  "9A5ED1C5-74CC-4C50-B5B6-66A48E7CCFF1",
  "4B445988-CAA0-4DD3-941D-37B4F52ACA86",
  "9F00F387-8345-4BBC-8B92-B87B52E3091A",
  "0F291746-0C80-4726-87A7-3C501FD3B4B6",
].map(value => value.toUpperCase()))

const SAFE_DEVICE_INFO: Record<string, string> = {
  "2A24": "型号",
  "2A26": "固件修订",
  "2A28": "软件修订",
  "2A29": "厂商",
}
const CAMERA_SERVICE_UUID = "4B445988-CAA0-4DD3-941D-37B4F52ACA86"
const OPERATION_MODE_UUID = "1452335A-EC7F-4877-B8AB-0F72E18BB295"

export function isRicohCandidate(name: string, advertisedServices: string[]): boolean {
  const upperName = name.toUpperCase()
  const hasRicohName = upperName === "GR" || upperName.startsWith("GR_") || upperName.includes("RICOH") || upperName.includes("PENTAX") || upperName.includes("GRIII") || upperName.includes("GR III")
  return hasRicohName || advertisedServices.some(uuid => RICOH_SERVICE_UUIDS.has(uuid.toUpperCase()))
}

export function cameraFromAdvertisement(peripheral: BluetoothPeripheral, advertisementData: BluetoothAdvertisementData, rssi: number): DiscoveredCamera {
  return {
    id: peripheral.id,
    name: advertisementData.localName ?? peripheral.name ?? "未命名蓝牙设备",
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
    const timeout = setTimeout(() => reject(new Error("服务发现超时（8 秒）")), 8000)
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
    const timeout = setTimeout(() => reject(new Error("特征发现超时（8 秒）")), 8000)
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

export async function discoverGatt(peripheral: BluetoothPeripheral): Promise<string[]> {
  const services = await discoverServices(peripheral)
  const lines = [`服务发现完成：${services.length} 项`]
  if (services.length === 0) return [...lines, "未发现服务：这可能是相机工作模式、配对状态或 Scripting BLE 封装限制。"]

  for (const service of services) {
    lines.push(`服务 ${service.uuid}${service.isPrimary ? "（主服务）" : ""}`)
    try {
      const characteristics = await discoverCharacteristics(peripheral, service)
      lines.push(`  └ 特征发现完成：${characteristics.length} 项`)
      if (characteristics.length === 0) lines.push("  └ 未发现特征")
      for (const characteristic of characteristics) lines.push(`  └ ${characteristic.uuid}  [${characteristic.properties.join(", ") || "无属性"}]`)
    } catch (error) {
      lines.push(`  └ 特征发现失败：${formatError(error)}`)
    }
  }
  return lines
}

export async function readSafeProfile(peripheral: BluetoothPeripheral): Promise<string[]> {
  const lines = ["只读 Profile（不含序列号、Wi‑Fi 或其他未知特征）"]
  for (const service of await discoverServices(peripheral)) {
    const serviceUuid = service.uuid.toUpperCase()
    if (serviceUuid !== "180A" && serviceUuid !== CAMERA_SERVICE_UUID) continue
    for (const characteristic of await discoverCharacteristics(peripheral, service)) {
      const uuid = characteristic.uuid.toUpperCase()
      const label = serviceUuid === "180A" ? SAFE_DEVICE_INFO[uuid] : uuid === OPERATION_MODE_UUID ? "Operation Mode" : undefined
      if (!label || !characteristic.properties.includes("read")) continue
      try {
        lines.push(`${label}（${characteristic.uuid}）：${formatReadValue(await peripheral.readValue(characteristic))}`)
      } catch (error) {
        lines.push(`${label}（${characteristic.uuid}）读取失败：${formatError(error)}`)
      }
    }
  }
  return lines.length === 1 ? [...lines, "未找到可读取的白名单特征。"] : lines
}
