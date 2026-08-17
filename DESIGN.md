---
name: SurveyController Windows Desktop
purpose: Windows 问卷自动化桌面端的统一设计契约
product: 工具型桌面端应用
platform: Windows desktop
stack: C++20 + C++/WinRT + WinUI 3 + Windows App SDK
source_of_truth: DESIGN.md
breakpoints:
  compact: '< 720px'
  desktop: '>= 720px'
colors: WinUI 3 ThemeResource
typography:
  family: 'Segoe UI Variable Text, Segoe UI, Microsoft YaHei UI, SCInter'
  page-title: '24px / 1.2 / 700'
  section-title: '20px / 1.3 / 650'
  body: '14px / 1.4 / 400'
  caption: '12px / 1.45 / 400'
rounded:
  control: 6px
  card: 12px
  dialog: 10px
  pill: 9999px
spacing:
  base: 4px
  control: 34px
  compact-gutter: 12px
  desktop-gutter: 20px
  section: 20px
motion:
  control: '140ms - 220ms'
  page: '200ms - 280ms'
  window-exit: '160ms'
---

# SurveyController Windows Desktop

## 设计定位

SurveyController 是 Windows 问卷自动化工具，不是营销页，也不是数据展示墙。

界面优先回答四个问题：

1. 当前配置是什么？
2. 当前任务是否可以启动？
3. 任务正在处理什么？
4. 用户下一步应该做什么？

视觉方向固定为 Windows Fluent/Mica：半透明层、细边框、低强度阴影和蓝色功能强调色。界面要克制、可扫描、像桌面工具，不做网页化装饰。

## 设计原则

### 1. 操作优先

运行、停止、保存、测试连接、刷新和选择配置是一级操作。设置说明、日志和帮助是二级内容。

一级操作必须有清晰文字。纯图标按钮只用于关闭、返回、刷新、切换主题等低歧义动作。

### 2. 状态可见

任务状态必须同时使用文字、图标或结构表达。不能只靠红绿颜色区分成功和失败。

加载、空状态、失败、禁用、成功和已连接都要有独立反馈。耗时操作必须阻止重复提交。

### 3. 信息分层

页面标题、分组标题、字段标签、说明文字和控件结果保持固定层级。复杂配置按分组展开，不用装饰填充空间。

### 4. 单一来源

颜色、字体、圆角、动效和控件状态必须来自本文件、`desktop/native/SurveyController.App/App.xaml` 及其 WinUI 3 `ThemeResource`。页面不能另建相近的局部样式体系。

### 5. 原生语义，统一表面

保留 WinUI 控件的键盘、焦点、选择和指针语义。用样式资源统一表面，不以自绘控件替代原生交互。

## 颜色 Token

### 基础 Token

| Token | WinUI 3 资源或控件语义 | 用途 |
| --- | --- | --- |
| `surface` | `CardBackgroundFillColorDefaultBrush` | 卡片、面板 |
| `control` | `ControlFillColorDefaultBrush` | 输入、下拉、按钮 |
| `text` | `TextFillColorPrimaryBrush` | 主文字 |
| `text-muted` | `TextFillColorSecondaryBrush` | 说明、辅助信息 |
| `border` | `CardStrokeColorDefaultBrush` 或 `ControlStrokeColorDefaultBrush` | 边框、分隔线 |
| `primary` | `AccentFillColorDefaultBrush` | 主操作、选中、焦点 |
| `success` | `InfoBar` 的 `Severity="Success"` | 成功、已连接 |
| `warning` | `InfoBar` 的 `Severity="Warning"` | 等待、风险提示 |
| `danger` | `InfoBar` 的 `Severity="Error"` | 失败、危险操作 |

操作层只保留一个主色系。状态色不能单独承担语义，必须配合文字、图标或结构变化。

### 禁止项

- 不新增紫色渐变。
- 不使用 Emoji 作为功能图标。
- 不用网页卡片、模拟皮肤或模拟控件替代 WinUI 3 控件。
- 不使用大面积高饱和色块、厚重黑色投影或彩色玻璃堆叠。

## 字体与文字

主字体使用 `Segoe UI Variable Text`，回退到 `Segoe UI`、`Microsoft YaHei UI` 和 `SCInter`。

| 层级 | 字号 / 行高 | 用途 |
| --- | --- | --- |
| `page-title` | `24–28px / 1.2` | 页面标题 |
| `section-title` | `18–20px / 1.3` | 卡片和分组标题 |
| `body` | `14px / 1.4` | 正文、控件文字 |
| `body-sm` | `13px / 1.45` | 字段说明、状态辅助文字 |
| `caption` | `12px / 1.45` | 次要元信息 |

标题使用 `650–700` 字重。数字、时间、进度和任务量使用等宽数字字形。中文文案用短句，标签描述用户能做的事，不暴露内部字段名。

## 布局规则

### 桌面壳

- 标题栏、侧边导航和工作区保持固定层级。
- 页面内容放在 `desktop/native/SurveyController.App/Views/`。
- 导航宽度、标题栏高度和工作区间距使用 XAML ResourceDictionary 中的资源。
- 卡片只承担一个清晰分组，不把互不相关的设置塞进同一张卡片。

