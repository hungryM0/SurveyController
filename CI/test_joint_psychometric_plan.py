"""联合信效度配额计划最小回归检查。"""

from __future__ import annotations

import random
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from software.core.psychometrics import (
    build_joint_psychometric_answer_plan,
    build_psychometric_plan,
    cronbach_alpha,
    infer_dimension_orientation,
    infer_reversed_keys,
)
from software.core.psychometrics.joint_optimizer import build_psychometric_blueprint
from software.core.questions.config import GLOBAL_RELIABILITY_DIMENSION, QuestionEntry, configure_probabilities
from software.core.task import ExecutionConfig, ExecutionState
from software.ui.pages.workbench.dashboard.parts.entries import question_summary
from software.ui.pages.workbench.question_editor.psycho_config import BIAS_PRESET_CHOICES
from software.ui.pages.workbench.strategy.utils import summarize_bias


def _largest_remainder_counts(values: List[float], sample_count: int) -> List[int]:
    cleaned = [max(0.0, float(value)) for value in values]
    total = sum(cleaned)
    if total <= 0.0:
        raise AssertionError("测试配置非法：所有权重均为 0")
    normalized = [value / total for value in cleaned]
    raw_targets = [value * sample_count for value in normalized]
    counts = [int(value) for value in raw_targets]
    remainders = [raw_targets[idx] - counts[idx] for idx in range(len(raw_targets))]
    missing = sample_count - sum(counts)
    ranked = sorted(range(len(normalized)), key=lambda idx: (remainders[idx], normalized[idx], -idx), reverse=True)
    for idx in ranked[:missing]:
        counts[idx] += 1
    return counts


def _build_execution_config(entries: List[QuestionEntry], *, target_num: int, target_alpha: float) -> ExecutionConfig:
    config = ExecutionConfig(target_num=target_num, psycho_target_alpha=target_alpha)
    configure_probabilities(entries, config, reliability_mode_enabled=True)
    for entry in entries:
        question_num = int(entry.question_num or 0)
        if question_num <= 0:
            continue
        option_count = int(entry.option_count or 0)
        if option_count <= 0 and isinstance(entry.custom_weights, list):
            if entry.question_type == "matrix" and entry.custom_weights and isinstance(entry.custom_weights[0], list):
                option_count = len(entry.custom_weights[0])
            else:
                option_count = len(entry.custom_weights)
        config.questions_metadata[question_num] = {
            "num": question_num,
            "type": entry.question_type,
            "options": option_count,
            "rows": int(getattr(entry, "rows", 1) or 1),
        }
    return config


def _assert_counts(plan: Any, choice_key: str, expected_counts: List[int]) -> None:
    actual_counts = [0] * len(expected_counts)
    for sample_choices in plan.answers_by_sample.values():
        choice = sample_choices.get(choice_key)
        if choice is None:
            continue
        actual_counts[int(choice)] += 1
    if actual_counts != expected_counts:
        raise AssertionError(f"{choice_key} 配额不匹配：期望 {expected_counts}，实际 {actual_counts}")


def _matrix_from_plan(
    plan: Any,
    keys: List[str],
    reversed_keys: set[str] | None = None,
    option_counts: Dict[str, int] | None = None,
) -> List[List[float]]:
    if reversed_keys is None:
        reversed_keys = set()
    if option_counts is None:
        option_counts = {}
    rows: List[List[float]] = []
    for sample_index in sorted(plan.answers_by_sample.keys()):
        sample_choices = plan.answers_by_sample[sample_index]
        row: List[float] = []
        for key in keys:
            choice = sample_choices[key]
            if key in reversed_keys:
                oc = option_counts.get(key, 5)
                row.append(float(oc - choice))
            else:
                row.append(float(choice + 1))
        rows.append(row)
    return rows


def _build_random_baseline(keys_to_counts: Dict[str, List[int]]) -> List[List[float]]:
    per_key_choices: Dict[str, List[int]] = {}
    for key, counts in keys_to_counts.items():
        expanded: List[int] = []
        for option_index, count in enumerate(counts):
            expanded.extend([option_index] * int(count))
        random.shuffle(expanded)
        per_key_choices[key] = expanded

    sample_count = len(next(iter(per_key_choices.values())))
    rows: List[List[float]] = []
    ordered_keys = list(keys_to_counts.keys())
    for sample_index in range(sample_count):
        rows.append([float(per_key_choices[key][sample_index] + 1) for key in ordered_keys])
    return rows


