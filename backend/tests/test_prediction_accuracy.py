"""Tests for summarizing forecasts against observed results."""

import unittest

from app.routes.predictions import _summarize_tracking


class PredictionAccuracyTests(unittest.TestCase):
    def test_empty_tracking_has_no_misleading_accuracy(self) -> None:
        summary = _summarize_tracking([])

        self.assertEqual(summary["prediction_count"], 0)
        self.assertIsNone(summary["mae"])
        self.assertIsNone(summary["p10_p90_coverage_percent"])
        self.assertEqual(summary["weeks"], [])

    def test_tracking_uses_mae_and_empirical_interval_coverage(self) -> None:
        summary = _summarize_tracking(
            [
                {
                    "season": 2026,
                    "week": 1,
                    "actual": 50,
                    "p10": 20,
                    "p50": 40,
                    "p90": 60,
                },
                {
                    "season": 2026,
                    "week": 1,
                    "actual": 90,
                    "p10": 20,
                    "p50": 70,
                    "p90": 80,
                },
            ]
        )

        self.assertEqual(summary["prediction_count"], 2)
        self.assertEqual(summary["mae"], 15)
        self.assertEqual(summary["p10_p90_coverage_percent"], 50)
        self.assertEqual(summary["weeks"][0]["prediction_count"], 2)
        self.assertEqual(summary["weeks"][0]["mae"], 15)
        self.assertEqual(summary["weeks"][0]["p10_p90_coverage_percent"], 50)


if __name__ == "__main__":
    unittest.main()
