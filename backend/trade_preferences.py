"""Shared search preferences for suggestions and recommended partners."""

from dataclasses import dataclass
import math


# Counts always mean players you give, then players you receive.
BALANCED_FORMATS = ((1, 1), (2, 2), (3, 3))
TRADE_UP_FORMATS = ((2, 1), (3, 1), (3, 2))
ADD_DEPTH_FORMATS = ((1, 2), (1, 3), (2, 3))
TRADE_FORMATS = {
    "any": BALANCED_FORMATS + TRADE_UP_FORMATS + ADD_DEPTH_FORMATS,
    "trade_up": TRADE_UP_FORMATS,
    "trade_up_or_balanced": TRADE_UP_FORMATS + BALANCED_FORMATS,
    "balanced": BALANCED_FORMATS,
    "add_depth": ADD_DEPTH_FORMATS,
    "add_depth_or_balanced": ADD_DEPTH_FORMATS + BALANCED_FORMATS,
}


@dataclass(frozen=True)
class TradePreferences:
    """Keep validated settings together so both searches use the same rules."""

    min_gain_percent: int = 4
    max_gain_percent: int = 12
    trade_style: str = "any"

    def __post_init__(self):
        # Reject booleans and fractions too; the slider moves in whole percentages.
        if any(type(value) is not int for value in (
            self.min_gain_percent, self.max_gain_percent,
        )):
            raise ValueError("Choose whole-number trade percentages.")
        if not 1 <= self.min_gain_percent <= self.max_gain_percent <= 35:
            raise ValueError("Trade percentages must stay between 1% and 35%.")
        if self.max_gain_percent - self.min_gain_percent < 8:
            raise ValueError("Keep at least 8 percentage points between the limits.")
        if not isinstance(self.trade_style, str) or self.trade_style not in TRADE_FORMATS:
            raise ValueError("Choose a supported trade style.")

    @property
    def formats(self):
        """Only build package sizes allowed by the selected style."""
        return TRADE_FORMATS[self.trade_style]

    def accepts_value(self, give_total, receive_total, drop_total=0):
        """Check the net advantage, including your required roster cuts."""
        # Unknown or invalid totals cannot establish that a trade meets the range.
        totals = (give_total, receive_total, drop_total)
        if any(isinstance(value, bool) or not isinstance(value, (int, float))
               or not math.isfinite(value) or value < 0 for value in totals):
            return False
        cost = give_total + drop_total
        larger = max(cost, receive_total)
        gain = receive_total - cost
        # Compare before rounding so a near miss cannot slip inside a boundary.
        return (larger > 0
                and self.min_gain_percent * larger <= gain * 100
                <= self.max_gain_percent * larger)

    def as_dict(self):
        """Echo the effective settings with a result or use them in a cache key."""
        return {
            "min_gain_percent": self.min_gain_percent,
            "max_gain_percent": self.max_gain_percent,
            "trade_style": self.trade_style,
        }


def parse_trade_preferences(data):
    """Read optional preferences from either endpoint's JSON request."""
    if not isinstance(data, dict):
        raise ValueError("Send a JSON object.")
    # Missing settings use defaults; explicitly invalid settings still fail validation.
    return TradePreferences(
        min_gain_percent=data.get("min_gain_percent", 4),
        max_gain_percent=data.get("max_gain_percent", 12),
        trade_style=data.get("trade_style", "any"),
    )
