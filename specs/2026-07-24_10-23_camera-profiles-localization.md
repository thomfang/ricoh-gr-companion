# Spec: 完整本地化与 GR III / IIIx / IV Profile

## Goal
- 消除用户可见状态、错误、BLE Profile、HTTP 诊断与预览生命周期中的硬编码中文，使中文、英文和跟随系统在运行时完整切换。
- 增加可持久化的相机机型选择：自动识别、GR III、GR IIIx、GR IV；所有照片与 LiveView 调用先解析为明确的 Camera Profile，再使用该 Profile 的端点顺序、参数和解析器。
- 保持相机侧只读 GET、安全 Profile 和手动加入 WLAN 的现有边界；不因多机型适配引入 WLAN 凭据读取、自动入网或猜测性 BLE 写入。

## Done Contract
- 设置页可选择自动识别 / GR III / GR IIIx / GR IV，切换后持久化并安全取消正在进行的照片请求、传输和 LiveView；新请求能由测试证明使用所选 Profile。
- `src/` 中除中文资源、预览 fixture 和必要注释外，不再存在用户可见中文字符串；语言切换后现有状态、错误与诊断也使用当前语言渲染。
- 离线测试覆盖机型→Profile、端点顺序、切换复位、错误本地化和诊断脱敏；TypeScript diagnostics 为 0。GR IV 真机兼容仍须设备证据，不能仅以参考项目声明完成。

## Scope
### In
- `CameraModelSelection = auto | GR III | GR IIIx | GR IV` 与 `CameraProtocolFamily = gr3 | gr4`。
- 设置页机型 Picker、当前有效 Profile、自动识别结果和验证状态展示。
- HTTP Profile：base URL、props、LiveView、照片列表候选端点、缩略图尺寸候选、详情和原图路径策略。
- 底层错误 code、结构化 BLE Profile、结构化诊断结果，在 UI 边界按当前 `I18nData` 格式化。
- 切换机型时取消列表/缩略图/传输/LiveView，清空旧照片和诊断，防止旧请求回写。
- README、spec 与真机清单更新；离线测试扩充。

### Out
- 自动开启或加入相机 WLAN；读取、显示、保存 SSID/passphrase/key。
- GR IV 固定 Handle 写入、GR III Network Type 写入、快门、相机参数写入、删除和 `PUT /transfer`。
- 未经 GR IV 真机证据声明照片列表/下载完整兼容。
- 为“试一试”而跨代执行 BLE 写入或未证实的 HTTP 写操作。

## Facts / Evidence
### Current code
- `models.ts` 仅识别名称；`camera-client.ts` 固定 `192.168.0.1`，调用方直接写 `/v1/...`，没有 Profile。
- 当前列表固定先试 `/v1/photos`，失败后回退 `/v1/photos/infos`；缩略图固定 `size=thumb`；LiveView 固定 `/v1/liveview`。
- 中文硬编码存在于 `camera-library.ts`、`camera-http.ts`、`live-view-controller.ts`、`photo-transfer.ts`、`ricoh-ble.ts`、`formatters.ts`；`readSafeProfile()` 返回中文字符串，`parseProfileIdentity()` 再依赖“型号/固件修订”中文前缀解析，属于数据层与展示层反向耦合。
- `connectionStatus`、`cameraIdentity`、`previewStatus`、`libraryReport` 保存的是已翻译字符串，切换语言后旧状态不会重新本地化。

### Local reference
- 用户提供的 `RicohViewfinder-reference` 明确说明旧实现只在 GR IV HDF 验证，GR III/IIIx 与 GR IV 的主要差异在 BLE/WLAN 激活与凭据路径。
- 该参考对 GR IV HTTP 只证明 `http://192.168.0.1/v1/props` 与 `/v1/liveview`；不能证明 GR IV 照片列表端点。

### GitHub sources
- `sky18Dragon/RICOH-GR-Live-View-Shooting` 的 Profile 设计区分 `Gr3Family` 与 `Gr4Family`：GR III 使用 UUID 路径，GR IV 使用 fixed-handle；两代复用 HTTP `/v1/props` 与 `/v1/liveview`。
- 公开协议说明要求“先识别再执行 Profile 动作”，禁止失败后跨代尝试有副作用写入；Unknown 默认拒绝副作用。
- `rock3r/CameraSync` 文档为 GR III 系列列出 `/v1/photos/infos?storage=in&after=`、`size=thumb|view|xs`、`/info` 和原图 GET。该资料含写接口和敏感字段说明，本项目只采用只读照片端点，不读取 `/v1/props` 中的 serialNo、ssid、key。
- GitHub 未找到足够可靠的 GR IV 照片列表端点公开证据；因此 GR IV Profile 的照片路由只能标为“候选 + 待真机验证”，不能伪造已验证差异。