def _fallback_choice(question_biases: List[str], *, seed: int) -> Dict[str, int]:
    random.seed(seed)
    plan = build_psychometric_plan(
        [(idx + 1, "scale", 5, bias, None) for idx, bias in enumerate(question_biases)],
        target_alpha=0.8,
    )
    if plan is None:
        raise AssertionError("fallback 心理测量计划不应为空")
    return dict(plan.choices)


def _fallback_average_score(bias: str, *, seeds: range) -> float:
    total = 0.0
    count = 0
    for seed in seeds:
        choice_map = _fallback_choice([bias, bias], seed=seed)
        total += sum(float(choice + 1) for choice in choice_map.values())
        count += len(choice_map)
    if count <= 0:
        raise AssertionError("fallback 统计测试样本数不能为空")
    return total / count


def test_strict_ratio_question_keeps_reliability_dimension() -> None:
    entry = QuestionEntry(
        question_type="scale",
        probabilities=-1,
        custom_weights=[0, 0, 0, 0, 100],
        distribution_mode="custom",
        option_count=5,
        question_num=1,
    )
    config = ExecutionConfig(target_num=20)
    configure_probabilities([entry], config, reliability_mode_enabled=True)
    if not config.question_strict_ratio_map.get(1):
        raise AssertionError("第 1 题应该被识别为严格比例题")
    if config.question_dimension_map.get(1) != GLOBAL_RELIABILITY_DIMENSION:
        raise AssertionError("严格比例量表题不该再被踢出信效度维度")


def test_fallback_bias_presets_do_not_collapse_to_center() -> None:
    left_choices = _fallback_choice(["left", "left"], seed=20260417)
    center_choices = _fallback_choice(["center", "center"], seed=20260417)
    right_choices = _fallback_choice(["right", "right"], seed=20260417)
    if left_choices == center_choices:
        raise AssertionError("fallback 的 left 倾向不应再与 center 完全一致")
    if right_choices == center_choices:
        raise AssertionError("fallback 的 right 倾向不应再与 center 完全一致")


def test_fallback_bias_presets_shift_average_scores() -> None:
    seeds = range(20260417, 20260617)
    left_avg = _fallback_average_score("left", seeds=seeds)
    center_avg = _fallback_average_score("center", seeds=seeds)
    right_avg = _fallback_average_score("right", seeds=seeds)
    if not left_avg < center_avg:
        raise AssertionError(
            f"fallback 的 left 平均分应低于 center，实际 left={left_avg:.3f}, center={center_avg:.3f}"
        )
    if not right_avg > center_avg:
        raise AssertionError(
            f"fallback 的 right 平均分应高于 center，实际 right={right_avg:.3f}, center={center_avg:.3f}"
        )


def test_strength_based_anchor_beats_majority_count() -> None:
    entries = [
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[100, 0, 0, 0, 0],
            distribution_mode="custom",
            option_count=5,
            question_num=1,
            dimension="strength_anchor",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[10, 10, 30, 30, 20],
            distribution_mode="custom",
            option_count=5,
            question_num=2,
            dimension="strength_anchor",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[10, 10, 30, 30, 20],
            distribution_mode="custom",
            option_count=5,
            question_num=3,
            dimension="strength_anchor",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[10, 10, 30, 30, 20],
            distribution_mode="custom",
            option_count=5,
            question_num=4,
            dimension="strength_anchor",
        ),
    ]
    config = _build_execution_config(entries, target_num=80, target_alpha=0.85)
    blueprint = build_psychometric_blueprint(config)
    orientation = infer_dimension_orientation(blueprint.get("strength_anchor", []))
    if orientation.anchor_direction != "left":
        raise AssertionError(f"强偏斜主方向应为 left，实际为 {orientation.anchor_direction}")
    if orientation.ambiguous_anchor:
        raise AssertionError("强偏斜场景不应被判为锚点不明确")
    if set(orientation.reversed_keys) != {"q:2", "q:3", "q:4"}:
        raise AssertionError(f"反向题推断异常：{sorted(orientation.reversed_keys)}")


