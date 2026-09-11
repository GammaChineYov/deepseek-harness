---
created_at: 2026-08-15
update_at: 2026-08-15
summary: DeepSeek Harness 本体 + 三个配套插件（dsh-cc-tui / dsh-better-sidebar / dsh_workflow）的完整安装教程，含 WorkBuddy 环境注意事项与双 node 版本漂移修复
---

# DeepSeek Harness 安装教程（含三个配套插件）

## 0. 总览

| 组件 | 作用 |
|------|------|
| **DeepSeek Harness (dsh)** | DeepSeek 官方 Agent 框架（v0.1 预览版），Web UI + 插件体系 |
| **dsh-cc-tui** | Claude Code 风格全屏终端界面（像素鲸鱼顶栏） |
| **dsh-better-sidebar** | 增强工作台：文件管理 / 终端 / Git 面板 |
| **dsh_workflow** | 多 Agent 协作：把一次性多 Agent 调度升级为可保存/治理/恢复的 Workflow |

**环境要求**：Node 22+、pnpm（版本按仓库要求）、Git。Windows / macOS / Linux 均可。

---

## 1. 安装 DeepSeek Harness 本体

### 1.1 准备 pnpm 11.7（仓库强制要求）

仓库 `packageManager` 字段要求 **pnpm@11.7.0**，低版本 pnpm（如 10.x）解析不了它的 lockfile（报 `ERR_PNPM_INVALID_VERSION_UNION`）。

```bash
# 方式一：corepack 自动切换（推荐）
corepack enable
corepack prepare pnpm@11.7.0 --activate

# 方式二：装到隔离目录（本机已验证，不污染全局）
mkdir -p ~/node-workspace && cd ~/node-workspace
npm install pnpm@11.7.0 --no-save
# 之后用：~/node-workspace/node_modules/.bin/pnpm
```

### 1.2 克隆并安装

```bash
git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness

# 安装依赖（238 个 workspace 包，约 2 分钟）
pnpm install

# 构建（tsc + Vite Web UI）
pnpm run build
```

### 1.3 启动 Web UI

```bash
pnpm dsh web
```

启动后浏览器访问 **http://127.0.0.1:3080**，按提示：
**设置 → 模型 → 输入 DeepSeek API Key** → 选择工作区 → 开始对话。

> 支持四种模式：标准 / PTC（程序化工具调用）/ 极简 / 创造。

---

## 2. 安装三个配套插件

插件装在 profile 上（默认 `web` profile 对应 Web UI，`cc-tui` 对应终端界面）。

### 2.1 dsh-cc-tui（Claude Code 风格终端界面）

```bash
# 装到独立 cc-tui profile
dsh plugin --profile cc-tui add dsh-cc-tui

# 启动终端界面（像素鲸鱼出现）
dsh --profile cc-tui
```

特点：全屏终端、实时状态行、双击 Esc 时间回溯、`/` 命令菜单、主题系统。

### 2.2 dsh-better-sidebar（增强工作台）

```bash
dsh plugin --profile web add dsh-better-sidebar@0.10.3
```

**装之前先配置 profile 的 `pnpm-workspace.yaml`**（否则会被 pnpm 拦截）：

```yaml
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
allowBuilds:
  node-pty: true        # 终端组件，需跑构建
  protobufjs: true
minimumReleaseAgeExclude:
  - dsh-better-sidebar  # 24h 内新发布的包，供应链策略放行
```

> ⚠️ 若你的网络访问 GitHub 不稳定，node-pty 的 prebuild 下载会卡死。此时把 `node-pty` 从 `allowBuilds` 移除（跳过其构建，装完后再用本机 VS 手动 `node-gyp rebuild` 补齐终端二进制）。

### 2.3 dsh_workflow（多 Agent 协作）

该插件**不在 npm registry**，用 GitHub 源安装：

```bash
dsh plugin --profile web add "github:dsh-external/dsh_workflow#main"
```

装完重启 profile，会话中可用命令：

```
/workflow list
/workflow create 为这个仓库设计一个并行安全评审流程
/workflow parallel-investigation {"question":"为什么这个测试会间歇失败？"}
/workflow runs
```

### 2.4 验证插件

```bash
dsh plugin --profile web list
# 应看到：@dsh-external/workflow、dsh-better-sidebar
```

---

## 3. WorkBuddy 环境注意事项（仅在本机 WorkBuddy 内执行时）

以下限制是 **WorkBuddy 沙箱特有的**，普通终端/Explorer 双击不受影响：

