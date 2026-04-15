# 心理测量模式优化分析报告

## 修改概述

在 `software/core/questions/tendency.py` 的 `get_tendency_index` 函数中，针对 `reliability_first` 模式下的心理测量计划答案处理逻辑进行了优化。

### 修改位置

**文件**：[software/core/questions/tendency.py:198-217](software/core/questions/tendency.py#L198-L217)

### 修改前的代码

```python
# 传入心理测量计划时，优先按计划取答案
if psycho_plan is not None and question_index is not None:
    choice = _get_psychometric_answer(psycho_plan, question_index, row_index, option_count)
    if choice is not None:
        blended_choice = _blend_psychometric_choice(
            choice,
            option_count,
            probabilities,
            priority_mode=priority_mode,
        )
        return _finalize_choice(blended_choice, anchor=choice)
    # 计划未命中时，回退到常规倾向逻辑
    logging.info(
        "心理测量计划未命中答案（题%d 行%s），回退到常规倾向逻辑",
        question_index, row_index
    )
```

### 修改后的代码

```python
# 传入心理测量计划时，优先按计划取答案
if psycho_plan is not None and question_index is not None:
    choice = _get_psychometric_answer(psycho_plan, question_index, row_index, option_count)
    if choice is not None:
        # ------------- reliability_first 模式：直接返回锚点，仅做零权重保护 ------------------
        logging.info(f"priority_mode:{priority_mode}")
        if priority_mode == "reliability_first":
            return _finalize_choice(choice, anchor=choice)
        # 其他模式：现有混合逻辑
        else:
            blended_choice = _blend_psychometric_choice(
                choice,
                option_count,
                probabilities,
                priority_mode=priority_mode,
            )
            return _finalize_choice(blended_choice, anchor=choice)
    # 计划未命中时，回退到常规倾向逻辑
    logging.info(
        "心理测量计划未命中答案（题%d 行%s），回退到常规倾向逻辑",
        question_index, row_index
    )
```

---

## 修改内容分析

### 核心变化

在心理测量计划（`psycho_plan`）命中答案后，根据 `priority_mode` 采取不同的处理策略：

1. **reliability_first 模式**：直接返回心理测量计划的锚点答案，跳过混合逻辑
2. **其他模式（balanced、ratio_first）**：保持原有的混合逻辑，通过 `_blend_psychometric_choice` 进行答案混合

### 关键函数说明

#### _blend_psychometric_choice 函数

**位置**：[software/core/questions/tendency.py:136-173](software/core/questions/tendency.py#L136-L173)

```python
def _blend_psychometric_choice(
    anchor_index: int,
    option_count: int,
    probabilities: Union[List[float], int, None],
    priority_mode: Optional[str] = None,
) -> int:
    """将心理测量锚点与用户配置的概率分布混合"""
```

**功能**：
- 以心理测量计划的答案（`anchor_index`）为中心
- 在一定波动窗口内，结合用户配置的 `probabilities` 权重
- 通过距离衰减函数调整概率分布
- 最终返回一个在锚点附近波动的答案

**混合策略**：
- 窗口内的选项：`weight * _window_decay(distance, fluctuation_window)`
- 窗口外的选项：`weight * (consistency_outside_decay * 0.5)`

---

## 修改合理性分析

### 1. 设计理念的一致性

这个修改与三种优先级模式的设计理念完全一致：

| 模式 | 核心理念 | 心理测量答案处理 |
|------|----------|------------------|
| **reliability_first** | 数据质量第一，系统完全控制 | 直接使用心理测量计划的答案，不混合用户权重 |
| **balanced** | 平衡数据质量和用户意图 | 在锚点附近混合用户权重，适度波动 |
| **ratio_first** | 用户意图第一，尊重配比 | 在锚点附近混合用户权重，较大波动 |

### 2. 信效度保障的强化

**reliability_first 模式的目标**：达到最高的信效度（α系数）

**修改前的问题**：
- 即使在 `reliability_first` 模式下，心理测量计划的答案仍会被 `_blend_psychometric_choice` 混合
- 混合过程会引入用户配置的 `probabilities` 权重，导致答案偏离心理测量计划
- 这种偏离会降低信效度，与 `reliability_first` 的设计目标矛盾

**修改后的改进**：
- `reliability_first` 模式下，直接使用心理测量计划的答案
- 心理测量计划是基于潜变量模型（Latent Variable Model）生成的，内部一致性最高
- 避免混合逻辑引入的随机性，最大化信效度

### 3. 零权重保护的保留

无论哪种模式，都会调用 `_finalize_choice(choice, anchor=choice)`，确保：
- 如果选中的选项权重为 0，会自动切换到最近的非零权重选项
- 这是一个硬约束，防止违反用户的"禁选"配置

---

## 优点分析

### 1. 信效度提升

**理论依据**：
- 心理测量计划基于潜变量模型，答案之间的相关性是精心设计的
- 直接使用计划答案，可以保证最高的内部一致性（Cronbach's α）

**预期效果**：
- `reliability_first` 模式下，α系数可能从 0.85-0.90 提升至 0.90-0.95
- 特别是在多维度问卷中，维度内的一致性会显著提高

### 2. 模式语义清晰

**修改前**：
- 三种模式在心理测量答案处理上没有区别，都使用混合逻辑
- `reliability_first` 的"信效度优先"语义不够明确

**修改后**：
- `reliability_first`：完全信任心理测量计划，不混合
- `balanced` / `ratio_first`：在锚点附近混合，保留一定随机性
- 三种模式的差异更加明显，用户选择更有针对性

### 3. 性能优化

**计算复杂度降低**：
- `reliability_first` 模式下，跳过了 `_blend_psychometric_choice` 的复杂计算
- 包括：波动窗口计算、距离衰减、概率调整、加权抽样等
- 在大规模问卷填写时（如1000份问卷），性能提升明显

**估算**：
- 假设每份问卷有 20 个量表题，每题 5 行（矩阵题）
- 每份问卷节省 100 次 `_blend_psychometric_choice` 调用
- 1000 份问卷节省 100,000 次函数调用

### 4. 日志可追溯性

新增了日志输出：
```python
logging.info(f"priority_mode:{priority_mode}")
```

**好处**：
- 可以在日志中清晰看到当前使用的优先级模式
- 便于调试和问题排查
- 可以统计不同模式的使用频率

---

## 缺点分析

### 1. 答案分布的可控性降低

**问题描述**：
- 在 `reliability_first` 模式下，用户配置的 `probabilities` 权重完全失效（除了零权重保护）
- 答案分布完全由心理测量计划决定，用户无法通过权重调整

**影响场景**：
- 如果用户希望在保证高信效度的同时，让答案偏向某一侧（如满意度调查偏向"满意"）
- `reliability_first` 模式下无法实现这种需求

**缓解方案**：
- 用户可以使用 `psycho_bias` 字段（`"left"`, `"center"`, `"right"`）来影响心理测量计划的生成
- 或者选择 `balanced` 模式，在信效度和可控性之间取得平衡

### 2. 模式切换的行为差异较大

**问题描述**：
- `reliability_first` 和 `balanced` 在心理测量答案处理上的差异很大
- 从 `reliability_first` 切换到 `balanced`，答案分布可能发生显著变化

**影响场景**：
- 用户在测试不同模式时，可能会对结果差异感到困惑
- 需要在文档中明确说明这种差异

**缓解方案**：
- 在配置文档中清晰说明三种模式的差异
- 提供模式选择的决策树，帮助用户选择合适的模式

### 3. 代码分支增加

**问题描述**：
- 新增了 `if priority_mode == "reliability_first"` 分支
- 增加了代码复杂度，需要维护两套逻辑

**影响**：
- 代码可读性略有下降
- 未来修改时需要同时考虑两个分支

**缓解方案**：
- 通过清晰的注释说明两个分支的差异
- 在单元测试中覆盖两种情况

### 4. 零权重保护的局限性

**问题描述**：
- 零权重保护只能保证"不选择权重为 0 的选项"
- 但如果心理测量计划的答案落在权重为 0 的选项上，会被强制切换到最近的非零选项
- 这种切换可能会破坏心理测量计划的内部一致性

**示例**：
```python
# 心理测量计划返回：选项 2（索引从 0 开始）
choice = 2

# 用户配置：选项 2 的权重为 0
probabilities = [10, 20, 0, 30, 40]

# 零权重保护会将答案切换到选项 1 或 3（最近的非零选项）
# 这可能破坏心理测量计划的设计
```

**影响**：
- 在极端配置下（如大量选项权重为 0），信效度可能不如预期

**缓解方案**：
- 在文档中建议用户避免在 `reliability_first` 模式下使用零权重配置
- 或者在心理测量计划生成时，就考虑用户的零权重配置

---

## 与信效度优先级模式的关系

### 三种模式的参数对比

根据 [software/core/questions/reliability_mode.py](software/core/questions/reliability_mode.py#L35-L72)：

| 参数 | reliability_first | balanced | ratio_first | 说明 |
|------|-------------------|----------|-------------|------|
| `consistency_window_ratio` | 0.24 | 0.18 | 0.12 | 波动窗口占选项数的比例 |
| `consistency_window_max` | 10 | 8 | 6 | 波动窗口的最大值 |
| `consistency_center_weight` | 2.1 | 1.8 | 1.55 | 中心点（锚点）的权重 |
| `consistency_edge_weight` | 0.92 | 0.86 | 0.82 | 窗口边缘的权重 |
| `consistency_outside_decay` | 0.01 | 0.02 | 0.04 | 窗口外的衰减系数 |

### 修改对各模式的影响

#### reliability_first 模式

**修改前**：
- 使用最小的波动窗口（24%）
- 最高的中心权重（2.1）
- 最低的窗口外衰减（0.01）
- 但仍然会在锚点附近波动

**修改后**：
- 完全跳过波动逻辑
- 直接返回锚点答案
- 信效度最高，可控性最低

#### balanced 模式

**不受影响**：
- 仍然使用混合逻辑
- 中等的波动窗口（18%）
- 在信效度和可控性之间平衡

#### ratio_first 模式

**不受影响**：
- 仍然使用混合逻辑
- 最大的波动窗口（12%）
- 最尊重用户配置的权重

---

## 实际应用建议

### 1. 何时使用 reliability_first 模式

**推荐场景**：
- 学术研究、心理测评、需要发表论文的问卷
- 对信效度有严格要求（α > 0.90）
- 不关心答案分布的具体形态

**配置示例**：
```json
{
  "reliability_mode_enabled": true,
  "reliability_priority_mode": "reliability_first",
  "psycho_target_alpha": 0.95,
  "question_entries": [
    {
      "question_type": "matrix",
      "distribution_mode": "random",
      "custom_weights": null,
      "dimension": null,
      "psycho_bias": "custom"
    }
  ]
}
```

**注意事项**：
- 不要设置 `custom_weights`，让系统完全控制
- 不要使用零权重配置（权重为 0 的选项）
- 使用 `psycho_bias` 而非 `custom_weights` 来控制倾向

### 2. 何时使用 balanced 模式

**推荐场景**：
- 大多数商业问卷、满意度调查
- 需要在信效度和答案分布之间平衡
- 希望保留一定的答案可控性

**配置示例**：
```json
{
  "reliability_mode_enabled": true,
  "reliability_priority_mode": "balanced",
  "psycho_target_alpha": 0.85,
  "question_entries": [
    {
      "question_type": "matrix",
      "distribution_mode": "random",
      "custom_weights": [1.0, 3.0, 8.0, 15.0, 25.0],
      "dimension": null,
      "psycho_bias": "right"
    }
  ]
}
```

**注意事项**：
- 可以设置 `custom_weights`，系统会在锚点附近混合
- 适合大多数场景，是默认推荐模式

### 3. 何时使用 ratio_first 模式

**推荐场景**：
- 需要精确控制答案分布
- 有特定业务需求（如模拟真实用户行为）
- 信效度要求不高（α > 0.70 即可）

**配置示例**：
```json
{
  "reliability_mode_enabled": true,
  "reliability_priority_mode": "ratio_first",
  "psycho_target_alpha": 0.75,
  "question_entries": [
    {
      "question_type": "matrix",
      "distribution_mode": "custom",
      "custom_weights": [5, 10, 20, 35, 30],
      "dimension": null,
      "psycho_bias": "custom"
    }
  ]
}
```

**注意事项**：
- 必须设置 `custom_weights`，系统会尽量遵守
- 信效度可能较低，需要权衡

---

## 测试建议

### 1. 单元测试

**测试用例**：
```python
def test_reliability_first_no_blend():
    """测试 reliability_first 模式下不进行混合"""
    # 模拟心理测量计划返回选项 3
    mock_plan = MockPsychoPlan(choice=3)
    
    # 用户配置权重偏向选项 0
    probabilities = [100, 10, 5, 1, 1]
    
    # reliability_first 模式应该返回 3，而不是 0
    result = get_tendency_index(
        option_count=5,
        probabilities=probabilities,
        psycho_plan=mock_plan,
        question_index=1,
        priority_mode="reliability_first"
    )
    
    assert result == 3, "reliability_first 应该直接返回心理测量计划的答案"

def test_balanced_with_blend():
    """测试 balanced 模式下进行混合"""
    mock_plan = MockPsychoPlan(choice=3)
    probabilities = [100, 10, 5, 1, 1]
    
    # balanced 模式应该在 3 附近波动，可能返回 2, 3, 4
    results = []
    for _ in range(100):
        result = get_tendency_index(
            option_count=5,
            probabilities=probabilities,
            psycho_plan=mock_plan,
            question_index=1,
            priority_mode="balanced"
        )
        results.append(result)
    
    # 应该有一定的分布，不是全部返回 3
    assert len(set(results)) > 1, "balanced 应该有波动"
    assert 3 in results, "锚点 3 应该出现"
```

### 2. 集成测试

**测试场景**：
- 生成 100 份问卷，对比三种模式的信效度
- 验证 `reliability_first` 的 α 系数是否最高
- 验证 `ratio_first` 的答案分布是否最接近用户配置

### 3. 性能测试

**测试指标**：
- 对比修改前后 `reliability_first` 模式的执行时间
- 预期：修改后应该更快（跳过了混合逻辑）

---

## 总结

### 修改的核心价值

1. **强化了 reliability_first 模式的语义**：真正做到"信效度优先"，不受用户权重干扰
2. **提升了信效度上限**：在 `reliability_first` 模式下，α 系数可能提升 5-10%
3. **优化了性能**：跳过混合逻辑，减少计算开销
4. **保持了向后兼容**：其他模式的行为不变

### 权衡与取舍

| 方面 | 优点 | 缺点 |
|------|------|------|
| **信效度** | ✅ reliability_first 模式下信效度最高 | ❌ 答案分布完全不可控 |
| **可控性** | ✅ balanced/ratio_first 保持可控 | ❌ reliability_first 失去可控性 |
| **性能** | ✅ reliability_first 性能提升 | ❌ 代码分支增加 |
| **语义** | ✅ 三种模式差异更明显 | ❌ 模式切换行为差异大 |

### 最终建议

这是一个**合理且必要**的优化：

1. **符合设计理念**：`reliability_first` 应该完全信任心理测量计划
2. **解决实际问题**：修改前的混合逻辑会降低信效度，与模式目标矛盾
3. **影响可控**：只影响 `reliability_first` 模式，其他模式不变
4. **文档完善**：需要在用户文档中清晰说明三种模式的差异

**建议后续工作**：
1. 更新用户文档，说明 `reliability_first` 模式的新行为
2. 添加单元测试，覆盖三种模式的差异
3. 在配置界面中提示用户：`reliability_first` 模式下 `custom_weights` 不生效
4. 考虑在心理测量计划生成时，就考虑用户的零权重配置，避免冲突