def test_preset_does_not_override_final_orientation() -> None:
    base_entries = [
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[5, 10, 20, 30, 35],
            distribution_mode="custom",
            option_count=5,
            question_num=1,
            dimension="preset_vs_ratio",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[5, 10, 20, 30, 35],
            distribution_mode="custom",
            option_count=5,
            question_num=2,
            dimension="preset_vs_ratio",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[35, 30, 20, 10, 5],
            distribution_mode="custom",
            option_count=5,
            question_num=3,
            dimension="preset_vs_ratio",
        ),
    ]
    preset_entries = [
        QuestionEntry(**{**entry.__dict__, "psycho_bias": bias})
        for entry, bias in zip(base_entries, ["left", "left", "right"])
    ]
    custom_entries = [
        QuestionEntry(**{**entry.__dict__, "psycho_bias": "custom"})
        for entry in base_entries
    ]

    preset_config = _build_execution_config(preset_entries, target_num=60, target_alpha=0.85)
    custom_config = _build_execution_config(custom_entries, target_num=60, target_alpha=0.85)

    preset_items = build_psychometric_blueprint(preset_config).get("preset_vs_ratio", [])
    custom_items = build_psychometric_blueprint(custom_config).get("preset_vs_ratio", [])
    preset_orientation = infer_dimension_orientation(preset_items)
    custom_orientation = infer_dimension_orientation(custom_items)

    if preset_orientation.anchor_direction != custom_orientation.anchor_direction:
        raise AssertionError("同一组最终配比不该因为快捷预设不同而改变主方向")
    if set(preset_orientation.reversed_keys) != set(custom_orientation.reversed_keys):
        raise AssertionError("同一组最终配比不该因为快捷预设不同而改变反向题结果")


def test_joint_plan_keeps_exact_ratio_and_improves_alpha() -> None:
    entries = [
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[0, 10, 20, 30, 40],
            distribution_mode="custom",
            option_count=5,
            question_num=1,
            dimension="satisfaction",
        ),
        QuestionEntry(
            question_type="score",
            probabilities=-1,
            custom_weights=[0, 5, 15, 30, 50],
            distribution_mode="custom",
            option_count=5,
            question_num=2,
            dimension="satisfaction",
        ),
        QuestionEntry(
            question_type="dropdown",
            probabilities=-1,
            custom_weights=[5, 10, 20, 25, 40],
            distribution_mode="custom",
            option_count=5,
            question_num=3,
            dimension="satisfaction",
        ),
        QuestionEntry(
            question_type="matrix",
            probabilities=-1,
            custom_weights=[[10, 15, 20, 25, 30]],
            distribution_mode="custom",
            option_count=5,
            rows=1,
            question_num=4,
            dimension="satisfaction",
        ),
    ]
    config = _build_execution_config(entries, target_num=100, target_alpha=0.85)
    plan = build_joint_psychometric_answer_plan(config)
    if plan is None:
        raise AssertionError("联合信效度计划不应为空")

    expected_counts_by_key = {
        "q:1": _largest_remainder_counts([0, 10, 20, 30, 40], 100),
        "q:2": _largest_remainder_counts([0, 5, 15, 30, 50], 100),
        "q:3": _largest_remainder_counts([5, 10, 20, 25, 40], 100),
        "q:4:row:0": _largest_remainder_counts([10, 15, 20, 25, 30], 100),
    }
    for choice_key, counts in expected_counts_by_key.items():
        _assert_counts(plan, choice_key, counts)
        if counts[0] == 0:
            actual_zero_choice = sum(1 for item in plan.answers_by_sample.values() if item.get(choice_key) == 0)
            if actual_zero_choice != counts[0]:
                raise AssertionError(f"{choice_key} 的 0 权重选项仍然被选中了")

    ordered_keys = list(expected_counts_by_key.keys())
    joint_alpha = cronbach_alpha(_matrix_from_plan(plan, ordered_keys))
    baseline_alpha = cronbach_alpha(_build_random_baseline(expected_counts_by_key))
    if joint_alpha <= baseline_alpha + 0.15:
        raise AssertionError(f"联合优化没有明显拉高信度：joint={joint_alpha:.3f}, baseline={baseline_alpha:.3f}")


