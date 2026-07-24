# Ricoh GR Companion

[English](README.md)

一款运行在 iPhone [Scripting](https://apps.apple.com/us/app/scripting/id6479691128) 中、采用原生界面风格的 RICOH GR 相机伴侣。它将相机照片浏览、选择性下载、保存到 Photos/Files 和 MJPEG 实时取景整合在一个轻量工具中。

> 本项目是独立的非官方项目，与理光映像无隶属或官方认可关系。RICOH、GR 及相关商标归各自权利人所有。

## 主要功能

- 通过蓝牙发现并重新连接支持的 RICOH GR 相机。
- 只读取明确白名单中的少量设备信息，不进行猜测性 GATT 写入。
- 通过相机直连 Wi-Fi 浏览相机照片库。
- 以受限并发加载仅保存在内存中的缩略图。
- 在相机提供信息时查看文件和曝光元数据。
- 明确选择单张或多张照片后，保存到系统照片库或导出到 Files。
- 通过 Scripting 原生零拷贝 `Data` 流播放 MJPEG，只解码最新完整帧，并通过单一可取消连接以最高 30 FPS 刷新。
- 离开取景器页面时自动停止并释放视频流。
- 支持英文和简体中文；状态、错误、BLE 身份和诊断会按当前语言动态渲染。

- 可在“设置 → 相机型号”选择“自动识别”、GR III、GR IIIx 或 GR IV；选择会持久化，并决定照片列表、缩略图、详情、原图下载和实时取景使用的只读 API Profile。
- “自动识别”只使用 BLE 白名单中的只读型号信息；无法识别时不会猜测机型，需要用户手动选择。
- 切换机型会停止实时取景、取消照片请求与传输，并清空旧机型的照片和诊断状态，防止跨机型结果混用。

## 支持的相机

兼容层可以识别：

- RICOH GR III
- RICOH GR IIIx
- RICOH GR IV

### Profile 与验证状态

- GR III 与 GR IIIx 使用 `gr3` Profile：照片列表优先 `GET /v1/photos/infos?storage=in&after=`，必要时回退 `GET /v1/photos?limit=100`。
- GR IV 使用 `gr4` Profile：照片列表优先 `GET /v1/photos?limit=100`，必要时回退 `GET /v1/photos/infos?storage=in&after=`。
- 两个 Profile 都使用 `GET /v1/props` 与 `GET /v1/liveview`；照片详情与原图路径由 Profile 统一生成。
- GR IV 的 `/v1/props` 与 `/v1/liveview` 有外部 GR IV HDF 真机来源；GR IV 照片列表、缩略图、详情和下载候选路由仍需本项目真机验证。

### 验证状态

完整实时取景链路已在 **RICOH GR IIIx、固件 1.21** 上完成真机验证，包括手动连接相机 Wi-Fi、`/v1/props`、`/v1/liveview`、MJPEG 增量分帧、画面渲染和视频流取消。

照片列表、缩略图、元数据、原图下载以及 Photos/Files 导出已经实现，但仍需要集中真机验收。GR III 和 GR IV 也需要对应机型的设备证据。本项目不会把未经验证的协议适配声明为已完成兼容。

## 使用要求

- 安装 Scripting app 的 iPhone 或 iPad。
- 一台支持的 RICOH GR 相机。
- 开启蓝牙，用于发现相机和读取连接状态。
- 照片浏览、下载和实时取景前，需要手动在 iPhone 设置中加入相机 Wi-Fi。

应用不会读取、显示或保存相机 Wi-Fi 名称和密码，也不会尝试自动加入相机网络。

## 安装

1. 下载或克隆本仓库。
2. 将项目文件夹放入 Scripting 的 `scripts` 目录。
3. 在 Scripting 中打开 **理光 GR 相机伴侣**。
4. 打开相机，并在系统提示时允许蓝牙访问。
5. 如需浏览照片或实时取景，请开启相机 Wi-Fi，并在 iPhone 设置中手动加入该网络。

## 使用方法

### 相机照片库

1. 加入相机 Wi-Fi。
2. 打开“相机照片库”并刷新。
3. 点击缩略图查看元数据。
4. 点击文件名区域选择照片。
5. 选择“保存到照片”或“导出到文件”。

下载仅由用户主动触发，每项都有独立状态，可以取消。原图通过临时文件流式写入，避免整张原图长期占用内存；每项操作完成后都会清理临时文件。导出到 Files 时不会覆盖已有同名文件。

### 实时取景

1. 加入相机 Wi-Fi。
2. 打开“实时取景”。
3. 点击“开始实时预览”。
4. 点击停止或离开页面即可释放视频流。

应用同一时间只允许一个实时取景连接。原生 `Response.dataStream` 链路让网络分块和 JPEG 帧保持为 `Data`，只解码最新完整帧，并将 UI 刷新上限设为 30 FPS；实际帧率仍取决于相机输出、Wi-Fi、JPEG 解码和设备渲染能力。预览帧只保存在内存中，不会持久化。

## 安全与隐私

- 不进行猜测性蓝牙写入。
- 不读取或保存相机 Wi-Fi 凭据。
- 不删除相机照片。
- 不调用 `PUT /photos/.../transfer`，不会改变相机的传输状态。
- 本项目实现的相机侧操作均为只读 HTTP GET。
- 只有在用户明确操作后才会写入 Photos 或 Files。

## 项目结构

- `index.tsx`：Scripting 必需的启动入口。
- `src/App.tsx`：应用协调与生命周期管理。
- `src/camera-profile.ts`：GR III/IIIx/IV 机型选择、协议代际与只读 API 路由。
- `src/camera-client.ts`：要求显式 Profile 的统一只读相机 HTTP 客户端。
- `src/photo-transfer.ts`：可取消的流式下载与导出流程。
- `src/live-view-controller.ts`：单连接 MJPEG 生命周期。
- `src/mjpeg-parser.ts`：基于 JPEG SOI/EOI 的增量分帧。
- `src/ui/`：原生 SwiftUI 风格 TSX 页面与组件。
- `src/i18n/`：英文和简体中文资源。
- `tests/offline-validation.ts`：无需相机的协议和模型回归测试。

## 开发验证

可在 Scripting 编辑器中运行静态诊断。离线回归测试命令：

```sh
scripting-ts run tests/offline-validation.ts
```

独立执行的 Scripting 文件完成后必须调用 `Script.exit()`，这样运行器才能正常结束。

## 当前限制

- 必须手动开启并加入相机 Wi-Fi。
- 不同相机和固件的缩略图尺寸参数及照片列表结构可能不同，仍需更多真机反馈。
- EXIF、拍摄日期、方向、DNG 行为和视频导出保真度需要真机验证。
- 后台传输、断点续传、远程快门、相机参数写入和删除相机内容不在当前范围内。

## 参与贡献

真机测试报告非常有价值。反馈时请提供相机型号、固件版本、脱敏后的接口状态摘要和实际表现；请勿公开相机 Wi-Fi 密码、序列号或私人照片。
