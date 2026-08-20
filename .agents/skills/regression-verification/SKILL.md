---
name: regression-verification
description: 面向 SurveyController 当前 Go 后端与 WinUI 3 原生壳的回归选择和验证技能。用于按改动边界选择 Go 单测、桌面后端测试、原生 Windows 构建、安装包构建和静态差异检查。
---

# Regression Verification

1. 先读目标模块的现有测试。优先跑最近测试，不用无关全量检查掩盖问题。
2. 按边界选择检查：
   - `SurveyCore/pkg/proxycore/` 或 `SurveyCore/pkg/surveycore/`：进入 `SurveyCore/` 跑受影响包；跨包接口再跑 `go test ./pkg/proxycore/... ./pkg/surveycore/...`。
   - `desktop/` 服务、RPC、设置、进程或运行态：`cd desktop; go test ./...`。
   - XAML、C++/WinRT、原生服务、资源或构建脚本：桌面 Go 测试后跑 `cd desktop; ./build/native.ps1 -Action test -Configuration Release` 和 Release 构建。
   - 安装包或 NSIS 改动：追加 `./build/native.ps1 -Action package`。
3. 用 fake 覆盖网络、外部代理、时钟和文件系统边界。普通单测不得接入真实问卷、账号或付费代理。
4. 构建会生成原生输出；只检查所需产物，不提交 `bin/`、`native/x64/`、`.tmp/` 或测试临时文件。
5. 原生交互改动不能只报构建成功。预览后确认应用进程和窗口存活，并用 UI Automation 或视觉证据覆盖实际改动；没有运行时证据就明确标为未验证。
6. SurveyCore 是独立 Git 子模块。分别检查子模块工作树和根仓库 gitlink，不把两者混成一次差异结论。最后运行 `git diff --check`，说明已运行和受限检查。
