# Spec: DataStream LiveView 30 FPS

## Goal
- 将 LiveView 从 `Response.body: ReadableStream<Uint8Array>` 改为零拷贝 `Response.dataStream: ReadableStream<Data>`。
- pending 与 JPEG 帧保持为原生 `Data`，仅为 SOI/EOI 扫描每轮转换一次字节视图；解码直接调用 `UIImage.fromData(frame)`。
- 将渲染上限从 200 ms（约 5 FPS）调整为 1000/30 ms（最高 30 FPS）。

## Done Contract
- LiveView 不再使用 `response.body` 或 `Data.fromUint8Array`；只解码每批次最新完整帧。
- 单连接、stop/cancel、4 MiB 帧限制和 8 MiB pending 限制保持；跨 chunk marker、多帧、噪声和超限恢复有离线测试。
- TypeScript diagnostics 与离线测试通过；实际 30 FPS 需 GR IIIx 真机数据显示帧率确认。

## Scope
- In: `live-view-controller.ts`、`mjpeg-parser.ts`、离线测试、LiveView 帧率展示/文档与 spec 回写。
- Out: 修改相机输出帧率、分辨率、HTTP 路由、相机参数或任何写操作。

## Facts / Constraints
- Scripting `Response.dataStream` 是零拷贝 `ReadableStream<Data>`，与 `body` 互斥。
- `Data` 支持 `append`、`slice`、`toUint8Array`；`UIImage.fromData` 直接接收 `Data`。
- JPEG marker 搜索仍需字节视图；优化目标是消除网络 chunk 和 JPEG frame 的重复 Data 包装，不承诺完全零字节扫描。
- 30 FPS 是渲染上限，不保证相机和设备一定持续输出/解码 30 FPS。

## Restated Understanding
- 当前核心目标：降低 LiveView 数据转换与多帧复制开销，并把人为 5 FPS 限制提升到最高 30 FPS。
- 安全边界：保持最新帧、内存上限、取消和单连接。

## Checkpoint Summary
- 下一步 1：新增 Data-native 最新帧解析器。
- 下一步 2：控制器切换到 `dataStream` 与 30 FPS 节流。
- 下一步 3：补测试、诊断、文档与验证。
- 风险：UI 状态更新和同步 JPEG 解码仍可能成为瓶颈；真机实际 FPS 可能低于 30。
- 验证：源码扫描、TypeScript diagnostics、离线 parser 测试、设置/取景 UI smoke，最后真机 FPS。
- Execution Approval: `Approved — user requested dataStream optimization and 30 FPS on 2026-07-24 16:28 Asia/Shanghai`

## Validation
- TypeScript：项目级 diagnostics 为 0。
- Offline：`scripting-ts run tests/offline-validation.ts` 输出 `Offline validation passed`；新增 Data 跨 chunk、不完整 remainder、多帧仅取最新帧和 8 MiB pending 边界测试。
- Source scan：LiveView 无 `response.body`、`Data.fromUint8Array` 或 200 ms 节流；`response.dataStream` 同时用于 LiveView 与原图流式下载。
- UI smoke：最初尝试不存在的 `src/ui/ViewfinderPreview.tsx` 失败，随后使用现有 `src/ui/GlassHomePreview.tsx` 成功渲染 6 秒；该失败不涉及产品代码。
- Safety：未命中 `writeValue`、PUT/POST/DELETE/PATCH、`/transfer`、WLAN 凭据或序列号字段。
- 真机：待 GR IIIx 1.21 验证实际 FPS、延迟、发热、停止与重入；30 FPS 是 UI 上限而非相机输出保证。

## Change Log
- 2026-07-24: `LiveViewController` 攉为 `response.dataStream.getReader()`，网络 chunk、pending 和最新 JPEG 保持为原生 `Data`；移除 `Data.fromUint8Array`。
- 2026-07-24: 新增 Data-native MJPEG parser，每次扫描只创建一个最新完整帧 Data，丢弃同批旧帧；渲染节流从 200 ms 改为 33 ms（最高约 30 FPS）。App 将每帧图像与计数合并为一次状态更新，连接/状态只在首帧更新，减少 UI 主线程压力。
- 2026-07-24: 更新离线测试及中英文 README。

## Resume / Handoff
- 当前状态：实现、静态、离线、安全与 UI smoke 验证完成。
- 下一步唯一动作：使用 GR IIIx 1.21 连续运行 LiveView 30 秒，记录开始 5 秒后的 10 秒窗口内帧数、主观延迟、是否卡顿、停止后能否立即重启。
- 判断：10 秒窗口接近 300 帧表示达到 30 FPS 上限；明显偏低时需区分相机输出频率、网络 chunk 频率、JPEG 解码或 SwiftUI 状态更新瓶颈。
