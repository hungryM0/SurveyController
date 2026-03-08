import math
from typing import Any, List, Optional, Tuple, Union

from wjx.core.questions.utils import normalize_droplist_probs

_CORRECTION_WARMUP_SAMPLES = 24
_CORRECTION_GAIN = 2.8
_CORRECTION_GAIN_PSYCHO = 1.15
_CORRECTION_MIN_FACTOR = 0.6
_CORRECTION_MAX_FACTOR = 1.7
_CORRECTION_MIN_FACTOR_PSYCHO = 0.82
_CORRECTION_MAX_FACTOR_PSYCHO = 1.18
_CORRECTION_GAP_LIMIT = 0.35


def build_distribution_stat_key(question_index: int, row_index: Optional[int] = None) -> str:
    if row_index is None:
        return f"q:{int(question_index)}"
    return f"matrix:{int(question_index)}:{int(row_index)}"


def _normalize_distribution_target(
    probabilities: Union[List[float], int, float, None],
    option_count: int,
) -> List[float]:
    if option_count <= 0:
        return []
    return normalize_droplist_probs(probabilities, option_count)


def _resolve_runtime_counts(
    ctx: Optional[Any],
    stat_key: str,
    option_count: int,
) -> Tuple[int, List[int]]:
    if ctx is None or not hasattr(ctx, "snapshot_distribution_stats"):
        return (0, [0] * max(0, int(option_count or 0)))
    try:
        total, counts = ctx.snapshot_distribution_stats(stat_key, option_count)
    except Exception:
        return (0, [0] * max(0, int(option_count or 0)))
    return (max(0, int(total or 0)), list(counts or []))


def resolve_distribution_probabilities(
    probabilities: Union[List[float], int, float, None],
    option_count: int,
    ctx: Optional[Any],
    question_index: Optional[int],
    *,
    row_index: Optional[int] = None,
    psycho_plan: Optional[Any] = None,
) -> List[float]:
    target = _normalize_distribution_target(probabilities, option_count)
    if option_count <= 0 or not target or question_index is None or ctx is None:
        return target

    stat_key = build_distribution_stat_key(question_index, row_index)
    total, counts = _resolve_runtime_counts(ctx, stat_key, option_count)
    if total <= 0:
        return target

    sample_factor = min(1.0, float(total) / float(_CORRECTION_WARMUP_SAMPLES))
    if sample_factor <= 0.0:
        return target

    if psycho_plan is not None:
        gain = _CORRECTION_GAIN_PSYCHO
        min_factor = _CORRECTION_MIN_FACTOR_PSYCHO
        max_factor = _CORRECTION_MAX_FACTOR_PSYCHO
    else:
        gain = _CORRECTION_GAIN
        min_factor = _CORRECTION_MIN_FACTOR
        max_factor = _CORRECTION_MAX_FACTOR

    adjusted: List[float] = []
    for idx, target_ratio in enumerate(target):
        if target_ratio <= 0.0:
            adjusted.append(0.0)
            continue
        actual_ratio = float(counts[idx]) / float(total) if idx < len(counts) and total > 0 else 0.0
        gap = max(-_CORRECTION_GAP_LIMIT, min(_CORRECTION_GAP_LIMIT, target_ratio - actual_ratio))
        factor = math.exp(gain * sample_factor * gap)
        factor = max(min_factor, min(max_factor, factor))
        adjusted.append(target_ratio * factor)

    adjusted_total = sum(adjusted)
    if adjusted_total <= 0.0:
        return target
    return [value / adjusted_total for value in adjusted]


def record_pending_distribution_choice(
    ctx: Optional[Any],
    question_index: Optional[int],
    option_index: int,
    option_count: int,
    *,
    row_index: Optional[int] = None,
) -> None:
    if ctx is None or question_index is None or option_count <= 0:
        return
    if option_index < 0 or option_index >= option_count:
        return
    if not hasattr(ctx, "append_pending_distribution_choice"):
        return
    try:
        ctx.append_pending_distribution_choice(
            build_distribution_stat_key(question_index, row_index),
            option_index,
            option_count,
        )
    except Exception:
        return
