---
name: gui-development
description: 面向 SurveyController 当前 Go+Wails + React 桌面端的 GUI 开发与界面修复技能。用于修改 `apps/desktop/frontend/` 的页面、组件、表单、导航、弹窗、动效、配置编辑和运行状态展示；处理 Radix 控件、Wails 绑定、异步状态、焦点态、窗口生命周期、布局缩放和真实后端接线。不要用于恢复旧 Python/PySide6 UI 或浏览器自动化。
---

# SurveyController GUI Development

## 基线

- 桌面壳在 `apps/desktop/`，React 前端在 `apps/desktop/frontend/`。
- 前端通过 `src/services/shell.ts` 调 Wails 绑定。不要在组件里直接写 HTTP、读配置文件或伪造成功状态。
- 组件优先复用 `src/components/ui/` 的 Radix 封装、`lucide-react` 图标和现有 CSS 变量。
- 样式入口是 `src/style.css`，基础控件样式在 `src/components/ui/styles/`。
- 只维护 Windows 桌面端。Wails WebView 只承载 UI，不承担问卷自动化。

## 开始前

1. 读 `AGENTS.md`、目标页面、对应服务函数和已有测试。
2. 沿着 `页面 -> App.tsx -> services/shell.ts -> Wails binding -> AppService` 检查数据流。
3. 先确认改动是视觉、交互、状态还是后端能力。不要用 UI 层的假数据掩盖缺失的服务能力。
4. 涉及窗口关闭、文件选择、通知、代理验活等能力时，先找已有 Wails 方法和错误映射。

## UI 设计协议

### 视觉方向

- 延续当前 Windows Fluent/Mica 方向：半透明层、细边框、低强度阴影、蓝色功能强调色。
- 不新增紫色渐变、Emoji 图标、默认浏览器控件外观或与现有页面割裂的卡片风格。
- 图标统一使用 `lucide-react`，尺寸和描边保持邻近控件一致。
- 文案保持简洁中文。不要把迁移说明、内部状态、开发解释写进界面。
- 同一类控件共享变量、圆角、边框和状态样式，不在页面里复制一套近似 CSS。

### 动效与缓动

- 进入使用缓出，退出使用缓入；禁止在线性缓动上堆动画。
- 普通控件反馈约 `140–220ms`，页面切换约 `200–280ms`，窗口退场约 `160ms`。动画只作用于 `transform`、`opacity`、颜色或阴影。
- 条件组件用挂载动画展示。需要重播时改变明确的状态 key，不要靠强制重排。
- 页面切换必须区分前进和后退方向；窗口打开、确认弹窗和窗口关闭保持同一节奏。
- 所有新动画补 `@media (prefers-reduced-motion: reduce)`，减少动态时移除位移、缩放和等待。
- 不要给每个元素都加动画。一个视图只突出一到两个主要动效层。

### 交互状态

- 每个可点击控件都要有默认、悬停、按下、禁用、错误和成功状态；耗时操作还要有忙碌状态。
- 鼠标点击不显示 WebView 原生蓝色焦点框；保留 `:focus-visible` 键盘焦点提示。
- 下拉框、开关、滑块等 Radix 控件必须明确 `touch-action`、`user-select`、焦点和指针捕获规则。
- 受控控件的 value 变化不能导致组件重建。禁止用随数值变化的 `key` 包住正在拖动的控件。
- 条件显示的输入框、按钮和结果提示必须跟真实状态绑定。隐藏时卸载，显示时播放进入动画；不要保留不可用的空占位。
- 错误要显示在用户能定位的位置，同时保留服务层错误信息；不要吞异常或只在控制台打印。

### 布局与可用性

- 先保证桌面窗口常规尺寸可用，再处理窄窗口和 DPI 缩放；禁止固定宽度把输入框、按钮挤出视口。
- 表单标签、输入框、按钮按同一行的视觉层级排列；条件表单展开后不能覆盖相邻内容。
- 交互区域保留足够点击尺寸，文本不要依赖颜色单独表达状态。
- 深色模式、`prefers-reduced-motion`、键盘 Tab 导航和禁用状态必须一起检查。

## 实施边界

- 组件负责展示、交互和局部状态；页面负责编排；`services/` 负责 Wails 调用和数据映射。
- 网络请求、文件 IO、代理验活、问卷运行不能写进渲染函数，也不能阻塞 UI 线程。
- 可复用的输入/验活/反馈组合抽到 `src/components/`，不要在 Dashboard、Runtime 等页面复制。
- Go 服务接口变化后重新生成 TypeScript bindings，不手写生成文件。
- 不恢复 Python、uv、`software/`、Playwright、Selenium 或浏览器自动化兜底。

## 验证

- 前端改动至少运行：

  ```powershell
  cd apps/desktop/frontend
  npm run check
  npm test -- --run
  npm run build
  ```

- 交互改动补静态渲染或行为测试，至少覆盖条件展示、禁用/忙碌状态和错误反馈。
- Wails 服务或绑定改动追加：

  ```powershell
  cd apps/desktop
  wails3 generate bindings
  go test ./...
  ```

- 不能做真实外部问卷、账号或付费代理请求。需要网络验证时使用 fake server 或明确的 live/integration 测试。
- 输出时说明实际改动、文件路径和运行过的检查；不要创建 Markdown 验证清单。
