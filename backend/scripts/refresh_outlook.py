"""Refresh nflverse tables and rebuild the upcoming-week predictions."""

import argparse

from scripts.build_predictions import main as build_predictions
from scripts.load_data import main as load_nflverse_data


def main() -> None:
    argparse.ArgumentParser(
        description="Refresh nflverse data and rebuild the upcoming-week forecast."
    ).parse_args()
    print("Refreshing schedules and weekly player stats from nflverse...")
    load_nflverse_data()
    print("Building a fresh upcoming-week forecast snapshot...")
    build_predictions()


if __name__ == "__main__":
    main()
