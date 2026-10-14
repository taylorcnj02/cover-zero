"""Train and evaluate quantile XGBoost models for WR/TE receiving yards."""

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error
from xgboost import XGBRegressor

from app.features.player_game import FEATURE_COLUMNS

QUANTILES = (0.1, 0.5, 0.9)


@dataclass(frozen=True)
class BacktestResult:
    """Metrics measured only on the held-out season."""

    test_season: int
    training_rows: int
    test_rows: int
    model_median_mae: float
    last_five_baseline_mae: float
    median_mae_improvement_percent: float
    p10_p90_coverage_percent: float
    average_interval_width: float

    def as_dict(self) -> dict[str, int | float]:
        return asdict(self)


def _new_quantile_model(quantile: float) -> XGBRegressor:
    return XGBRegressor(
        objective="reg:quantileerror",
        quantile_alpha=quantile,
        tree_method="hist",
        n_estimators=300,
        max_depth=3,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=2.0,
        n_jobs=1,
        random_state=42,
        verbosity=0,
    )


def backtest_receiving_yards(
    features: pd.DataFrame,
    test_season: int = 2025,
    feature_columns: tuple[str, ...] = FEATURE_COLUMNS,
) -> tuple[BacktestResult, pd.DataFrame]:
    """Train on earlier seasons and score a completely held-out season."""
    training = features.loc[
        (features["season"] < test_season)
        & features["receiving_yards"].notna()
    ].copy()
    test = features.loc[
        (features["season"] == test_season)
        & features["receiving_yards"].notna()
        & features["last_5_receiving_yards"].notna()
    ].copy()
    if training.empty:
        raise ValueError(f"No training rows exist before {test_season}.")
    if test.empty:
        raise ValueError(
            f"No {test_season} test rows have both a result and prior-game baseline."
        )

    x_train = training[list(feature_columns)]
    y_train = training["receiving_yards"].astype(float)
    x_test = test[list(feature_columns)]

    predictions: dict[str, np.ndarray] = {}
    for label, quantile in zip(("p10", "p50", "p90"), QUANTILES, strict=True):
        model = _new_quantile_model(quantile)
        model.fit(x_train, y_train)
        predictions[label] = np.maximum(model.predict(x_test), 0)

    quantile_values = np.sort(
        np.column_stack((predictions["p10"], predictions["p50"], predictions["p90"])),
        axis=1,
    )
    result_frame = test[
        ["player_id", "player_display_name", "position", "team", "opponent_team",
         "season", "week", "game_id", "receiving_yards", "last_5_receiving_yards"]
    ].copy()
    result_frame["p10"] = quantile_values[:, 0]
    result_frame["p50"] = quantile_values[:, 1]
    result_frame["p90"] = quantile_values[:, 2]
    result_frame["baseline_last5"] = test["last_5_receiving_yards"].astype(float)

    actual = result_frame["receiving_yards"].astype(float)
    model_mae = mean_absolute_error(actual, result_frame["p50"])
    baseline_mae = mean_absolute_error(actual, result_frame["baseline_last5"])
    improvement = (
        (baseline_mae - model_mae) / baseline_mae * 100
        if baseline_mae > 0
        else 0.0
    )
    coverage = (
        (actual >= result_frame["p10"]) & (actual <= result_frame["p90"])
    ).mean() * 100
    interval_width = (result_frame["p90"] - result_frame["p10"]).mean()

    result = BacktestResult(
        test_season=test_season,
        training_rows=len(training),
        test_rows=len(test),
        model_median_mae=round(float(model_mae), 4),
        last_five_baseline_mae=round(float(baseline_mae), 4),
        median_mae_improvement_percent=round(float(improvement), 4),
        p10_p90_coverage_percent=round(float(coverage), 4),
        average_interval_width=round(float(interval_width), 4),
    )
    return result, result_frame
