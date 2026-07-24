# Spec: GR 照片传输与管理器

## Goal
- **产品定位**：在 iPhone Scripting 中构建面向 RICOH GR III、GR IIIx 与 GR IV 系列的照片传输、浏览和实时取景工具。相机照片库、选择和主动保存是主路径；实时取景是“拍摄”工作区。
- **1.0.0 产品目标**：用户手动开启相机 WLAN 并在 iPhone 加入相机热点后，可在脚本中浏览相机照片列表和缩略图、查看照片元数据、选择照片，并在明确操作后保存到 iPhone Photos 或导出到 Files。
- **已交付的支撑能力**：BLE 自动发现/重连与安全 Profile、手动 WLAN 指引、`/v1/props`、MJPEG `/v1/liveview` 预览、开始/停止流释放。

## Done Contract
- 照片传输 MVP 完成须有 GR IIIx 真机证据，不能仅以公开协议或模拟响应声明完成。
- “浏览”阶段只能使用只读 HTTP GET；“导入”阶段必须由用户明确点选，并可显示每张进度、成功/失败结果。
- 保存到 Photos/文件属于用户设备写入：必须仅处理用户选择的项目，不自动批量导入、不覆盖已有文件、不把相机凭据或原始照片写入 Storage。
- 已验证实时取景继续保持单连接、最新帧、停止即取消。不能为 UI 或传图改动而弱化安全限制。

## Scope
### In
- 照片库主信息架构：相机照片列表、日期/文件信息、缩略图网格、照片详情、多选与传输进度。
- 相机 HTTP API：`GET /v1/photos`、`GET /v1/photos/{folder}/{file}`、`GET /v1/photos/{folder}/{file}/info`；优先以缩略图/受限尺寸浏览，再按用户选择下载原图。
- 用户明确触发的单张与多张导入到 iPhone Photos 或文件；本地化（中/英）与专业相机应用界面。
- 拍摄工作区：已验证的 MJPEG 实时取景，后续可经单独许可增加快门或相机参数控制。

### Out（除非单独获批）
- 自动开启相机 WLAN、自动加入相机热点、猜测性 BLE 写入。
- 读取、显示、持久化 SSID/passphrase/key 或任何 WLAN 凭据。
- 自动/后台批量下载、自动将照片标记为已传输（`PUT /photos/.../transfer`）、删除相机照片。
- 未验证格式的完整原图导入、RAW/DNG 解析、后台传输恢复、多机型保证。

## Verified Facts / Constraints
- 真机：**RICOH GR IIIx，固件 1.21**。
- BLE：已发现 7 服务/57 特征；已验证 Operation Mode：`0x02`=BLE_STARTUP、`0x00`=Capture。只读 Profile/自动重连已可用；未写任何 GATT 特征。
- 手动 WLAN：iPhone 加入相机热点后，`GET http://192.168.0.1/v1/props` 返回 HTTP 200 / JSON（5144 bytes）。
- LiveView：`GET /v1/liveview` 返回 HTTP 200、`multipart/x-mixed-replace; boundary=--boundary`；`Response.body` 可流式读到 JPEG `FF D8`，`reader.cancel()` 可释放连接。
- 预览：真机显示连续画面，手动停止时累计解码 31 帧。实现采用 JPEG SOI `FF D8` / EOI `FF D9` 增量分帧、`UIImage.fromData`、单连接、帧率与内存限制。
- 照片协议参考（待真机确认）：公开 GR III/IIIx OpenAPI/Android 实现列出 `GET /v1/photos?storage&limit&after`、`GET /v1/photos/{folder}/{file}?storage&size`、`GET /v1/photos/{folder}/{file}/info` 和 `GET /v1/transfers`。
- Scripting：已确认 HTTP `fetch`、`Response.data()` / body 流、`Data`、`UIImage` 可用；iOS Photos 保存能力可调用，但尚未在本项目和 GR 下载内容上真机验证。

## Product Information Architecture
1. **照片库（默认主入口）**
   - 相机连接/WLAN 状态、最新照片网格、选择模式、导入操作和进度。
2. **拍摄**
   - 取景器优先画面、开始/停止预览、轻量连接状态；不显示调试报告。
3. **设置**
   - 相机重连、手动 WLAN 指引、语言、导入偏好及诊断入口（诊断仅在明确进入后显示）。

## Architecture / Phases
1. **A/A.5/A.6 — BLE 发现、只读 Profile 与保护（完成）**
2. **C.0/C.1/C.2 — 手动 WLAN HTTP、MJPEG 验证与实时预览（完成）**
3. **C.3 — 照片浏览、缩略图与详情（已实现，待集中真机验收）**
   - 首选只读 `GET /v1/photos?limit=100`，失败时兼容回退 `GET /v1/photos/infos?storage=in&after=`。
   - 同时解析 `dirs → name/files` 与 `files` 详情数组；受限并发请求 `size=thumb`，详情只读 `/info`。
   - 缩略图仅保存在内存，不持久化；响应设有大小上限和可取消请求。
4. **C.3.2/C.3.3 — 主动下载并保存（已实现，待集中真机验收）**
   - 仅在用户明确多选并点击“保存到照片”或“导出到文件”后执行。
   - 原图流式写临时文件，逐项显示下载/保存/成功/失败/取消状态；批次可取消，结束后清理临时文件。
   - Files 导出不覆盖同名文件；Photos 使用原始临时文件路径；不调用相机 `/transfer`，不改变相机状态。
5. **D — 后续增强（独立许可）**
   - 快门、参数控制、BLE 自动 WLAN 研究、RAW/DNG、后台/断点传输。

