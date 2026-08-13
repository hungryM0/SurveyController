---
name: native-winui-shell
description: 面向 SurveyController 当前 C++20、C++/WinRT、WinUI 3 原生桌面壳的开发与修复技能。用于修改 `apps/desktop/native/SurveyController.App/` 的 XAML 页面、窗口、原生服务、导航、表单、弹层、无障碍、缩放和 Go 后端 RPC 调用。
---

# Native WinUI Shell

1. 先读根目录 `DESIGN.md`、目标页面、相邻 `.xaml.cpp/.h` 和相关 `Services/`。
2. 开发或修改 WinUI 3、Windows App SDK、C++/WinRT API 和 XAML 行为前，必须核对对应的微软官方文档与版本说明；不得凭记忆或猜测 API、属性、事件和生命周期。
3. 页面放 `Views/`，窗口级逻辑放 `MainWindow`，可复用能力放 `Services/`。不要把 RPC、文件 IO 或长任务堆进 XAML 事件。
4. 复用 WinUI 3 原生控件、现有资源和 Fluent/Mica 视觉。保持键盘焦点、无障碍文字、深色模式、窄窗口和 DPI 缩放。
5. 调后端时通过 `Services/BackendClient` 调用已有 JSON RPC。新增能力先同步 Go 服务、RPC 方法和页面错误反馈；禁止伪造成功状态。
6. 条件界面使用现有 WinUI 导航、`ContentDialog`、`Flyout`、`TeachingTip` 或 `Expander`。不要自制 Web 卡片、字符图标或另一套控件皮肤。
7. 变更后至少检查相关 C++/XAML 编译影响；壳、资源或交互改动运行：

```powershell
Set-Location apps/desktop
go test ./...
.\build\native.ps1 -Action build -Configuration Release
```

本地预览运行 `native.ps1 -Action preview`。发布打包运行 `native.ps1 -Action package`。不使用 Wails、React、WebView 或浏览器自动化。