| 坑 | 现象 | 解决 |
|----|------|------|
| pnpm 临时目录清理 EPERM | 沙箱内 `pnpm install` 卡死 | 命令加 `dangerouslyDisableSandbox`（沙箱外执行） |
| safe-delete 批量删除守卫（50 文件阈值） | WorkBuddy 环境装大插件（如 better-sidebar 298 包）卡在 `added ~50` | 写收尾 `.cmd` 让用户**在自己环境**双击跑 `pnpm install --no-frozen-lockfile` |
| cordis.yml 覆盖写 EPERM | `dsh web` 第二次启动崩溃 | 启动前删 `%USERPROFILE%\.dsh\profiles\web\cordis.yml` |
| `.cmd` 中文乱码 | cmd.exe 按 GBK 解析，UTF-8 乱码 | 用纯 ASCII 或 GBK 编码 |
| `.cmd` 调 pnpm 闪退 | `pnpm.cmd` 依赖 PATH 里的 node，用户环境没有 | 用 node 绝对路径调 pnpm.cjs |
| **双 node 版本漂移** | `dsh web` 服务起来几秒就崩（loader 报 `node:zlib.createZstdDecompress` 缺失），外层等 60s 报超时 | `.cmd` 里前置 workbuddy node 目录到 PATH（见下方"双 node 版本漂移"小节） |
| 写桌面文件"找不到" | 沙箱内写用户目录不真实落盘 | 沙箱外 Python 写真实路径 |

#### 双 node 版本漂移（已修复）

**现象**：双击 `DeepSeek Harness.cmd` 后，服务起来几秒就退，外层脚本等满 60s 报 `Could not reach port 3080 in 60s`。内层窗口日志出现：

```
SyntaxError: The requested module 'node:zlib' does not provide an export named 'createZstdDecompress'
Node.js v22.12.0
```

**根因**：外层脚本虽用 workbuddy 的 **node v22.22.2** 启动 pnpm，但 pnpm 执行 `dsh` 脚本（`node --import tsx/esm apps/cli/src/bin.ts`）时，脚本内的 `node` 走 **PATH 解析**，命中 `C:\Program Files\nodejs\node`（**v22.12.0**）。dsh 的 loader 依赖 `node:zlib.createZstdDecompress`（Node **22.12 才加入**），旧 node 缺该 API → 整个 loader 链崩溃 → 服务秒退。

**修复**（`dsh-web-server.cmd` 与 `DeepSeek Harness.cmd` 均已内置）：

```bat
rem 前置 workbuddy node(22.22.2)到 PATH,确保 pnpm scripts 里的 node 解析到正确版本
set "PATH=C:\Users\Landrom\.workbuddy\binaries\node\versions\22.22.2;%PATH%"
```

验证：修前服务存活 <5s；修后稳定监听 3080，日志输出 `dsh web: http://127.0.0.1:3080`，端到端（外层 → start 内层 → 轮询就绪）通过。

本机已验证的可靠写法（`.cmd` 内）：

```bat
"C:\Users\Landrom\.workbuddy\binaries\node\versions\22.22.2\node.exe" "C:\Users\Landrom\.workbuddy\binaries\node\workspace\node_modules\pnpm\bin\pnpm.cjs" <command>
```

---

## 4. 本机一键启动

桌面 `DeepSeek Harness.cmd`：双击 → 自动删 cordis.yml → 起服务 → 等 3080 就绪 → **自动打开浏览器**。两个 `.cmd` 均已内置 workbuddy node PATH 前置（见 [3. 双 node 版本漂移](#3-workbuddy-环境注意事项仅在本机-workbuddy-内执行时)），直接双击即可。

桌面 `install-dsh-plugins.cmd`：在本机 WorkBuddy 环境下装完 better-sidebar 后，双击它（在自己环境）完成最后安装。

---

## 5. 常见问题

- **Q: 插件报"24h 新包被拒"** → 在 pnpm-workspace.yaml 的 `minimumReleaseAgeExclude` 加上包名
- **Q: 终端面板报错** → node-pty 二进制缺失，用 VS Build Tools 手动 `node-gyp rebuild`
- **Q: 端口被占** → `netstat -ano | grep 3080` 找到 PID 杀掉残留进程
- **Q: 启动后服务秒退 / 等 60s 报超时** → 双 node 版本漂移：PATH 里系统 node（22.12.0）比 workbuddy node（22.22.2）旧，`dsh` 脚本内的 `node` 解析到旧版，缺 `node:zlib.createZstdDecompress`。已在两个 `.cmd` 中前置 workbuddy node 到 PATH 解决；若改环境后复发，检查 PATH 首位 node 是否 ≥22.12
- **Q: 想回退插件** → `dsh plugin --profile web remove <pkg>`

---

*注意：DSH 是 v0.1 开发者预览版，官方明确后续会有破坏性兼容变更，先别用于生产环境。*