## Design
### 1. Camera Profile
新增 `src/camera-profile.ts`：

```ts
type CameraModelSelection = "auto" | "GR III" | "GR IIIx" | "GR IV"
type CameraProtocolFamily = "gr3" | "gr4"

type CameraApiProfile = {
  id: CameraProtocolFamily
  models: CameraModel[]
  baseUrl: string
  propsPath: string
  liveViewPath: string
  photoListCandidates: Array<{ path: string; query: Record<string, string | number> }>
  thumbnailSizes: string[]
  photoInfoPath(photo): string
  originalPath(photo): string
  evidence: "device-verified" | "reference-only" | "unverified"
}
```

- GR III 与 GR IIIx 映射 `gr3`；GR IV 映射 `gr4`。
- 两个 Profile 当前都使用 `/v1/props` 和 `/v1/liveview`，因为来源证明 HTTP 端点复用。
- GR3 照片列表优先 `/v1/photos/infos?storage=in&after=`，兼容回退 `/v1/photos?limit=100`。
- GR4 照片列表保留 `/v1/photos?limit=100` 与 `/v1/photos/infos?...` 候选，但明确 `unverified`；候选顺序集中在 Profile，不散落在业务模块。
- 自动模式以 BLE 只读型号为提示；无法识别时不猜测 GR4，UI 要求用户明确选择后再执行照片/LiveView。
- 手动选择优先于自动识别，但只改变本地路由，不触发任何相机写入。

### 2. Profile lifecycle
- `App.tsx` 持有并持久化 `cameraModelSelection`，派生 `effectiveModel` 和 `cameraProfile`。
- 切换前调用：取消照片请求、取消传输、停止 LiveView；递增 generation；清空照片、缩略图、选择、诊断和数据连接状态。
- `camera-library.ts`、`photo-transfer.ts`、`live-view-controller.ts`、`camera-http.ts` 接收 Profile 或由显式创建的 profile client 提供调用；禁止读取隐式全局机型。
- BLE 只读识别结果与手动选择不一致时仅显示本地化警告，不自动覆盖用户选择，不执行跨代写入。

### 3. Localization boundary
- 新增稳定错误类型：`AppError { code, details? }`；底层只抛 code 与安全技术参数，不拼接中文句子。
- `readSafeProfile()` 返回结构化字段：`model`、`firmware`、`software`、`manufacturer`、`operationMode`、`readFailures`，不返回本地化行文本。
- 诊断返回结构化对象：HTTP status、contentType、contentLength、topLevelKeys、itemCount、recognizedFormat、profileId、routeKind；UI 使用当前 `t` 转为文本。
- React state 保存状态枚举/结构化 payload，不保存最终翻译字符串。语言切换只替换 `t` 即可重渲染全部文案。
- 预览 fixture 中的中文允许存在但改为使用对应 locale 数据；`src/i18n/zh.ts` 是中文用户文案唯一主要来源。

### 4. UI
- 设置页新增“相机型号” Section/Picker：自动、GR III、GR IIIx、GR IV。
- 显示“当前接口 Profile”和证据状态：GR IIIx 当前项目有 LiveView 真机证据；GR III/GR IV 照片链路仍待验证。
- 自动识别与手选冲突时显示警告；用户仍可继续只读测试。
- Wi-Fi 状态区分 unknown/checking/ready/offline，避免未检查即显示离线。

## Risks
- GR IV 的照片列表、缩略图 size 和响应 JSON 缺少公开可靠证据；实现必须把差异封装为候选路由和验证状态，不能写死“已支持”。
- 语言改造会触及 BLE、HTTP、传输、状态和 UI，多文件范围较大；需以结构化数据替换字符串耦合，避免只做表面替换。
- 切换机型时若旧异步请求回写，可能混合两套结果；必须复用 generation + abort，并对传输/LiveView做明确停止。
- 参考项目包含读取 WLAN 凭据和 BLE 写入，本项目不得复制这些能力。

## Open Questions / Decisions
- [x] 是否提供手动机型选择：是，另保留自动识别。
- [x] GR III 与 GR IIIx 是否共用 Profile：是，均属 `gr3`，但 UI 保留具体型号。
- [x] GR IV 是否沿用同一 HTTP base/liveview：是，参考项目真机证据支持 `/v1/props` 与 `/v1/liveview`。
- [x] GR IV 照片端点是否声明验证：否，保留候选并等待真机。
- [x] 是否增加自动 WLAN/凭据读取：否。
- [ ] 用户执行批准后实施；若实施中发现 Scripting Picker 或 BLE API 无法表达结构化 Profile，再更新本 spec 请求范围调整。