def test_ambiguous_anchor_skips_reverse_inference() -> None:
    entries = [
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[100, 0, 0, 0, 0],
            distribution_mode="custom",
            option_count=5,
            question_num=1,
            dimension="ambiguous",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[0, 0, 0, 0, 100],
            distribution_mode="custom",
            option_count=5,
            question_num=2,
            dimension="ambiguous",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[0, 25, 50, 25, 0],
            distribution_mode="custom",
            option_count=5,
            question_num=3,
            dimension="ambiguous",
        ),
    ]
    config = _build_execution_config(entries, target_num=40, target_alpha=0.9)
    plan = build_joint_psychometric_answer_plan(config)
    if plan is None:
        raise AssertionError("锚点不明确场景也应返回联合计划")

    diagnostic = plan.diagnostics_by_dimension.get("ambiguous")
    if diagnostic is None:
        raise AssertionError("缺少 ambiguous 维度诊断信息")
    if not diagnostic.ambiguous_anchor:
        raise AssertionError("左右强度接近时应标记为锚点不明确")
    if diagnostic.reverse_item_count != 0:
        raise AssertionError("锚点不明确时不应自动判反向题")
    if not diagnostic.degraded_for_ratio:
        raise AssertionError("锚点不明确且方向冲突时应接受降 alpha")


def test_conflict_dimension_degrades_alpha_but_keeps_ratio() -> None:
    entries = [
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[0, 0, 0, 0, 100],
            distribution_mode="custom",
            option_count=5,
            question_num=1,
            dimension="conflict",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[100, 0, 0, 0, 0],
            distribution_mode="custom",
            option_count=5,
            question_num=2,
            dimension="conflict",
        ),
    ]
    config = _build_execution_config(entries, target_num=60, target_alpha=0.95)
    plan = build_joint_psychometric_answer_plan(config)
    if plan is None:
        raise AssertionError("冲突场景下也应该生成联合计划")
    _assert_counts(plan, "q:1", [0, 0, 0, 0, 60])
    _assert_counts(plan, "q:2", [60, 0, 0, 0, 0])
    diagnostic = plan.diagnostics_by_dimension.get("conflict")
    if diagnostic is None:
        raise AssertionError("缺少 conflict 维度诊断信息")
    if not diagnostic.degraded_for_ratio:
        raise AssertionError("冲突维度应当被标记为“保比例降信度”")
    if not diagnostic.ambiguous_anchor:
        raise AssertionError("完全对冲的维度应当被标记为锚点不明确")
    if diagnostic.reverse_item_count != 0:
        raise AssertionError("完全对冲的维度不应自动判反向题")


def test_joint_sample_ticket_lifecycle() -> None:
    entries = [
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[10, 20, 30, 40],
            distribution_mode="custom",
            option_count=4,
            question_num=1,
            dimension="ticket",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[40, 30, 20, 10],
            distribution_mode="custom",
            option_count=4,
            question_num=2,
            dimension="ticket",
        ),
    ]
    config = _build_execution_config(entries, target_num=5, target_alpha=0.8)
    config.joint_psychometric_answer_plan = build_joint_psychometric_answer_plan(config)
    state = ExecutionState(config=config)

    sample_a = state.reserve_joint_sample(5, thread_name="Worker-1")
    sample_b = state.reserve_joint_sample(5, thread_name="Worker-2")
    if (sample_a, sample_b) != (0, 1):
        raise AssertionError(f"前两个样本槽位分配异常：{sample_a}, {sample_b}")

    state.release_joint_sample("Worker-1")
    sample_c = state.reserve_joint_sample(5, thread_name="Worker-3")
    if sample_c != 0:
        raise AssertionError(f"释放后的样本槽位应被复用为 0，实际为 {sample_c}")

    state.commit_joint_sample("Worker-2")
    sample_d = state.reserve_joint_sample(5, thread_name="Worker-4")
    if sample_d != 2:
        raise AssertionError(f"已提交槽位不应复用，预期分到 2，实际为 {sample_d}")


