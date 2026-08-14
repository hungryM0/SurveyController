---
name: regression-verification
description: 面向 SurveyController 当前 Go 后端与 WinUI 3 原生壳的回归选择和验证技能。用于按改动边界选择 Go 单测、桌面后端测试、原生 Windows 构建、安装包构建和静态差异检查。
---

# Regression Verification

1. 先读目标模块的现有测试。优先跑最近测试，不用无关全量检查掩盖问题。
2. 按边界选择检查：
   - `packages/proxycore/` 或 `packages/surveycore/`：受影响包测试；跨包接口再跑两个核心模块。
   - `apps/desktop/` 服务、RPC、设置、进程或运行态：`cd apps/desktop; go test ./...`。
   - XAML、C++/WinRT、原生服务、资源或构建脚本：桌面 Go 测试后跑 `cd apps/desktop; ./build/native.ps1 -Action build -Configuration Release`。
   - 安装包或 NSIS 改动：追加 `./build/native.ps1 -Action package`。
3. 用 fake 覆盖网络、外部代理、时钟和文件系统边界。普通单测不得接入真实问卷、账号或付费代理。
4. 构建会生成原生输出；只检查所需产物，不提交 `bin/`、`native/x64/`、`.tmp/` 或测试临时文件。
5. 最后运行 `git diff --check`。说明已运行的检查和受环境限制无法运行的检查。
