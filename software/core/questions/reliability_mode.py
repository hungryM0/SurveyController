"""信效度优先级模式定义与调参。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

RELIABILITY_PRIORITY_RELIABILITY_FIRST = "reliability_first"
RELIABILITY_PRIORITY_BALANCED = "balanced"
RELIABILITY_PRIORITY_RATIO_FIRST = "ratio_first"
DEFAULT_RELIABILITY_PRIORITY_MODE = RELIABILITY_PRIORITY_BALANCED
SUPPORTED_RELIABILITY_PRIORITY_MODES = {
    RELIABILITY_PRIORITY_RELIABILITY_FIRST,
    RELIABILITY_PRIORITY_BALANCED,
    RELIABILITY_PRIORITY_RATIO_FIRST,
}


@dataclass(frozen=True)
class ReliabilityPriorityProfile:
    """三种优先模式下的集中调参。"""

    distribution_warmup_samples: int
    distribution_gain: float
    distribution_min_factor: float
    distribution_max_factor: float
    distribution_gap_limit: float
    consistency_window_ratio: float
    consistency_window_max: int
    consistency_center_weight: float
    consistency_edge_weight: float
    consistency_outside_decay: float


_PROFILES: Dict[str, ReliabilityPriorityProfile] = {
    RELIABILITY_PRIORITY_RELIABILITY_FIRST: ReliabilityPriorityProfile(
        distribution_warmup_samples=18,
        distribution_gain=1.0,
        distribution_min_factor=0.88,
        distribution_max_factor=1.16,
        distribution_gap_limit=0.20,
        consistency_window_ratio=0.24,
        consistency_window_max=10,
        consistency_center_weight=2.1,
        consistency_edge_weight=0.92,
        consistency_outside_decay=0.01,
    ),
    RELIABILITY_PRIORITY_BALANCED: ReliabilityPriorityProfile(
        distribution_warmup_samples=14,
        distribution_gain=1.75,
        distribution_min_factor=0.80,
        distribution_max_factor=1.28,
        distribution_gap_limit=0.28,
        consistency_window_ratio=0.18,
        consistency_window_max=8,
        consistency_center_weight=1.8,
        consistency_edge_weight=0.86,
        consistency_outside_decay=0.02,
    ),
    RELIABILITY_PRIORITY_RATIO_FIRST: ReliabilityPriorityProfile(
        distribution_warmup_samples=10,
        distribution_gain=2.5,
        distribution_min_factor=0.70,
        distribution_max_factor=1.44,
        distribution_gap_limit=0.38,
        consistency_window_ratio=0.12,
        consistency_window_max=6,
        consistency_center_weight=1.55,
        consistency_edge_weight=0.82,
        consistency_outside_decay=0.04,
    ),
}


def normalize_reliability_priority_mode(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in SUPPORTED_RELIABILITY_PRIORITY_MODES:
        return text
    return DEFAULT_RELIABILITY_PRIORITY_MODE


def get_reliability_priority_profile(value: Any) -> ReliabilityPriorityProfile:
    return _PROFILES[normalize_reliability_priority_mode(value)]

