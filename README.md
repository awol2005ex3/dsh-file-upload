# dsh-file-upload

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）插件：在右侧边栏**文件树**的每个目录行上增加上传按钮，把本地文件上传到 workspace。

## 功能

- 文件树的每个目录行（hover 时）显示一个上传图标按钮
- 点击后弹出文件选择框，支持多选，上传到该目录
- 通过认证的 `/api/file` 路由上传文件
- 上传失败给出 toast 提示（目标目录不存在 / 无权限 / 超过大小上限 / 暂时不可用）

## 安装

独立工程按 dsh CLI 安装（装完**重启宿主**——插件集在启动时扫描并缓存）：

```bash
npx @deepseek-ai/dsh plugin --profile web add D:/path/to/dsh-file-upload
```

或发布到 npm / Git 后通过插件页的 bundle 安装入口安装。

验证装配：`npx @deepseek-ai/dsh --profile web --dump-config` 应能看到 `file-upload` 行；浏览器 DevTools 检查 `window.__DSH_BOOT__.entries` 含本包、`/plugins/dsh-file-upload/client.js` 返回 200。

## 构建

```bash
npm install
npm run typecheck   # tsc --noEmit（strict）
npm run build       # tsc 编译到 lib/ + wrap-client.mjs 包装浏览器 bundle
```

> Windows PowerShell 提示 `npm.ps1 未进行数字签名` 时，改用 `npm.cmd run build`。

## 架构

```
dsh-file-upload/
├── package.json          # 包声明 + dsh.bundle / dsh.client 配置
├── cordis.patch.yml      # Cordis profile patch（注册插件到配置树）
├── tsconfig.json         # strict + noUncheckedIndexedAccess
├── scripts/
│   └── wrap-client.mjs   # 浏览器 bundle 闭包工厂包装脚本
├── lib/                  # 构建产物（gitignore），勿手改
└── src/
    ├── index.ts          # 宿主端入口（纯客户端插件，无宿主逻辑）
    └── client.ts         # 浏览器端全部逻辑：行扫描 + 按钮注入 + 上传 + toast
```

### 插件类型

纯客户端插件（client-only）、**纯 DOM 实现**：不依赖任何 dsh / cordis 内部 API，因此不需要 `inject`，也不碰 `ctx`。

### 与上游 PR 的关系

上游 `feat(ui-sidebar-files)` 在文件树组件内部加了 `download` face 与行内按钮。本插件在外部复现同一交互契约：

| 环节 | 上游 PR | 本插件 |
|------|---------|--------|
| 触发 | 行内 React 按钮 | MutationObserver 给行注入 DOM 按钮 |
| 取数 | `fileMediaUrl` → `/api/file?path=` | 同一 URL 规则（本地复刻，见踩坑 4） |
| 保存 | anchor click | anchor click |

上传方面采用 POST 方式与同等交互契约对齐。

### 关键 DOM 锚点

| 选择器 | 用途 |
|--------|------|
| `li[data-files-entry="directory"]` | 目录行（仅注入上传按钮，文件行不注入） |
| `li[data-files-path]` | 行的绝对路径属性，上传 URL 的来源 |

## 调试

打开 DevTools Console：

| 日志 | 判读 |
|------|------|
| `[dsh-file-upload] plugin loaded` | 缺失 → 插件未加载（安装 / bundle 问题），或 init 抛错（查 `window.__dshFileUploadError`） |
| `refused: <reason> <status> <path>` | 预检被服务端拒绝的原因与状态码 |

> 更新插件代码后必须**整页刷新**（F5）：插件带单例守卫（`__dshFileUploadMounted`），仅热更新不会加载新代码。

## License

Apache License 2.0