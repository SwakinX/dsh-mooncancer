# dsh-mooncancer

MoonCancer（[SwakinX/MoonCancerLauncher](https://github.com/SwakinX/MoonCancerLauncher)，FGO 自动化脚本）的 DeepSeek Harness 插件：把 MoonCancer 本地开放接口 `/v1` 映射为 DSH Agent 工具，并通过 system prompt 注入跨工具的监督者策略——让 Agent 成为 MoonCancer 的**外部监督者**：启动任务、盯终态、出事时介入（观察 / 操作 / 内存修改）。

![icon](icon.png)

## 功能

- **20 个 `mooncancer_*` 工具**：任务编排、配置方案管理、状态观察、语义战斗操作、内存修改、事件监听等（完整映射见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#工具映射)）。
- **截图直通视觉模型**：截图字节经宿主附件库铸成持久引用，工具结果当轮直出图像内容块，模型直接"看见"画面，无需 `image-read` 二次调用；附件链路不可用时自动退化为落盘 + 路径指引。
- **监督主循环策略注入**：`task start wait=true` 阻塞至终态，按终态类型（正常/停滞/卡关/熔断/维护…）分派处置，Agent 无需自建轮询循环。
- **介入模型**：任务运行中 `pause` 即静默全部脚本线程并放行手动操作（API 调用豁免暂停等待），完事 `resume`（10 分钟无请求也会自动恢复）。
- **安全确认门**：唯一保留的不可逆操作门是彩苹果（圣晶石）消耗，可预答（`pre_confirm=true`）或走事件应答；其余操作零仪式。
- **Web 配置页**：bundle 自带浏览器端配置表单（端口 / token / 超时 / 程序目录），中英双语。
- **自动拉起**：配置 `appDir` 后，服务不可达时工具会经 UAC 提权拉起 MoonCancer（支持打包版 exe 与源码仓 .venv 布局）。

## 前置条件

1. Windows 上运行中的 **DeepSeek Harness**。
2. **MoonCancer**（3.0.0以上版本）及其开放接口：在 MoonCancer 设置中开启「开放接口」（`apiEnable`），首次开启后会生成 `config/api.json`（含 `port` 与 `token`）。
3. 至少一台已配置的安卓模拟器（MuMu / 雷电 / 蓝叠等；分辨率 16:9 ≥1280×720）。

## 安装

### 方式一：插件管理器从 Git 安装（推荐）

在 DeepSeek Harness 插件管理器中安装：

```
github.com/SwakinX/dsh-mooncancer
```

依赖会自动解析（仅 `@deepseek-ai/schemastery`）。也可以直接写进 profile 的 `package.json`：

```
"@swakinx/dsh-mooncancer": "github:SwakinX/dsh-mooncancer"
```

### 方式二：本地开发

```powershell
git clone https://github.com/SwakinX/dsh-mooncancer E:\Github\dsh-mooncancer
```

## 配置

安装后在插件设置页填写（或写入 profile 自己的 patch 层）：

| 字段                 | 默认      | 说明                                                                        |
| -------------------- | --------- | --------------------------------------------------------------------------- |
| `port`             | `18765` | MoonCancer 开放接口端口（`config/api.json` 的 `port`）                  |
| `token`            | 空        | Bearer token（`config/api.json` 的 `token`）；接口未开鉴权可留空        |
| `requestTimeoutMs` | `15000` | 单次请求超时毫秒；`0` 表示无超时（长阻塞调用如 `task start wait=true`） |
| `appDir`           | 空        | MoonCancer 程序目录；留空禁用自动拉起                                       |

> **安全提示**：token 与本机路径只应保存在 profile 层或设置页，不要提交进任何会进仓库的 patch 文件。仓库内置的 `cordis.patch.yml` 只携带安全默认值。

## 使用速览

```
mooncancer_status                    # 一切的起点：服务状态 / 各配置占用 / 熔断计
mooncancer_task op=start task=battle count=30 wait=true   # 监督主循环，阻塞至终态
# 终态带 battle_state 与 shots（现场截图 id），按 kind 决定下一步：
#   QUEST_STUCK → mooncancer_shot 看现场 + mooncancer_plan_get 读攻略备注 → pause + cheat 接管
#   FUSED       → 看截图找陌生弹窗 → tap 关掉 → task restart
mooncancer_task op=pause             # 介入：静默脚本线程，act/battle/cheat 放行
mooncancer_task op=resume            # 恢复（10 分钟无请求也会自动恢复）
```

观察优先级：`query_state`（结构化谓词，便宜精确）→ `ocr` → `screenshot`（最贵，留给谓词不认识的场景）。操作优先用 `mooncancer_battle` 语义按键（选卡/技能/换人/选敌），比裸 `act` tap 稳。

## 故障排查

- **所有工具报「服务未启动」**：先 `mooncancer_app op=launch`（UAC 提权，最多等 60s）；失败常见原因是 `appDir` 未配置 / 目录布局不匹配 / `apiEnable` 未开 / UAC 被拒。
- **观察类工具 409 DEVICE_NOT_READY**：先 `mooncancer_device connect`（被动连接，不拉起模拟器）。
- **操作类 409 TASK_RUNNING**：目标配置任务运行中，先 `mooncancer_task pause`。
- **改了插件代码不生效**：宿主按 ESM 缓存模块，进程启动时加载一次——在插件管理器里禁用/重新启用本插件热重载，或重启应用。**重开会话没用**。
- **截图报「value is not lossless JSON」**：工具返回值里混入了值为 `undefined` 的键（宿主 lossless JSON 校验拒绝）。修复方式：条件展开，有值才携带键。
- **整轮崩溃报 `Cannot read properties of undefined (reading 'attachmentId')`**：图像内容块的 `attachment` 字段不是附件库签发的合法引用（如自造 base64 块）。图像引用必须来自 `ctx.get('attachments').saveImages`。历史里已持久化非法块的旧会话救不回来，弃用即可。
- **FUSED 反复但截图看起来正常**：UI 改版（用 `mooncancer_templates` 对比模板）或分辨率不符。
- **内存修改全失败**：常见原因——之前已修改过、临时地址已失效（`mooncancer_cheat clean` 清地址缓存后重试）；多开时附加了错误的进程（`mooncancer_cheat status` 看候选，`mooncancer_device connect` 带 pid 预登记）；模拟器为安卓 15 版（pymem 失效）。另注意 MuMu 的后台保活会影响**截图**（需关闭）。

## 限制

- 仅 Windows（自动拉起依赖 PowerShell `Start-Process -Verb RunAs`）。
- token 存于插件配置而非凭据存储；本插件与 MoonCancer 同机运行，风险与 `config/api.json` 本身同级。
- 依赖 MoonCancer 侧 API 契约（当前按修订 15 实现）；未开启 `apiEnable` 时所有调用连接失败。
- 挂机计划（HALT）仅能在 MoonCancer UI 设置，API 无端点；`daily`/`kidou` 不支持。

## 文档

- [架构与设计](docs/ARCHITECTURE.md)：工具映射表、图像直通链路、宿主契约要点、介入与确认门模型。
- [能力、规则与边界](docs/RULES.md)：各任务类型能做什么/不能做什么、过主线人工干预清单、内存修改规范、多开与连接技巧。

## License

[MIT](LICENSE)
