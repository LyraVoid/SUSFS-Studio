![SUSFS Studio 宣传图](assets/susfs-studio-banner.png)

# SUSFS Studio

由 **LyraVoid 和 matsuzaka-yuki** 开发。

[English](README.md) · 简体中文

SUSFS Studio 是面向已提供 SUSFS 的 Android 设备的独立 WebUI。它无需修改宿主管理器，即可查看设备能力、管理配置归档，并审阅受支持的操作及其结果。

[下载 Beta v0.1.0-beta.1](https://github.com/LyraVoid/SUSFS-Studio/releases/tag/v0.1.0-beta.1) · [使用指南](docs/user-guide.md) · [兼容性记录](docs/host-integration.md#compatibility-evidence-matrix)

## 功能

- **设备诊断**：查看接口响应、实现方式、设备信息和接口报告的能力。
- **规则与设置**：在带版本的 Studio 归档中整理路径、Map、kstat、重定向及受支持的设置；应用符合条件的操作前，先审阅结合当前 Provider 能力生成的操作计划。
- **归档与恢复**：预览差异，保存、导出和恢复 Studio 的私有配置；通过修订检查和回执识别冲突及结果未知的情况。
- **操作报告**：查看逐项结果和独立检查的效果。请求被接口接受，并不自动代表效果已经验证。
- **离线 WebUI**：运行资源随模块分发。独立浏览器预览使用明确标注的模拟数据。

## 运行要求与安装

- Android arm64 设备，且内核已内建 SUSFS，或设备已加载提供 SUSFS 的模块。Studio 本身不安装 SUSFS。
- 能打开模块 WebUI 的兼容 Root 管理器。诊断命令和归档文件传输依赖设备上宿主提供的接口。
- 从 [Beta 发布页](https://github.com/LyraVoid/SUSFS-Studio/releases/tag/v0.1.0-beta.1)下载模块 ZIP，通过管理器安装，并按管理器提示使其生效；随后在模块列表中打开 **SUSFS Studio**。

测试设备操作前，请备份现有配置并确认可以停用模块。操作可用性取决于 Provider、版本、能力和启动阶段；条件不足时入口会受限。保存归档与应用操作计划是两个独立动作，恢复归档本身不会恢复内核运行状态。

### 可选的 SUSFS 使用方案

如果内核已集成 SUSFS，请直接使用已有实现，不要再叠加加载另一份。否则可根据设备选择兼容的方案：

**LKM（可加载内核模块）**

1. 从 [LKM 发布页](https://github.com/inforcqb/susfs4ksu-for-lkm/releases)下载与设备内核及 KMI 对应的 `.ko`。FinaSU 用户可以在「模块」页面上方的内核模块加载器中直接加载。
2. 其他 KernelSU 系用户可在支持的管理器中安装打包好的加载模块，或使用 `ksud insmod` 加载对应 `.ko`。**非 KernelSU 系设备**可以使用上游发布包附带的 `susfs_insmod` 加载器，按发布说明加载匹配的 `.ko`。上游打包 ZIP 标注为 arm64、仅支持 KernelSU 系管理器，并非通用 Magisk 包；加载器可用也不代表 Studio 的 WebUI 已验证兼容该管理器。

**内建（GKI / NON-GKI）**

可从[原始 SUSFS 补丁项目发布页](https://gitlab.com/simonpunk/susfs4ksu/)获取源码和补丁，将其集成到兼容的内核源码并随内核编译。Studio 在接口响应且实现类型确认后，会将内建实现显示为 **Built-In**。内核集成、安装和恢复方式因设备而异；Studio 尚未实测 NON-GKI 组合。

选择前请核对完整内核/KMI 和 Provider 构建信息，并遵循发布方的兼容说明；文件名匹配并不保证可用。加载内核组件前请确认恢复路径，避免在已有 SUSFS 的设备上叠加加载 LKM。

## 兼容性与安全

Studio 已实现 SUSFS 2.3 与 2.4 协议的主要功能：普通与循环路径、Map、动态／全克隆／静态 kstat、重定向、隐藏挂载／日志／AVC 三态设置、uname、cmdline／bootconfig、LKM 模块隐藏、挂载前缀和 Priority UID 过滤。每项操作仍受 Provider 报告的能力、实现类型、proc 扩展和启动阶段限制。

设备验证覆盖了特定的 **GKI-LKM SUSFS 2.3.0** 和 **GKI 内建 SUSFS 2.4.0** 组合。其他 Provider 构建使用同一套协议，但在实测前仍标记为未验证；不支持的能力和阶段会被拦截，而不是默认可用。具体环境、已测项目和缺口见[兼容性证据矩阵](docs/host-integration.md#compatibility-evidence-matrix)。

部分宿主 WebUI 桥提供通用的高权限命令和文件接口。Studio 会限制自己的调用，但无法保证宿主对导航或来源进行了隔离。使用前请阅读[安全模型](docs/security-model.md)和[宿主集成说明](docs/host-integration.md)。

## 技术栈

**WebUI**：React 19、严格模式 TypeScript，使用 Vite 7 与 pnpm 12 构建。Mantine 8 提供可访问控件，最终外观由 CSS Modules 与项目令牌控制；Material Color Utilities 按 HCT 生成浅色与深色配色；`lossless-json` 精确保留数字文本。路由采用哈希路径，运行时资源全部随包分发，界面提供简体中文与英文。检查工具为 Biome、TypeScript、Vitest、Playwright 与 axe。

**用户态与原生层**：单个 Rust 2024 编写的 `studioctl` 可执行文件，使用 `cargo-ndk` 交叉编译到 Android arm64（API 26 及以上）。依赖包括支持任意精度数字的 `serde`/`serde_json`、用于归档修订摘要的 `sha2`、`memmap2`，以及处理启动镜像的 `android-bootimg`。程序实现 protocol-1 诊断查询，以及 protocol-2 的操作计划、预写日志、执行、效果与恢复命令。模块脚本（`customize.sh`、`post-fs-data.sh`、`service.sh`）只负责准备模块、运行 Studio 自己的启动阶段，并把配置保存在私有目录 `/data/adb/susfs-studio/`。后台不常驻守护进程，也不开启网络监听。

## 开发

使用 Node.js 22.12 或更高版本、pnpm 12.21.0 启动浏览器预览：

```bash
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev --host 127.0.0.1 --port 5176 --strictPort
```

打开[本地预览](http://127.0.0.1:5176/#/)。预览使用模拟数据，不会连接设备。

## 文档

- [使用指南](docs/user-guide.md)：诊断、规则、归档和界面偏好。
- [归档格式](docs/archive-format.md)：Schema、校验、私有存储、回执和导出。
- [宿主集成](docs/host-integration.md)：已测宿主组合和桥接边界。
- [规则操作边界](docs/rule-operation-boundary.md)：操作门槛、ABI 证据和效果验证。
- [诊断 CLI](docs/diagnostic-cli.md)：原生命令和构建方法。
- [WebUI 维护指南](docs/webui-maintenance.md)：路由、源码职责和验证。
- [模块发布](docs/releases.md)：构建与发布流程。
- [设计规范](DESIGN.md)：视觉令牌和布局要求。

## 致谢

- [Shirone](https://github.com/LyraVoid/Shirone)：前端工程结构与部分 Material 3 Expressive 组件设计的参考。
- [susfs4ksu-module](https://github.com/sidex15/susfs4ksu-module)：独立 SUSFS 管理模块思路的参考。Studio 不分发、也不调用它的用户态工具。
