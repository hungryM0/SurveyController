---
name: native-winui-shell
description: 面向 SurveyController 的 C#/.NET WinUI 3 桌面壳开发与修复技能。用于修改 desktop/native-cs/ 的 XAML 页面、ViewModel、原生服务、导航、表单、弹层、无障碍、缩放和 Go 后端 RPC 调用。
---

# Managed WinUI Shell (C#/.NET)

应用改动后的验收不得使用 Computer Use，不得为验收抢占、切换或操纵用户当前桌面；缺少不干扰的运行时证据时，明确标为未验证。

1. 先读目标页面（`desktop/native-cs/src/SurveyController.App/Views/`）、对应 ViewModel（`ViewModels/`）、相邻 partial 文件与相关 `Services/`。界面依据以当前实现、WinUI 控件语义和微软官方文档为准；涉及 WinAppSDK API 前先查官方文档，不凭记忆猜测。
2. 分层约定：`SurveyController.Core`（net8.0 纯逻辑库）持有 RPC 客户端、帧协议、WizardDocument 与 DTO，可在任意平台跑 xUnit 测试；壳项目只做展示编排。页面调用 `Services/RpcServices` 门面，禁止拼 RPC 方法名、JSON 信封或管道帧；`BackendClient` 只负责进程与管道传输。
3. 使用 CommunityToolkit.Mvvm：ViewModel 继承 `ObservableObject`，状态用 `[ObservableProperty]` 分部属性，命令用 `[RelayCommand]`；业务规则、题型语义、校验和持久化必须留在 Go/SurveyCore，壳层只提交编辑草稿（策略与规则的规范化归 Go）。
4. XAML 规范：`x:Bind` 显式写 `Mode`；TextBox 双向绑定加 `UpdateSourceTrigger=PropertyChanged`；DataTemplate 带 `x:DataType`；颜色只用 `{ThemeResource}` 和主题字典（Light/Dark/HighContrast 三套都要覆盖）；每个交互控件设唯一的 `AutomationProperties.AutomationId`。窗口尺寸用 AppWindow 物理像素乘 DPI 缩放。
5. 只用 WinUI 3 官方控件与 Fluent/Mica 能力。禁止自定义控件、第三方/Web 控件、自定义 ControlTemplate 手绘样式、Canvas/Path/Win2D 绘图，以及 DOM/CSS 式网页思维。弹层用 ContentDialog/Flyout/TeachingTip；代码创建的对话框须经 `DialogStyling.PrepareContentDialog` 套样式并跟随主题。
6. 长任务与轮询保持取消/暂停/日志可用：DispatcherQueueTimer + 代次守卫防过期回调；后台 RPC 用 async/await，结果回 UI 线程再改控件。文件选择器走 WinAppSDK `Microsoft.Windows.Storage.Pickers` 并传主窗口 WindowId。
7. 变更后验证：

```powershell
Set-Location desktop
./build/native.ps1 -Action build -Configuration Release   # dotnet build + go build 后端
./build/native.ps1 -Action test  -Configuration Release   # dotnet test（Core 单测）
```

纯逻辑改动只需在任意平台跑 `dotnet test desktop/native-cs/tests/SurveyController.Core.Tests`。发布打包运行 `-Action package`（NSIS 不变）。本地预览运行 `native.ps1 -Action preview`。构建成功不等于交互通过；界面改动仅在不干扰用户的方式下确认进程与窗口存活，并覆盖键盘、窄窗和高 DPI 行为后算通过，否则明确标为未验证。不使用 Wails、React、WebView 或浏览器自动化。
