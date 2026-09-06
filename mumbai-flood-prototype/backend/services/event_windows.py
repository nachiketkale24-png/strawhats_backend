"""Resolve precomputed historical intervals without doing live FSI computation."""
import json
import re
from enum import IntEnum
from pipeline import config

class WindowMinutes(IntEnum):
    FIFTEEN = 15
    THIRTY = 30
    SIXTY = 60
    NINETY = 90
    ONE_TWENTY = 120
    ONE_EIGHTY = 180


def get_windows(event_date):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", event_date):
        raise FileNotFoundError("Unknown event date")
    path = config.DATA_PROCESSED_DIR / f"event_windows_{event_date}.json"
    if not path.exists():
        return {"event_date": event_date, "windows": []}
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["windows"] = [window for window in manifest["windows"]
        if config.flood_risk_tif(f"{event_date}_{window['minutes']}min").exists()
        and config.road_graph_pickle(f"{event_date}_{window['minutes']}min").exists()]
    return manifest


def event_key(event_date, window_minutes=None):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", event_date):
        raise FileNotFoundError("Unknown event date")
    if window_minutes is None:
        return event_date
    if window_minutes not in [window["minutes"] for window in get_windows(event_date)["windows"]]:
        raise FileNotFoundError(f"No precomputed {window_minutes}-minute output for {event_date}")
    return f"{event_date}_{window_minutes}min"
