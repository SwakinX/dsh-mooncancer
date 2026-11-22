# 架构与设计

本文面向插件维护者与想理解工具行为的用户。插件是一个**纯薄代理**：仅依赖 MoonCancer 本地开放接口 `/v1` 契约（当前按修订 15 实现），不绑定 MoonCancer 内部实现；跨工具的策略语义以 system prompt 注入，单工具的接口语义写在各工具 description 里。任务级的能力边界与操作规范见 [RULES](RULES.md)。

## 组成

| 文件 | 职责 |
|---|---|
| `src/index.js` | 宿主侧插件：20 个工具注册、`/v1` HTTP 代理、system prompt 策略段、服务自动拉起 |
| `src/client.js` | 浏览器侧 bundle：插件设置页表单（`plugins.bundle.config` 槽位，SettingsFormModel 模式） |
| `cordis.patch.yml` | bundle 层插入声明，仅携带安全默认值；真实 token/appDir 在 profile 层 |
| `locale/*.json` | 设置页文案（en/zh） |

## 工具映射

| 工具 | 对应端点 | scope / 状态门 |
|---|---|---|
| `mooncancer_app` | `POST /v1/app/launch` | 无门；UAC 提权拉起，轮询 `/v1/status` 至就绪（2s×30） |
| `mooncancer_status` | `GET /v1/status` | 免鉴权；也是可达性探测 |
| `mooncancer_plans` / `mooncancer_plan_get` | `GET /v1/plans[/name]` | task |
| `mooncancer_plan_update` | `PATCH /v1/plans/{name}` | config；运行中 409 TASK_RUNNING 拒写；彩苹果写入门（`pre_confirm` 预答） |
| `mooncancer_screenshot` | `GET /v1/shots/current`（`format=jpeg&quality=75`，旧服务端 400 回退 PNG） | observe |
| `mooncancer_shot` | `GET /v1/shots/{id}` | observe；读熔断/卡关/停止现场存档 |
| `mooncancer_templates` | 模板清单/模板图 | observe；UI 改版诊断 |
| `mooncancer_battle_state` | `GET /v1/battle_state` | observe |
| `mooncancer_query_state` / `mooncancer_detect_catalog` | `GET /v1/query_state` / `/v1/detect_catalog` | observe |
| `mooncancer_ocr` | `GET /v1/ocr` | observe |
| `mooncancer_act`（tap/swipe/press/back/launch） | `POST /v1/act/*` | navigate；任务运行中未暂停 409，先 pause |
| `mooncancer_battle`（tap_card/cast_skill/order_change/select_enemy） | `POST /v1/battle/*` | battle；状态门同 act；响应回显实际键序列 |
| `mooncancer_device`（connect/disconnect/reconnect） | `POST /v1/device/*` | connect: observe（可带 pid 多开预登记）；disconnect/reconnect: navigate |
| `mooncancer_task`（start/pause/resume/stop/restart） | `POST /v1/task/*` | task；start 支持 `wait=true` 同步等终态、`config_override` 单轮临时覆盖、`pre_confirm` 预答；stop 永不设门 |
| `mooncancer_confirm` | `POST /v1/confirm/{id}` | 应答确认门 |
| `mooncancer_events` | `GET /v1/events` | observe；环形缓冲 1000 条，`since` 超窗 410 |
| `mooncancer_logs` | `GET /v1/logs` | observe |
| `mooncancer_cheat`（status/enhance/kill_all/clean） | `/v1/cheat/*` | cheat；状态门同 act；仅限用户明确要求 |

## 截图直通视觉模型

工具结果的原生图像链路，模型当轮看到图，无需 `image-read` 二次调用：

```
MoonCancer /v1/shots (JPEG q75)
  → execute: ctx.get('attachments').saveImages([{data, mediaType, name}])
      ↳ 失败(未挂载/超限) → 落盘 %TEMP%\mooncancer-shots + 路径指引（安全回退，永不毁掉调用）
  → ImageAttachmentRef { attachmentId: sha256, mediaType, bytes, width, height }
  → render: [{type:'text',摘要}, {type:'image', attachment: ref}]
  → 宿主按 ref 读字节、按目标模型缩放/重编码，内联进 LLM 请求
```

### 宿主契约要点（踩坑实录，勿再踩）

1. **图像引用必须来自附件库**。宿主序列化时无条件读 `block.attachment.attachmentId`——自造 `{type:'image', source:{base64}}` 形状的块会让宿主读 `undefined.attachmentId`，TypeError 崩掉整轮。历史里已持久化非法块的会话无法修复，只能弃用。
2. **canonical value 必须是 lossless JSON**。宿主 `snapshotJsonValue` 遍历全部自有可枚举键，值为 `undefined` 的键判为有损并拒绝（报「value is not lossless JSON」）。返回对象一律条件展开：`...(x !== undefined ? { x } : {})`。
3. **模块缓存**。宿主进程启动时按 ESM 加载插件模块一次；修改代码后必须热重载（插件管理器禁用/重启用）或重启应用，重开会话无效。
4. `attachmentId` 是内容寻址持久引用（sha256）；宿主附件库无自动 GC，上下文层面的 image offload 只是不再发给模型，不删文件。

## 策略注入（system prompt）

`ctx.systemPrompt.section`（order 1050）注入跨工具策略，宿主负责去重与增量提交：

- **监督主循环**：`task start wait=true` 是唯一需要的循环；终态 kind（null/STALL/QUEST_STUCK/FUSED/MAINTENANCE/PRECHECK_FAIL/…）各自分派处置。
- **介入流程**：pause 静默 → act/battle/cheat 放行（不暂停直接操作 409）→ resume（10 分钟空闲自动恢复）。
- **观察纪律**：先 connect 再观察；谓词 > OCR > 截图。
- **确认门**：唯一保留门为彩苹果（圣晶石）消耗；`pre_confirm=true` 一次预答留审计不阻塞；不确定时走 `confirm.requested` 事件应答（120s 超时=拒绝）。
- **幂等性**：task stop/pause/resume、confirm、observe 可安全重试；act/cheat 不幂等。
- **临时改参**：`config_override` 单轮内存生效终态自动恢复；持久修改走 `plan_update`；API 启动的任务 restart 原样重放全部参数。

## 服务自动拉起

`appDir` 解析顺序：打包版 `MoonCancer.exe --minimized` → 源码仓布局（`.venv/Scripts/python.exe` + 逐级查找 `MoonCancer.py`）。拉起经 PowerShell `Start-Process -Verb RunAs` 提权（pymem 战斗辅组需要管理员），隐藏窗口、共享并发调用、轮询 `/v1/status` 最多 60s。已知坑：不能用 `detached:true`（提权启动静默失败）；用 `python.exe` 而非 `pythonw`（无控制台会静默崩溃）。

## 限制

- 仅 Windows（提权拉起依赖 PowerShell）。
- token 存于插件配置而非凭据存储；与 MoonCancer 同机运行，风险与 `config/api.json` 同级。
- 挂机计划（HALT）仅 UI 可设，API 无端点；`daily`/`kidou` 不支持。
- `mooncancer_app` 无 quit：`/v1` 无此端点，提权进程也无法从插件侧终止，退出需托盘操作。
