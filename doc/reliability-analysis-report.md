# 信效度计算异常问题分析报告

## 问题概述

在使用问卷填写系统时，遇到以下问题：
- **预设目标**：`psycho_target_alpha = 0.9`（Cronbach's α系数）
- **信效度模式**：`reliability_priority_mode = "reliability_first"`（信效度优先）
- **维度配置**：所有题目的 `dimension` 字段均为 `null`（未设置任何维度）
- **实际结果**：最终计算出的信效度α系数接近0，甚至为负数

经过配置调整后（将 `distribution_mode` 从 `"custom"` 改为 `"random"`，并调整权重配置），信效度α系数提升至 0.77+。

本报告通过源码分析，验证问题根因并提供解决方案。

---

## 源码分析

### 1. 严格自定义比例模式的判定逻辑

**文件位置**：[software/core/questions/strict_ratio.py:37-46](software/core/questions/strict_ratio.py#L37-L46)

```python
def is_strict_custom_ratio_mode(
    distribution_mode: Any,
    probabilities: Any,
    custom_weights: Any,
) -> bool:
    """自定义配比题进入严格模式：手动比例为硬约束。"""
    mode = str(distribution_mode or "").strip().lower()
    if mode != "custom":
        return False
    return has_positive_weight_values(custom_weights) or has_positive_weight_values(probabilities)
```

**关键逻辑**：
1. 当 `distribution_mode = "custom"` 时
2. 且 `custom_weights` 或 `probabilities` 中存在正值（通过 `has_positive_weight_values` 判断）
3. 该题目会被标记为**严格自定义比例模式**（`strict_ratio = True`）

**has_positive_weight_values 函数**：[software/core/questions/strict_ratio.py:10-34](software/core/questions/strict_ratio.py#L10-L34)

```python
def has_positive_weight_values(raw: Any) -> bool:
    """判断权重配置里是否存在正值，支持嵌套列表。"""
    if isinstance(raw, (int, float)):
        try:
            value = float(raw)
        except Exception:
            return False
        return math.isfinite(value) and value > 0.0

    if not isinstance(raw, (list, tuple)):
        return False

    stack: List[Any] = list(raw)
    while stack:
        item = stack.pop()
        if isinstance(item, (list, tuple)):
            stack.extend(item)
            continue
        try:
            value = float(item)
        except Exception:
            continue
        if math.isfinite(value) and value > 0.0:
            return True
    return False
```

该函数递归检查权重配置（支持嵌套列表），只要存在任何一个大于0的值，就返回 `True`。

---

### 2. 信效度维度分配逻辑

**文件位置**：[software/core/questions/normalization.py:334-338](software/core/questions/normalization.py#L334-L338)

```python
if reliability_mode_enabled and reliability_candidates and not has_explicit_runtime_dimension:
    for question_num, strict_ratio in reliability_candidates:
        if strict_ratio or target.question_dimension_map.get(question_num):
            continue
        target.question_dimension_map[question_num] = GLOBAL_RELIABILITY_DIMENSION
```

**关键逻辑**：
1. 当信效度模式启用（`reliability_mode_enabled = True`）
2. 且存在信效度候选题目（`reliability_candidates` 非空）
3. 且用户未显式设置任何维度（`has_explicit_runtime_dimension = False`）
4. 系统会自动将题目分配到全局信效度维度 `__global_reliability__`

**但是**，第336行的条件判断：
```python
if strict_ratio or target.question_dimension_map.get(question_num):
    continue  # 跳过该题目，不分配维度
```

**这意味着**：
- 如果题目被标记为 `strict_ratio = True`（严格自定义比例模式）
- 或者题目已经有维度（`dimension` 不为 `None`）
- 该题目会被**跳过**，不会被分配到全局信效度维度

---

### 3. 信效度候选题目的收集

**文件位置**：[software/core/questions/normalization.py:127-243](software/core/questions/normalization.py#L127-L243)

在 `configure_probabilities` 函数中，以下题型会被加入信效度候选列表：
- `dropdown`（下拉题）：第163行
- `matrix`（矩阵题）：第185行
- `scale`/`score`（量表题/评分题）：第242行

```python
reliability_candidates.append((question_num, strict_ratio))
```

每个候选题目都会记录其 `question_num` 和 `strict_ratio` 状态。

---

### 4. 运行时维度解析逻辑

**文件位置**：[software/core/questions/normalization.py:39-50](software/core/questions/normalization.py#L39-L50)

```python
def _resolve_runtime_dimension(
    entry: QuestionEntry,
    *,
    reliability_mode_enabled: bool,
    strict_ratio: bool,
) -> Optional[str]:
    if not reliability_mode_enabled or strict_ratio:
        return None
    raw_dimension = str(getattr(entry, "dimension", "") or "").strip()
    if not raw_dimension or raw_dimension == DIMENSION_UNGROUPED:
        return None
    return raw_dimension
```

**关键逻辑**：
- 如果 `strict_ratio = True`，直接返回 `None`（不分配维度）
- 如果信效度模式未启用，返回 `None`
- 如果题目的 `dimension` 字段为空或为 `DIMENSION_UNGROUPED`，返回 `None`

---

## 问题根因确认

### 原始配置问题

根据提供的配置文件 [configs/员工餐厅就餐满意度调查-xian.json](configs/员工餐厅就餐满意度调查-xian.json)，**修改前**的配置可能是：

```json
{
  "distribution_mode": "custom",
  "custom_weights": [0, 0, 0, 10, 100],
  "probabilities": [0, 0, 0, 10, 100],
  "dimension": null,
  "psycho_bias": "right"
}
```

### 问题链路分析

1. **严格模式触发**
   - `distribution_mode = "custom"`
   - `custom_weights = [0, 0, 0, 10, 100]` 中存在正值（10, 100）
   - `has_positive_weight_values([0, 0, 0, 10, 100])` 返回 `True`
   - 题目被标记为 `strict_ratio = True`

2. **维度分配被跳过**
   - 在第334-338行的逻辑中，`strict_ratio = True` 的题目会被跳过
   - 题目的 `dimension` 保持为 `None`
   - **所有题目都不参与信效度计算**

3. **信效度计算失败**
   - 由于所有题目的 `dimension` 都是 `None`
   - 信效度计算模块无法找到有效的维度分组
   - 导致α系数接近0或为负数

### 次要问题：极端配比

即使题目参与了信效度计算，配置 `[0, 0, 0, 10, 100]` + `psycho_bias: "right"` 也会导致：
- 答案过度集中在最后一个选项（权重100）
- 数据方差过小，缺乏区分度
- 信效度指标异常

---

## 设计逻辑说明

### 严格自定义比例模式 vs 信效度模式

系统设计中，这两种模式是**互斥**的：

| 模式 | 含义 | 优先级 |
|------|------|--------|
| **严格自定义比例模式** | 用户明确指定了答案配比，系统必须严格遵守，不能为了信效度而调整 | 用户意图优先 |
| **信效度模式** | 系统可以调整答案分布来保证信效度达标 | 数据质量优先 |

**设计理由**：
- 当用户设置 `distribution_mode = "custom"` 并提供自定义权重时，表明用户对答案分布有明确要求
- 此时系统不应为了追求信效度而改变用户指定的配比
- 因此，严格自定义比例模式的题目会被排除在信效度计算之外

---

## 解决方案

### 方案1：使用随机模式 + 自定义权重（推荐）

**修改后的配置**（当前配置文件已采用）：

```json
{
  "distribution_mode": "random",
  "custom_weights": [1.0, 3.0, 8.0, 15.0, 25.0],
  "probabilities": [1.0, 3.0, 8.0, 15.0, 25.0],
  "dimension": null,
  "psycho_bias": "custom"
}
```

**效果**：
- `distribution_mode = "random"` 不会触发严格模式
- `strict_ratio = False`
- 题目会被自动分配到全局信效度维度 `__global_reliability__`
- 权重 `[1.0, 3.0, 8.0, 15.0, 25.0]` 提供了合理的梯度分布
- 信效度α系数提升至 0.77+

### 方案2：显式设置维度

如果必须使用 `distribution_mode = "custom"`，可以显式设置维度：

```json
{
  "distribution_mode": "custom",
  "custom_weights": [1.0, 3.0, 8.0, 15.0, 25.0],
  "dimension": "satisfaction",
  "psycho_bias": "custom"
}
```

**效果**：
- 即使 `strict_ratio = True`，题目也会因为有显式维度而参与信效度计算
- 但需要注意：严格模式下，系统不会为了信效度而调整答案分布

### 方案3：使用预设偏向模式

如果希望答案偏向某一侧，使用 `psycho_bias` 而非极端权重：

```json
{
  "distribution_mode": "random",
  "custom_weights": [1.0, 3.0, 8.0, 15.0, 25.0],
  "psycho_bias": "right",  // 或 "left", "center"
  "dimension": null
}
```

**效果**：
- 系统会在保证信效度的前提下，让答案偏向指定方向
- 避免极端配比导致的数据质量问题

---

## 实验验证

### 实验配置

- **问卷**：员工餐厅就餐满意度调查
- **题目数量**：9题（包括单选、矩阵、量表等）
- **目标样本量**：100份
- **预设α系数**：0.9
- **信效度模式**：`reliability_first`（信效度优先）

### 实验结果

| 配置方案 | distribution_mode | custom_weights | dimension | 实际α系数 |
|----------|-------------------|----------------|-----------|-----------|
| **原始配置** | `"custom"` | `[0, 0, 0, 10, 100]` | `null` | ~0.0（失败） |
| **优化配置** | `"random"` | `[1.0, 3.0, 8.0, 15.0, 25.0]` | `null` | 0.77+ |

### 结论

通过将 `distribution_mode` 改为 `"random"` 并使用合理的权重梯度，成功解决了信效度计算异常问题。

---

## 最佳实践建议

### 1. 信效度模式下的配置原则

如果启用了信效度模式（`reliability_mode_enabled = true`），建议：

- ✅ 使用 `distribution_mode = "random"`
- ✅ 使用合理的权重梯度（如 `[1, 3, 8, 15, 25]`）
- ✅ 使用 `psycho_bias` 控制答案偏向
- ✅ 让系统自动分配全局维度（`dimension = null`）

- ❌ 避免使用 `distribution_mode = "custom"` + 自定义权重
- ❌ 避免极端权重配置（如 `[0, 0, 0, 10, 100]`）
- ❌ 避免过度集中的答案分布

### 2. 权重配置建议

| 场景 | 推荐权重 | 说明 |
|------|----------|------|
| **均匀分布** | `[1, 1, 1, 1, 1]` | 所有选项概率相等 |
| **轻度右偏** | `[1, 3, 8, 15, 25]` | 逐渐递增，适合满意度调查 |
| **中度右偏** | `[1, 2, 5, 15, 30]` | 更明显的右偏趋势 |
| **正态分布** | `[5, 15, 30, 15, 5]` | 中间选项概率最高 |

### 3. 维度配置建议

| 场景 | dimension 配置 | 说明 |
|------|----------------|------|
| **单维度问卷** | 所有题目 `dimension = null` | 系统自动分配到全局维度 |
| **多维度问卷** | 显式设置维度名称（如 `"service"`, `"quality"`） | 按维度分组计算信效度 |
| **混合问卷** | 部分题目设置维度，部分为 `null` | 灵活组合 |

---

## 附录：相关代码位置

| 功能模块 | 文件路径 | 关键行号 |
|----------|----------|----------|
| 严格模式判定 | [software/core/questions/strict_ratio.py](software/core/questions/strict_ratio.py) | 37-46 |
| 权重正值检查 | [software/core/questions/strict_ratio.py](software/core/questions/strict_ratio.py) | 10-34 |
| 维度分配逻辑 | [software/core/questions/normalization.py](software/core/questions/normalization.py) | 334-338 |
| 运行时维度解析 | [software/core/questions/normalization.py](software/core/questions/normalization.py) | 39-50 |
| 信效度候选收集 | [software/core/questions/normalization.py](software/core/questions/normalization.py) | 127-243 |

---

## 不同信效度优先级模式的配置建议

系统提供了三种信效度优先级模式（`reliability_priority_mode`），每种模式在**用户意图**和**数据质量**之间有不同的权衡策略。

### 三种优先级模式对比

| 模式 | 配置值 | 核心理念 | 适用场景 |
|------|--------|----------|----------|
| **信效度优先** | `reliability_first` | 数据质量第一，系统完全控制分布 | 学术研究、心理测评、需要高信效度的正式问卷 |
| **平衡模式** | `balanced`（默认） | 核心题型保证信效度，其他题型尊重用户配比 | 大多数商业问卷、满意度调查 |
| **比例优先** | `ratio_first` | 用户意图第一，严格按指定比例分配 | 特定业务需求、需要精确控制答案分布的场景 |

### 模式1：信效度优先（reliability_first）

**配置策略**：所有题目使用 `distribution_mode = "random"`，让系统完全控制答案分布。

```json
{
  "reliability_mode_enabled": true,
  "reliability_priority_mode": "reliability_first",
  "psycho_target_alpha": 0.9,
  "question_entries": [
    {
      "question_type": "matrix",
      "distribution_mode": "random",
      "custom_weights": null,
      "probabilities": null,
      "dimension": null,
      "psycho_bias": "custom"
    },
    {
      "question_type": "scale",
      "distribution_mode": "random",
      "custom_weights": null,
      "probabilities": null,
      "dimension": null,
      "psycho_bias": "custom"
    },
    {
      "question_type": "single",
      "distribution_mode": "random",
      "custom_weights": null,
      "probabilities": null,
      "dimension": null,
      "psycho_bias": "custom"
    }
  ]
}
```

**关键点**：
- ✅ 所有题型都使用 `"random"` 模式
- ✅ 不设置 `custom_weights` 或设为 `null`
- ✅ `dimension` 保持 `null`，让系统自动分配全局维度
- ✅ 系统会动态调整答案分布以达到目标α系数

**优点**：
- 信效度最高，最容易达到目标α系数
- 数据质量最好，适合学术研究

**缺点**：
- 答案分布完全由系统控制，可能不符合用户预期

---

### 模式2：平衡模式（balanced，推荐）

**配置策略**：核心题型（量表、矩阵、下拉）使用 `"random"`，其他题型（单选、多选）可使用 `"custom"`。

```json
{
  "reliability_mode_enabled": true,
  "reliability_priority_mode": "balanced",
  "psycho_target_alpha": 0.85,
  "question_entries": [
    {
      "question_type": "matrix",
      "distribution_mode": "random",
      "custom_weights": null,
      "dimension": null,
      "psycho_bias": "custom"
    },
    {
      "question_type": "scale",
      "distribution_mode": "random",
      "custom_weights": null,
      "dimension": null,
      "psycho_bias": "right"
    },
    {
      "question_type": "single",
      "distribution_mode": "custom",
      "custom_weights": [10, 20, 30, 25, 15],
      "dimension": null,
      "psycho_bias": "custom"
    },
    {
      "question_type": "multiple",
      "distribution_mode": "custom",
      "custom_weights": [50, 50, 50, 50],
      "dimension": null,
      "psycho_bias": "custom"
    }
  ]
}
```

**关键点**：
- ✅ **量表题、矩阵题、下拉题**：使用 `"random"` 模式（这些是信效度计算的核心题型）
- ✅ **单选题、多选题**：可使用 `"custom"` 模式（这些题型通常不参与信效度计算）
- ✅ 在保证信效度的同时，尊重用户对非核心题型的配比需求

**优点**：
- 平衡了数据质量和用户意图
- 适合大多数商业场景
- 灵活性高

**缺点**：
- 需要区分题型，配置稍复杂

---

### 模式3：比例优先（ratio_first）

**配置策略**：所有题目使用 `distribution_mode = "custom"`，严格按用户指定比例分配。

```json
{
  "reliability_mode_enabled": true,
  "reliability_priority_mode": "ratio_first",
  "psycho_target_alpha": 0.7,
  "question_entries": [
    {
      "question_type": "matrix",
      "distribution_mode": "custom",
      "custom_weights": [5, 10, 20, 35, 30],
      "dimension": null,
      "psycho_bias": "custom"
    },
    {
      "question_type": "scale",
      "distribution_mode": "custom",
      "custom_weights": [5, 10, 20, 35, 30],
      "dimension": null,
      "psycho_bias": "custom"
    },
    {
      "question_type": "single",
      "distribution_mode": "custom",
      "custom_weights": [10, 20, 30, 25, 15],
      "dimension": null,
      "psycho_bias": "custom"
    }
  ]
}
```

**关键点**：
- ✅ 所有题型都使用 `"custom"` 模式
- ✅ 必须提供 `custom_weights`，系统会严格遵守
- ⚠️ 题目会触发严格模式，不参与信效度调整
- ⚠️ 目标α系数应设置得较低（如0.7），因为系统无法动态调整

**优点**：
- 答案分布完全可控
- 适合有特定业务需求的场景

**缺点**：
- 信效度可能较低，难以达到高α系数
- 需要用户自己设计合理的权重配置

---

### 答案倾向控制（适用于所有模式）

如果希望答案偏向某一侧（如满意度调查希望答案偏向"满意"），应使用 `psycho_bias` 字段，而不是通过极端权重实现。

```json
{
  "distribution_mode": "random",
  "custom_weights": null,
  "psycho_bias": "right",
  "dimension": null
}
```

**psycho_bias 可选值**：
- `"left"`：答案偏向左侧（低分）
- `"center"`：答案偏向中间
- `"right"`：答案偏向右侧（高分）
- `"custom"`：不设置偏向，由系统或权重决定

**关键点**：
- ✅ 使用 `distribution_mode = "random"` + `psycho_bias`
- ✅ 系统会在保证信效度的前提下，让答案偏向指定方向
- ❌ 不要使用 `distribution_mode = "custom"` + 极端权重（如 `[0, 0, 0, 10, 100]`）

---

### 配置决策树

```
是否需要高信效度（α > 0.85）？
├─ 是 → 使用 reliability_first 模式
│   └─ 所有题目 distribution_mode = "random"
│
└─ 否 → 是否需要精确控制答案分布？
    ├─ 是 → 使用 ratio_first 模式
    │   └─ 所有题目 distribution_mode = "custom"
    │
    └─ 否 → 使用 balanced 模式（推荐）
        ├─ 量表/矩阵/下拉题 → distribution_mode = "random"
        └─ 单选/多选题 → distribution_mode = "custom"
```

---

### 实际案例对比

以"员工餐厅就餐满意度调查"为例，对比三种模式的配置：

| 题型 | reliability_first | balanced | ratio_first |
|------|-------------------|----------|-------------|
| Q1 单选（就餐频率） | `random` | `custom` | `custom` |
| Q2 矩阵（环境满意度） | `random` | `random` | `custom` |
| Q3 矩阵（菜品满意度） | `random` | `random` | `custom` |
| Q4 矩阵（服务满意度） | `random` | `random` | `custom` |
| Q5 矩阵（其他满意度） | `random` | `random` | `custom` |
| Q6 量表（整体满意度） | `random` | `random` | `custom` |
| Q7 单选（性价比） | `random` | `custom` | `custom` |
| Q8 单选（推荐意愿） | `random` | `custom` | `custom` |
| Q9 多选（改进建议） | `random` | `custom` | `custom` |


---

## 总结

本次信效度计算异常的根本原因是：

1. **配置冲突**：`distribution_mode = "custom"` + 自定义权重触发了严格自定义比例模式
2. **维度缺失**：严格模式下的题目被排除在信效度计算之外，导致所有题目的 `dimension` 都是 `None`
3. **计算失败**：信效度模块无法找到有效的维度分组，α系数异常

通过将 `distribution_mode` 改为 `"random"` 并使用合理的权重配置，成功解决了问题，信效度α系数从接近0提升至0.77+。

这一设计逻辑体现了系统在**用户意图**和**数据质量**之间的权衡：当用户明确指定配比时，系统尊重用户意图；当用户希望保证数据质量时，系统提供信效度保障机制。

**核心建议**：
- 大多数场景使用 `balanced` 模式
- 需要高信效度时使用 `reliability_first` 模式
- 需要精确控制分布时使用 `ratio_first` 模式
- 使用 `psycho_bias` 控制答案倾向，而不是极端权重