## Restated Understanding
- 当前任务不是简单加一个 GR IV 标签，而是让用户选择机型后，所有网络调用都经过对应 Profile；同时彻底解除中文文案与协议数据的耦合。
- 当前核心目标是“明确机型 → 明确 Profile → 明确只读路由 → 可本地化状态 → 可验证证据”。
- 暂不处理任何相机写操作、自动 WLAN、快门或参数控制。

## Goal Alignment Check
- 采用 Profile 而非 UI 条件分支，能确保照片、下载和 LiveView 使用同一个有效机型来源。
- 对 GR IV 照片 API 保留未验证标记，避免为了“看起来支持”而越过证据边界。
- 本地化改为结构化状态，从根因解决切换语言后旧中文残留。

## Checkpoint Summary
- 当前任务理解：实现完整中英文运行时本地化，并增加自动/GR III/GR IIIx/GR IV 机型选择和 Profile 路由。
- 当前核心目标：所有用户可见文本由 i18n 渲染；所有 HTTP 调用由当前 Camera Profile 决定。
- 当前进度：现有代码、本地参考和 GitHub 来源已审查，方案已固化；尚未修改产品代码。
- 下一步 1：实现 `camera-profile.ts`、持久化选择、切换取消/复位和设置页 Picker。
- 下一步 2：把照片、传输、LiveView、HTTP 诊断改为显式 Profile 路由。
- 下一步 3：把 BLE/Profile/错误/诊断改为结构化数据并完成 i18n、离线测试、README 与真机清单。
- 涉及模块：`App.tsx`、`models.ts`、新 `camera-profile.ts`、camera client/library/http、transfer、LiveView、BLE/formatters、UI types/settings/home、i18n、tests、README/spec。
- 风险：跨模块状态迁移；GR IV 照片端点仍需真机验证。
- 验证方式：中文硬编码扫描（排除 zh 资源/fixture）、TypeScript diagnostics、扩充离线测试、安全请求扫描、GR IIIx 回归清单及后续 GR IV 真机清单。
- Execution Approval: `Approved — 2026-07-24 10:45 Asia/Shanghai`

## Change Log
- 2026-07-24: 用户批准实施。新增 `camera-profile.ts`，完成 Auto / GR III / GR IIIx / GR IV 持久化选择与 `gr3` / `gr4` 只读 API 路由；移除业务层隐式 GR3 回退。
- 2026-07-24: `readSafeProfile()` 改为结构化白名单数据；底层错误、照片诊断和 LiveView 生命周期改为稳定 code/结构，UI 按当前语言渲染。删除无调用方的旧 `camera-http.ts` 中文探针。
- 2026-07-24: 设置页新增机型 Picker、有效 Profile、证据状态、识别冲突与四态 Wi-Fi；机型切换取消照片请求/传输/LiveView并清空旧状态。
- 2026-07-24: 离线测试新增机型映射、Profile 端点顺序、auto unknown、共享 LiveView 路径和中英文错误映射；中英文 README 与真机清单同步更新。

## Validation
- TypeScript：项目级 diagnostics 为 0。
- Offline：`scripting-ts run tests/offline-validation.ts` 输出 `Offline validation passed`。
- UI smoke：`scripting-ts preview_ui src/ui/SettingsPreview.tsx` 成功渲染 6 秒。
- Localization scan：`src/` 的中文命中仅位于 `src/i18n/zh.ts` 与英文语言选择值 `中文`；业务模块无用户可见中文硬编码。
- Explicit routing scan：未发现不带 Profile 的 `cameraUrl/photoPath/cameraGet/fetchCameraPhotoList/fetchCameraThumbnail/fetchCameraPhotoInfo/transfer` 业务调用。
- Safety scan：未发现 `writeValue`、PUT/POST/DELETE/PATCH、`/transfer`、WLAN 凭据或序列号读取；相机侧仍只使用 GET。
- 核心目标是否已由证据证明完成：代码、静态、离线和 UI smoke 层面完成；GR IV 照片候选路由仍需真机证据。

## Resume / Handoff
- 当前状态：实现完成并通过静态、离线、安全与设置页渲染验证。
- 当前卡点：GR IIIx 需回归机型切换与既有照片/LiveView；GR IV 的照片列表、缩略图、详情和下载需对应设备验证。
- 下一步唯一动作：按 `specs/2026-07-24_09-51_device-test-checklist.md` 先执行 `[1]` 与新增 `[1A]`，确认语言切换、机型 Picker、Profile 映射和切换复位。
- 下一轮核心目标：依据 `[1A]`、GR IIIx 回归和后续 GR IV 诊断摘要，确认候选路由或做最小定向修复。
