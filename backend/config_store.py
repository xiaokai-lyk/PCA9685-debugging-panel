"""Server-side configuration persistence.

config.json stores the current running configuration so that settings
survive a restart.  Workspace export/import produces a full snapshot
that the user can save to / load from the client machine.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Optional

from backend.schemas import ChannelState, WorkspaceData

DEFAULT_CONFIG: dict[str, Any] = {
    "i2c_address": 0x40,
    "frequency_hz": 50.0,
    "min_pulse_us": 600.0,
    "max_pulse_us": 2400.0,
    "output_enabled": False,
    "channels": {},
}


class ConfigStore:
    """Thread-safe JSON file store for PCA9685 configuration."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()
        self._data: dict[str, Any] = {**DEFAULT_CONFIG, "channels": {}}
        self.load()

    # ── low-level helpers ──────────────────────────────────────────

    def load(self) -> None:
        """Read config.json, merging missing keys from defaults."""
        if not self._path.exists():
            self.save()
            return
        try:
            with open(self._path) as f:
                loaded = json.load(f)
        except (json.JSONDecodeError, OSError):
            loaded = {}
        with self._lock:
            self._data = {**DEFAULT_CONFIG, **loaded}
            # Ensure channels sub-dict exists
            if not isinstance(self._data.get("channels"), dict):
                self._data["channels"] = {}
            # Convert channel keys to int (JSON only allows string keys)
            self._data["channels"] = {
                int(k): v for k, v in self._data["channels"].items()
            }

    def save(self) -> None:
        """Persist current config to disk."""
        with self._lock:
            data = dict(self._data)
        with open(self._path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)

    # ── global settings ────────────────────────────────────────────

    @property
    def i2c_address(self) -> int:
        with self._lock:
            return self._data["i2c_address"]

    @i2c_address.setter
    def i2c_address(self, value: int) -> None:
        with self._lock:
            self._data["i2c_address"] = value

    @property
    def frequency_hz(self) -> float:
        with self._lock:
            return self._data["frequency_hz"]

    @frequency_hz.setter
    def frequency_hz(self, value: float) -> None:
        with self._lock:
            self._data["frequency_hz"] = value

    @property
    def min_pulse_us(self) -> float:
        with self._lock:
            return self._data["min_pulse_us"]

    @min_pulse_us.setter
    def min_pulse_us(self, value: float) -> None:
        with self._lock:
            self._data["min_pulse_us"] = value

    @property
    def max_pulse_us(self) -> float:
        with self._lock:
            return self._data["max_pulse_us"]

    @max_pulse_us.setter
    def max_pulse_us(self, value: float) -> None:
        with self._lock:
            self._data["max_pulse_us"] = value

    @property
    def output_enabled(self) -> bool:
        with self._lock:
            return self._data.get("output_enabled", False)

    @output_enabled.setter
    def output_enabled(self, value: bool) -> None:
        with self._lock:
            self._data["output_enabled"] = value

    # ── per-channel helpers ────────────────────────────────────────

    def _ensure_channel(self, channel: int) -> dict[str, Any]:
        key = str(channel)
        with self._lock:
            if key not in self._data["channels"]:
                self._data["channels"][key] = {}
            return dict(self._data["channels"][key])

    def get_channel_raw(self, channel: int) -> dict[str, Any]:
        """Return the raw dict for a channel (safe for external reads)."""
        return self._ensure_channel(channel)

    def set_channel_field(self, channel: int, field: str, value: Any) -> None:
        with self._lock:
            key = str(channel)
            if key not in self._data["channels"]:
                self._data["channels"][key] = {}
            self._data["channels"][key][field] = value

    def get_channel_enabled(self, channel: int) -> bool:
        raw = self.get_channel_raw(channel)
        return raw.get("enabled", False)

    def set_channel_enabled(self, channel: int, enabled: bool) -> None:
        self.set_channel_field(channel, "enabled", enabled)

    def get_channel(self, channel: int) -> ChannelState:
        """Build a ChannelState from stored config + runtime state."""
        raw = self.get_channel_raw(channel)
        calib = raw.get("calibration", {})
        has_calib = bool(calib.get("min_angle") is not None
                         and calib.get("max_angle") is not None)
        return ChannelState(
            channel=channel,
            name=raw.get("name", f"Channel {channel}"),
            enabled=raw.get("enabled", False),
            angle=raw.get("angle"),
            duty=raw.get("duty"),
            min_angle=calib.get("min_angle"),
            max_angle=calib.get("max_angle"),
            min_pulse=calib.get("min_pulse"),
            max_pulse=calib.get("max_pulse"),
            calibrated=has_calib,
        )

    def set_channel_output(self, channel: int, *,
                           angle: Optional[float] = None,
                           duty: Optional[float] = None) -> None:
        """Record the current output state of a channel."""
        if angle is not None:
            self.set_channel_field(channel, "angle", angle)
            self.set_channel_field(channel, "duty", None)
        elif duty is not None:
            self.set_channel_field(channel, "duty", duty)
            self.set_channel_field(channel, "angle", None)

    def set_channel_name(self, channel: int, name: str) -> None:
        self.set_channel_field(channel, "name", name)

    def set_channel_calibration(self, channel: int, *,
                                min_angle: float, max_angle: float,
                                min_pulse: float, max_pulse: float) -> None:
        self.set_channel_field(channel, "calibration", {
            "min_angle": min_angle,
            "max_angle": max_angle,
            "min_pulse": min_pulse,
            "max_pulse": max_pulse,
        })

    # ── workspace ──────────────────────────────────────────────────

    def export_workspace(self) -> WorkspaceData:
        """Build a full snapshot suitable for client-side download."""
        channels = [self.get_channel(i) for i in range(16)]
        return WorkspaceData(
            i2c_address=self.i2c_address,
            frequency_hz=self.frequency_hz,
            min_pulse_us=self.min_pulse_us,
            max_pulse_us=self.max_pulse_us,
            channels=channels,
        )

    def import_workspace(self, ws: WorkspaceData) -> None:
        """Apply a full workspace snapshot and persist."""
        with self._lock:
            self._data["i2c_address"] = ws.i2c_address
            self._data["frequency_hz"] = ws.frequency_hz
            self._data["min_pulse_us"] = ws.min_pulse_us
            self._data["max_pulse_us"] = ws.max_pulse_us
            self._data["channels"] = {}
            for ch in ws.channels:
                cdata: dict[str, Any] = {
                    "name": ch.name,
                    "angle": ch.angle,
                    "duty": ch.duty,
                }
                if ch.calibrated:
                    cdata["calibration"] = {
                        "min_angle": ch.min_angle,
                        "max_angle": ch.max_angle,
                        "min_pulse": ch.min_pulse,
                        "max_pulse": ch.max_pulse,
                    }
                # Only store if there's meaningful data
                if any(v is not None for v in cdata.values()):
                    self._data["channels"][str(ch.channel)] = cdata
        self.save()


# ── Default instance ──────────────────────────────────────────────────

_config_path = Path(__file__).resolve().parent.parent / "config.json"
store = ConfigStore(_config_path)
