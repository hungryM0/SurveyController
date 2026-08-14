---
name: settings-storage
description: 面向 SurveyController Windows 桌面端设置、配置、凭据和本地持久化兼容的开发技能。用于修改 `apps/desktop/` 中的应用设置、配置仓库、路径、凭据存储、原子写入、schema、默认值和迁移代码。
---

# Settings and Storage

1. 先读目标存储实现、请求/响应结构和相邻测试；涉及界面回填时再读调用该 RPC 的 WinUI 页面。
2. 区分应用设置、问卷配置、凭据和日志。各自保持独立的读写、默认值和错误语义，不能借用安装目录存用户数据。
3. 新字段必须有安全默认值；改字段名、类型或语义时明确迁移策略。旧数据不能静默错配，无法迁移时返回可理解错误。
4. 写配置保持现有原子写入方式。凭据不得回写到普通 JSON、日志或测试夹具。
5. 改变 JSON/RPC 数据时同步检查加载、保存、重启和页面回填路径。
6. 先运行相邻测试；存储改动至少运行：

```powershell
Set-Location apps/desktop
go test ./...
```
