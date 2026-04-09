#!/usr/bin/env python
"""三模式信效度策略的最小回归检查。"""

from __future__ import annotations

import random
import unittest

from software.core.config.codec import normalize_runtime_config_payload
from software.core.questions.config import QuestionEntry, configure_probabilities, validate_question_config
from software.core.questions.distribution import resolve_distribution_probabilities
from software.core.questions.reliability_mode import (
    DEFAULT_RELIABILITY_PRIORITY_MODE,
    RELIABILITY_PRIORITY_RATIO_FIRST,
    RELIABILITY_PRIORITY_RELIABILITY_FIRST,
)
from software.core.questions.tendency import get_tendency_index
from software.core.task.task_context import TaskContext


class _StubPlan:
    def __init__(self, choice: int):
        self._choice = int(choice)

    def get_choice(self, question_index: int, row_index=None):
        return self._choice


class ReliabilityModeTests(unittest.TestCase):
    def test_runtime_config_defaults_to_balanced(self) -> None:
        cfg = normalize_runtime_config_payload({})
        self.assertEqual(cfg.reliability_priority_mode, DEFAULT_RELIABILITY_PRIORITY_MODE)

        invalid_cfg = normalize_runtime_config_payload({"reliability_priority_mode": "wtf"})
        self.assertEqual(invalid_cfg.reliability_priority_mode, DEFAULT_RELIABILITY_PRIORITY_MODE)

    def test_task_context_defaults_to_balanced(self) -> None:
        ctx = TaskContext()
        self.assertEqual(ctx.reliability_priority_mode, DEFAULT_RELIABILITY_PRIORITY_MODE)

    def test_ratio_first_applies_stronger_distribution_correction(self) -> None:
        ctx = TaskContext()
        ctx.distribution_runtime_stats = {
            "q:1": {
                "total": 80,
                "counts": [50, 20, 10],
            }
        }
        ratio_first = resolve_distribution_probabilities(
            [0.2, 0.3, 0.5],
            3,
            ctx,
            1,
            psycho_plan=object(),
            priority_mode=RELIABILITY_PRIORITY_RATIO_FIRST,
        )
        reliability_first = resolve_distribution_probabilities(
            [0.2, 0.3, 0.5],
            3,
            ctx,
            1,
            psycho_plan=object(),
            priority_mode=RELIABILITY_PRIORITY_RELIABILITY_FIRST,
        )
        self.assertGreater(ratio_first[2], reliability_first[2])
        self.assertLess(ratio_first[0], reliability_first[0])

    def test_reliability_first_stays_closer_to_psycho_anchor(self) -> None:
        plan = _StubPlan(choice=0)
        probabilities = [0.01, 0.04, 0.1, 0.25, 0.6]

        random.seed(12345)
        reliability_samples = [
            get_tendency_index(
                5,
                probabilities,
                dimension="满意度",
                psycho_plan=plan,
                question_index=1,
                priority_mode=RELIABILITY_PRIORITY_RELIABILITY_FIRST,
            )
            for _ in range(600)
        ]

        random.seed(12345)
        ratio_samples = [
            get_tendency_index(
                5,
                probabilities,
                dimension="满意度",
                psycho_plan=plan,
                question_index=1,
                priority_mode=RELIABILITY_PRIORITY_RATIO_FIRST,
            )
            for _ in range(600)
        ]

        reliability_mean = sum(reliability_samples) / len(reliability_samples)
        ratio_mean = sum(ratio_samples) / len(ratio_samples)
        self.assertLess(reliability_mean, ratio_mean)

    def test_strict_custom_ratio_scale_is_excluded_from_reliability_dimension(self) -> None:
        entry = QuestionEntry(
            question_type="scale",
            probabilities=[0.0, 100.0, 0.0, 0.0, 0.0],
            option_count=5,
            distribution_mode="custom",
            custom_weights=[0.0, 100.0, 0.0, 0.0, 0.0],
            question_num=3,
            dimension="满意度",
        )
        ctx = TaskContext()
        configure_probabilities([entry], ctx=ctx, reliability_mode_enabled=True)
        self.assertTrue(ctx.question_strict_ratio_map[3])
        self.assertIsNone(ctx.question_dimension_map[3])

    def test_validate_single_all_zero_weights_is_rejected(self) -> None:
        entry = QuestionEntry(
            question_type="single",
            probabilities=[0.0, 0.0, 0.0],
            option_count=3,
            distribution_mode="random",
            question_num=7,
        )
        error = validate_question_config([entry])
        self.assertIsNotNone(error)
        self.assertIn("第 7 题", error)
        self.assertIn("配比都小于等于 0", error)

    def test_configure_probabilities_raises_for_all_zero_embedded_select(self) -> None:
        entry = QuestionEntry(
            question_type="single",
            probabilities=[100.0, 0.0],
            option_count=2,
            distribution_mode="custom",
            custom_weights=[100.0, 0.0],
            question_num=9,
            attached_option_selects=[
                {
                    "option_text": "其他",
                    "weights": [0.0, 0.0, 0.0],
                }
            ],
        )
        with self.assertRaisesRegex(ValueError, "嵌入式下拉"):
            configure_probabilities([entry], ctx=TaskContext(), reliability_mode_enabled=True)


if __name__ == "__main__":
    unittest.main()
