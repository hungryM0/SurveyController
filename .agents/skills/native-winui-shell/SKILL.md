---
name: native-winui-shell
description: 面向 SurveyController 当前 C++20、C++/WinRT、WinUI 3 原生桌面壳的开发与修复技能。用于修改 `desktop/native/SurveyController.App/` 的 XAML 页面、窗口、原生服务、导航、表单、弹层、无障碍、缩放和 Go 后端 RPC 调用。
---

# Native WinUI Shell

1. 先读目标页面、相邻 `.xaml.cpp/.h`、相关 `Services/`、`App.xaml` 和现有资源。界面依据以当前原生实现、WinUI 控件语义和微软官方文档为准。
2. 开发或修改 WinUI 3、Windows App SDK、C++/WinRT API 和 XAML 行为前，必须显式调用 `microsoft-learn` MCP，核对对应的微软官方文档与版本说明；不得凭记忆或猜测 API、属性、事件和生命周期。先用文档搜索定位，再按需抓取完整页面。
3. 页面放 `Views/`，窗口级逻辑放 `MainWindow`，可复用壳能力放 `Services/`。页面调用 `RpcServices`，不直接拼 RPC 方法名、JSON 或匿名管道帧。不要把文件 IO、进程管理或长任务堆进 XAML 事件。
4. WinUI 界面必须按原生 Windows 桌面 UI 设计。禁止套用 Web 开发思路，不使用 DOM/CSS、网页断点、CSS Flex/Grid、网页卡片、Web 组件、CSS token、悬停驱动交互或自绘控件的思维替代 WinUI 语义。
5. 复用 WinUI 3 原生控件、XAML 视觉树、依赖属性、现有资源、`ThemeResource` 和 Fluent/Mica 视觉。窗口尺寸适配使用 WinUI 布局、VisualState 和窗口机制，不照搬网页响应式规则。保持键盘焦点、无障碍文字、深色模式、窄窗口和 DPI 缩放。
6. `RpcServices` 提供业务调用，`BackendClient` 只负责匿名管道传输和后端进程生命周期。新增能力同步 Go 服务、RPC 分派、`RpcServices` 和页面错误反馈；禁止伪造成功状态。
7. 条件界面使用现有 WinUI 导航、`ContentDialog`、`Flyout`、`TeachingTip` 或 `Expander`。不要自制网页式卡片、字符图标或另一套控件皮肤。
8. 变更后至少检查相关 C++/XAML 编译影响；壳、资源或交互改动运行：

```powershell
Set-Location desktop
go test ./...
.\build\native.ps1 -Action test -Configuration Release
.\build\native.ps1 -Action build -Configuration Release
```

本地预览运行 `native.ps1 -Action preview`。构建成功不等于交互通过；界面改动还要确认进程和窗口存活，并检查目标页面的键盘、窄窗和高 DPI 行为。发布打包运行 `native.ps1 -Action package`。不使用 Wails、React、WebView 或浏览器自动化。