## Risks / Security
- 照片列表的准确 JSON 结构、缩略图 `size` 枚举、相机文件格式、分页游标与 Content-Length 仍需 GR IIIx 真机验证。
- 相机热点无互联网；用户须手动切换网络。iOS 公开 Scripting API 未确认自动入网能力。
- 连续预览增加相机耗电与发热；应用默认不自动启动预览，用户离开时取消流。
- 原图/批量传输可能占用较多内存、存储和电量；必须采用选择性、进度可见、可取消的实现。
- `PUT /photos/.../transfer` 会改变相机状态，当前明确禁止。

## Open Questions
- [ ] GR IIIx 的 `/v1/photos` 真实 JSON 结构、最大 limit、分页 `after` 和 storage 参数。
- [ ] 缩略图 `size` 的可用取值、JPEG/RAW/视频在相机端的行为。
- [ ] 下载到 Photos 时的原始 EXIF、日期、方向与格式保真度。
- [x] Scripting Photos API 支持直接保存 `Data` 或临时文件路径；本实现为控制大文件内存，采用流式临时文件路径。
- [ ] 照片库的默认排序、筛选和导入目标（Photos / Files / 两者）偏好。
- [ ] BLE 自动 WLAN 的官方会话握手，仍是独立风险项。

## Goal Alignment Check
- 目标已从“验证 BLE + WLAN 取景器可行性”调整为“可用的 GR 照片传输与管理产品”。
- 实时取景不被删除：它作为拍摄工作区的已验证辅助能力继续保留。
- 当前最小风险、最高价值的下一证据是集中真机验证照片列表、`size=thumb`、`/info` 与单张 JPEG 保存，再扩展到多选和 GR III/IV。

## Checkpoint Summary
- 当前任务理解：功能代码已完成，下一轮由用户集中进行真机验收并反馈协议差异、视觉问题和保存保真度。
- 当前核心目标：以 GR IIIx 1.21 先验证照片列表、缩略图、详情、单张保存和取景生命周期，再收集 GR III/GR IV 设备证据。
- 涉及模块：`camera-client.ts`、`camera-library.ts`、`photo-transfer.ts`、`live-view-controller.ts`、照片库/详情/取景/设置 UI 与 i18n。
- 验证方式：TypeScript diagnostics、离线测试、脱敏诊断摘要和用户真机功能反馈；不包含 WLAN 凭据。
- Execution Approval: `Approved — complete remaining product functionality, then centralize device testing`

## 2026-07-24 Implementation Completion
- 用户批准完成剩余产品功能后，已实现统一 `camera-client.ts`、GR III/IIIx/IV 型号规范化、两类公开照片列表结构兼容、缩略图限流、照片详情、选择状态、可取消流式下载、Photos 保存与 Files 导出。
- LiveView 增加 `AbortController`，可取消尚未完成的建连；页面 `onDisappear` 自动停止，停止后可立即重新建立唯一连接。
- BLE 与 Wi-Fi 数据链路状态分开展示；BLE 注册断开/连接失败回调。仍不写任何 GATT 特征，也不读取或保存 WLAN 凭据。
- 首页改为减少卡片堆叠的摄影工作台层级；照片库、取景器、设置均采用背景层单独 `ignoresSafeArea`、内容保持安全区的结构和系统动态颜色。
- 离线验证覆盖 URL 编码、GR IIIx/IV 机型识别、选择状态和跨 chunk MJPEG 分帧；完整 TypeScript diagnostics 为 0。
- **未声明真机完成**：照片列表真实结构、`thumb`、`/info`、原图保存元数据、GR III 与 GR IV 协议仍须用户集中真机反馈。

## Change Log
- 2026-07-20: 用户指定 `sky18Dragon/RicohViewfinder` 作为 BLE/WLAN/LiveView 参考。
- 2026-07-23: GR IIIx 1.21 已完成手动 WLAN 下 HTTP/MJPEG 脚本内预览真机验证。
- 2026-07-24: 修正 Safe Area 策略：仅 `ZStack` 内的背景 `Rectangle` 使用 `ignoresSafeArea`，`ScrollView` 内容层和导航栏保持系统安全区。主题继续使用 iOS 语义动态颜色，版本固定为 `1.0.0`。

## Validation
- Static checks: 根入口和全部模块已执行 `get_typescript_diagnostics`；离线测试覆盖 URL 编码、GR IIIx/IV 型号识别、选择状态与 MJPEG 跨 chunk 分帧。
- UI scope: 首页采用克制的摄影工作台层级；照片库支持缩略图、详情、多选和传输状态；取景器使用黑色光学画布并在页面离开时释放流；设置分离 BLE 与 Wi-Fi 状态并收纳诊断。
- Safety source check: 当前 `src/` 未发现 `writeValue`、PUT/POST/DELETE、`/transfer` 或 WLAN 凭据读取/持久化；相机侧全部请求仍为 GET。Photos/Files 写入仅由用户明确选择和点击触发，临时文件随后清理。

## Resume / Handoff
- 当前状态：1.0.0 功能代码已完成并通过静态与离线验证；等待集中真机验收，不在无相机条件下声称协议已全部验证。
- 真机顺序：手动加入相机 WLAN → 刷新照片库 → 确认缩略图/详情 → 先保存单张 JPEG 到 Photos → 再测试 Files 与多选 → 最后测试取景开始、返回自动停止、重新开始。
- GR IIIx 1.21 的 LiveView 已有 31 帧真机证据；GR III、GR IV 和照片下载链路仍需对应设备证据。
- 安全约束保持：不得猜测性 BLE 写入、不得读/存 WLAN 凭据、不得调用 `PUT /transfer` 或删除相机内容。