def test_reversed_items_improve_alpha() -> None:
    """验证混合 left/right bias 维度通过反向题推断获得合理信度。"""
    entries = [
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[5, 10, 20, 30, 35],
            distribution_mode="custom",
            option_count=5,
            question_num=1,
            dimension="wellbeing",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[5, 10, 20, 30, 35],
            distribution_mode="custom",
            option_count=5,
            question_num=2,
            dimension="wellbeing",
        ),
        QuestionEntry(
            question_type="scale",
            probabilities=-1,
            custom_weights=[35, 30, 20, 10, 5],
            distribution_mode="custom",
            option_count=5,
            question_num=3,
            dimension="wellbeing",
        ),
    ]
    config = _build_execution_config(entries, target_num=100, target_alpha=0.85)
    plan = build_joint_psychometric_answer_plan(config)
    if plan is None:
        raise AssertionError("含反向题的联合信效度计划不应为空")

    _assert_counts(plan, "q:1", _largest_remainder_counts([5, 10, 20, 30, 35], 100))
    _assert_counts(plan, "q:2", _largest_remainder_counts([5, 10, 20, 30, 35], 100))
    _assert_counts(plan, "q:3", _largest_remainder_counts([35, 30, 20, 10, 5], 100))

    blueprint = build_psychometric_blueprint(config)
    wb_items = blueprint.get("wellbeing", [])
    orientation = infer_dimension_orientation(wb_items)
    rev_keys = infer_reversed_keys(wb_items)
    if not rev_keys:
        raise AssertionError("wellbeing 维度应推断出反向题（q:3）")
    if orientation.anchor_direction != "right":
        raise AssertionError(f"wellbeing 维度主方向应为 right，实际为 {orientation.anchor_direction}")
    if orientation.ambiguous_anchor:
        raise AssertionError("wellbeing 维度不应被判为锚点不明确")

    keys = ["q:1", "q:2", "q:3"]
    oc_map = {item.choice_key: item.option_count for item in wb_items}
    matrix = _matrix_from_plan(plan, keys, reversed_keys=rev_keys, option_counts=oc_map)
    alpha = cronbach_alpha(matrix)
    if alpha < 0.5:
        raise AssertionError(f"反向题翻转后 alpha 过低：{alpha:.3f}")


def test_bias_labels_use_left_right_wording() -> None:
    if ("left", "偏左") not in BIAS_PRESET_CHOICES:
        raise AssertionError("题目编辑器预设文案应改为“偏左”")
    if ("right", "偏右") not in BIAS_PRESET_CHOICES:
        raise AssertionError("题目编辑器预设文案应改为“偏右”")

    left_entry = QuestionEntry(
        question_type="scale",
        probabilities=-1,
        custom_weights=[100, 0, 0, 0, 0],
        distribution_mode="custom",
        option_count=5,
        question_num=1,
        psycho_bias="left",
    )
    right_entry = QuestionEntry(
        question_type="scale",
        probabilities=-1,
        custom_weights=[0, 0, 0, 0, 100],
        distribution_mode="custom",
        option_count=5,
        question_num=2,
        psycho_bias="right",
    )
    if summarize_bias(left_entry) != "偏左":
        raise AssertionError("策略页偏向摘要应显示“偏左”")
    if summarize_bias(right_entry) != "偏右":
        raise AssertionError("策略页偏向摘要应显示“偏右”")
    if "偏左" not in question_summary(left_entry):
        raise AssertionError("Dashboard 摘要应显示“偏左”")
    if "偏右" not in question_summary(right_entry):
        raise AssertionError("Dashboard 摘要应显示“偏右”")


def main() -> None:
    random.seed(20260416)
    test_strict_ratio_question_keeps_reliability_dimension()
    test_fallback_bias_presets_do_not_collapse_to_center()
    test_fallback_bias_presets_shift_average_scores()
    test_strength_based_anchor_beats_majority_count()
    test_preset_does_not_override_final_orientation()
    test_joint_plan_keeps_exact_ratio_and_improves_alpha()
    test_ambiguous_anchor_skips_reverse_inference()
    test_conflict_dimension_degrades_alpha_but_keeps_ratio()
    test_joint_sample_ticket_lifecycle()
    test_reversed_items_improve_alpha()
    test_bias_labels_use_left_right_wording()
    print("joint psychometric plan tests passed")


if __name__ == "__main__":
    main()
