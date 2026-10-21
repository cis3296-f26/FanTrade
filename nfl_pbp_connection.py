from datetime import datetime
from typing import List, Optional
import nfl_data_py as nfl
import pandas as pd


def get_current_nfl_season() -> int:
    """
    Dynamically determines the active or most recent NFL season year.
    Falls back to prior year if before August.
    """
    today = datetime.now()
    return today.year if today.month >= 8 else today.year - 1


def get_play_by_play_data(
    seasons: Optional[List[int]] = None,
    columns: Optional[List[str]] = None,
    team: Optional[str] = None,
    downcast: bool = True,
) -> pd.DataFrame:
    """
    Fetches NFL play-by-play data using nfl_data_py.

    :param seasons: List of year integers (e.g., [2024, 2025]). Defaults to current season.
    :param columns: Specific subset of columns to retrieve.
    :param team: Filter plays by home or away team abbreviation (e.g., 'PIT', 'PHI').
    :param downcast: Reduces float memory footprint if True.
    :return: Pandas DataFrame containing filtered play-by-play data.
    """
    if not seasons:
        seasons = [get_current_nfl_season()]

    try:
        # Fetch PBP data from nfl_data_py
        df = nfl.import_pbp_data(years=seasons, columns=columns, downcast=downcast)

        if df.empty:
            print(f"Warning: No data returned for season(s) {seasons}")
            return pd.DataFrame()

        # Optional team filtering
        if team:
            team_clean = team.upper().strip()
            df = df[(df["home_team"] == team_clean) | (df["away_team"] == team_clean)]

        return df

    except Exception as e:
        print(f"Error fetching play-by-play data: {e}")
        return pd.DataFrame()


def get_summary_stats(df: pd.DataFrame) -> dict:
    """
    Extracts summary metrics from a PBP DataFrame.
    """
    if df.empty:
        return {"error": "DataFrame is empty"}

    total_plays = len(df)
    pass_plays = len(df[df["play_type"] == "pass"]) if "play_type" in df.columns else None
    run_plays = len(df[df["play_type"] == "run"]) if "play_type" in df.columns else None

    return {
        "total_plays": total_plays,
        "pass_plays": pass_plays,
        "run_plays": run_plays,
        "columns_loaded": list(df.columns),
    }


if __name__ == "__main__":
    import sys

    # Get target season or default to current season
    target_season = get_current_nfl_season()
    if len(sys.argv) > 1:
        try:
            target_season = int(sys.argv[1])
        except ValueError:
            print(f"Invalid season year provided. Using default: {target_season}")

    print(f"Fetching Play-by-Play data for season: {target_season}...")

    # Key columns to speed up fetch time 
    # We can discuss which ones to use but there are 300+ columns by default
    selected_cols = [
        "game_id",
        "season",
        "week",
        "home_team",
        "away_team",
        "play_type",
        "yards_gained",
        "epa",
        "desc",
    ]

    pbp_df = get_play_by_play_data(
        seasons=[target_season],
        columns=selected_cols,
    )

    if not pbp_df.empty:
        stats = get_summary_stats(pbp_df)
        print(f"\nSuccessfully loaded {stats['total_plays']} plays!")
        print(f"Pass plays: {stats['pass_plays']} | Run plays: {stats['run_plays']}")
        print("\nFirst 5 plays sample:")
        print(pbp_df[["game_id", "week", "play_type", "yards_gained", "desc"]].head())
    else:
        print("\nCould not retrieve PBP data.")