### 表单页

- 表单按“标签与说明 / 控件”分栏。
- 桌面端控件右对齐，窄窗口自动切为单列。
- 不用固定宽度把输入框、下拉和按钮挤出视口。
- 条件字段使用 `Visibility="Collapsed"` 隐藏，不保留空白占位；不再需要时解除事件和异步引用。

### 弹层

- 弹层从触发控件附近展开，保持触发上下文。
- 弹层必须有稳定背景、边框和层级，不能让下方文字穿透。
- 需要超出工作区定位时使用 WinUI 3 `TeachingTip`、`Flyout` 或等价的可用空间定位。

## 组件规则

### Button

- 普通按钮复用 WinUI 3 `Button` 和现有样式资源。
- 主操作使用 `AccentButtonStyle`，次级操作使用默认 `Button` 样式。
- 同一组按钮只保留一个主操作。
- 按钮必须保持默认、悬停、按下、禁用、忙碌和键盘焦点状态。
- 不用缩放或位置变化伪造悬停反馈。

### Input

- 每个输入都有可见标签或 `AutomationProperties.Name`。
- Placeholder 不能代替标签。
- 输入高度和圆角跟随 WinUI 3 `TextBox` 样式资源，不在页面 XAML 中重复定义。
- 错误状态同时使用边框、文字和可访问通知。

### Select 与 Popover

- 下拉触发器统一复用 WinUI 3 `ComboBox` 样式资源。
- 下拉弹层统一复用 WinUI 3 `ComboBox` 的键盘和焦点语义。
- 日期、时间、代理源、地区和其他菜单属于同一类弹出控件。除内容不同外，不得另造一套箭头、边框、圆角、阴影和进入动画。
- 弹层支持 Tab、Enter、Escape 和方向键语义。点击外部关闭，不能制造键盘陷阱。

### Switch 与 Slider

- 复用 WinUI 3 `ToggleSwitch`、`Slider` 和 `ProgressBar`。
- 值更新直接写入现有控件，不重建控件树，避免丢失焦点和指针捕获。
- 滑块必须显示当前值或范围，不能只显示一条没有解释的线。

### Card 与 Dialog

- 页面直接组合原生控件和布局容器，不定义页面级控件皮肤。
- 弹窗使用 WinUI 3 `ContentDialog`，标题、关闭按钮、内容区和操作区保持固定结构。
- 弹窗内容最大高度不能遮蔽窗口操作；窄窗口要能滚动。

### Icon

- 图标统一使用 WinUI 3 `SymbolIcon`、`FontIcon` 或项目资源图标。
- 纯图标按钮必须设置 `AutomationProperties.Name` 或 `ToolTipService.ToolTip`。
- 图标尺寸和描边要跟邻近控件一致，不用字符画或临时 SVG。

## 任务状态

任务状态统一使用以下语义：

| 状态 | 语义 | 必须展示 |
| --- | --- | --- |
| `idle` | 未启动 | 当前配置和启动入口 |
| `running` | 运行中 | 当前进度、停止入口 |
| `busy` | 操作处理中 | 正在处理的动作、禁用重复操作 |
| `success` | 成功 | 结果、完成时间 |
| `warning` | 需要注意 | 原因、下一步 |
| `error` | 失败 | 错误原因、重试或退出入口 |

进度条旁必须有数字或文字结果。状态卡不能只展示一条颜色线。

## 动效

- 控件反馈时长 `140–220ms`。
- 页面切换时长 `200–280ms`。
- 窗口退场约 `160ms`。
- 进入使用缓出，退出使用缓入，禁止线性缓动。
- 动画只使用 WinUI `ThemeTransition` 或 Composition 的位移、透明度和颜色变化，不改变布局尺寸。
- 下拉、弹窗、日期选择器和提示条按 WinUI 3 默认过渡显示；隐藏时用 `Visibility="Collapsed"`，不留空白区域。
- 遵循系统动画效果和辅助功能设置，减少位移、缩放、旋转和等待。

## 可访问性

- 所有可交互元素支持键盘操作。
- 保留 WinUI 的焦点可视化，不直接移除焦点反馈。
- 鼠标和键盘操作都不应破坏系统焦点行为。
- 正常文字对比度至少 4.5:1，大文字至少 3:1。
- 交互区域不小于 32px，文字不能被裁切。
- 错误、成功和登录失效提示使用 `AutomationProperties.LiveSetting`。
- 不把颜色作为唯一状态信号。
- 深色模式、窄窗口和 DPI 缩放属于同一个验收范围。

## 实施约束

- 页面编排放在 `desktop/native/SurveyController.App/Views/`。
- 可复用原生控件优先使用 WinUI 3 内置控件和 Windows App SDK 资源。
- 原生服务调用走 `desktop/native/SurveyController.App/Services/`。
- Go 后端通过匿名管道 JSON RPC 与原生壳通信。
- UI 只负责展示、交互和编排。网络、文件 IO、代理验活和问卷运行走服务层。
- 业务组件不得直接写十六进制颜色、新字体、新圆角或新阴影体系。
- 新增页面或控件前先检查 `Views/`、`Services/` 和 `App.xaml` 的现有实现，能组合就不平行造轮子。
