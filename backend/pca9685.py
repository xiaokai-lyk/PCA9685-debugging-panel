"""PCA9685 driver wrapper with optional mock mode for development.

Mock mode is controlled explicitly — use the ``--mock`` flag when launching
(or set the module-level config via ``configure_mock()``) rather than
auto-detecting whether hardware is present.
"""

from __future__ import annotations

import time
import threading
from typing import Optional

# Module-level config set by main.py before the driver is initialised.
_mock_config: bool = False


def configure_mock(enabled: bool) -> None:
    """Enable or disable mock mode (called from launcher before startup)."""
    global _mock_config
    _mock_config = enabled


class PCA9685Driver:
    """Thin wrapper around adafruit_pca9685.PCA9685.

    - Hardware access is attempted when *mock* is ``False``.
    - When *mock* is ``True`` all operations run against an in-memory buffer.
    - Tracks heartbeat (last successful hardware read).
    - Handles angle↔pulse conversion using per-channel calibration.
    """

    # Allowed frequency range (Hz)
    FREQ_MIN = 40
    FREQ_MAX = 400

    def __init__(self, address: int = 0x40, *, mock: bool = False) -> None:
        self._address = address
        self._device: Optional[object] = None
        self._mock_mode = mock
        self._mock_channels: list[int] = [0] * 16  # duty_cycle values
        self._mock_frequency: float = 50.0
        self._lock = threading.Lock()
        self._last_heartbeat: float = 0.0
        self._online: bool = False
        self._last_error: str = ""

    # ── lifecycle ──────────────────────────────────────────────────

    def initialize(self) -> None:
        """Initialise the PCA9685 (or enter mock mode if configured)."""
        if self._mock_mode:
            print("[PCA9685] Mock mode enabled — no hardware required")
            self._online = True
            self._last_heartbeat = time.time()
            return

        try:
            import board
            import busio
            import adafruit_pca9685

            i2c = busio.I2C(board.SCL, board.SDA)
            self._device = adafruit_pca9685.PCA9685(i2c, address=self._address)
            self._device.frequency = 50
            self._online = True
            self._last_heartbeat = time.time()
        except Exception as exc:
            msg = f"Hardware init failed: {exc}"
            print(f"[PCA9685] {msg}")
            self._device = None
            self._online = False
            self._last_error = msg

    def close(self) -> None:
        """Release resources."""
        if self._device is not None:
            try:
                self._device.deinit()
            except Exception:
                pass
        self._device = None
        self._online = False

    # ── properties ─────────────────────────────────────────────────

    @property
    def online(self) -> bool:
        return self._online

    @property
    def last_heartbeat(self) -> float:
        return self._last_heartbeat

    @property
    def mock_mode(self) -> bool:
        return self._mock_mode

    @property
    def last_error(self) -> str:
        return self._last_error

    # ── heartbeat ──────────────────────────────────────────────────

    def check_heartbeat(self) -> bool:
        """Read a register to verify the device is still reachable.

        On failure, attempts to re-initialise the hardware so that
        transient I²C errors are recovered automatically.

        Returns True if the device responded, False otherwise.
        """
        if self._mock_mode:
            self._last_heartbeat = time.time()
            self._online = True
            return True

        # Attempt (re-)initialisation if we have no active device
        if self._device is None:
            self.initialize()

        if self._device is None:
            self._online = False
            return False

        try:
            _ = self._device.mode1_reg
            self._last_heartbeat = time.time()
            self._online = True
            self._last_error = ""
            return True
        except Exception as exc:
            self._online = False
            self._last_error = f"Heartbeat failed: {exc}"
            return False

    # ── frequency ──────────────────────────────────────────────────

    @property
    def frequency_hz(self) -> float:
        if self._device is not None:
            try:
                return float(self._device.frequency)
            except Exception:
                pass
        return self._mock_frequency

    def set_frequency(self, hz: float) -> None:
        """Set the PWM frequency (40–400 Hz)."""
        hz = max(self.FREQ_MIN, min(self.FREQ_MAX, hz))
        with self._lock:
            if self._device is not None:
                self._device.frequency = hz
            self._mock_frequency = hz

    # ── PWM helpers ────────────────────────────────────────────────

    def _pulse_to_duty(self, pulse_us: float) -> int:
        """Convert a pulse width in µs to a 16-bit duty-cycle value."""
        period_us = 1_000_000.0 / self.frequency_hz
        duty = int((pulse_us / period_us) * 0xFFFF)
        return max(0, min(0xFFFF, duty))

    def _angle_to_pulse(self, angle: float,
                        min_angle: float, max_angle: float,
                        min_pulse: float, max_pulse: float) -> float:
        """Linearly map angle to pulse width using calibration data."""
        angle = max(min_angle, min(max_angle, angle))
        ratio = (angle - min_angle) / (max_angle - min_angle)
        return min_pulse + ratio * (max_pulse - min_pulse)

    def _write_channel(self, channel: int, duty_cycle: int) -> None:
        """Write raw duty_cycle to a channel (0–65535)."""
        with self._lock:
            self._mock_channels[channel] = duty_cycle
            if self._device is not None:
                try:
                    self._device.channels[channel].duty_cycle = duty_cycle
                except Exception:
                    self._online = False
                    raise

    # ── public API ─────────────────────────────────────────────────

    def set_channel_duty(self, channel: int, duty: float) -> None:
        """Set channel output by duty-cycle fraction (0.0 – 1.0)."""
        duty_cycle = int(max(0.0, min(1.0, duty)) * 0xFFFF)
        self._write_channel(channel, duty_cycle)

    def set_channel_angle(self, channel: int, angle: float,
                          min_angle: float, max_angle: float,
                          min_pulse: float, max_pulse: float) -> None:
        """Set channel output by angle using calibration data."""
        pulse_us = self._angle_to_pulse(angle, min_angle, max_angle,
                                        min_pulse, max_pulse)
        duty_cycle = self._pulse_to_duty(pulse_us)
        self._write_channel(channel, duty_cycle)

    def set_channel_raw_pulse(self, channel: int, pulse_us: float) -> None:
        """Set channel output directly by pulse width in µs."""
        duty_cycle = self._pulse_to_duty(pulse_us)
        self._write_channel(channel, duty_cycle)

    def get_channel_duty_cycle(self, channel: int) -> int:
        """Return the last-written duty_cycle for a channel."""
        with self._lock:
            return self._mock_channels[channel]

    def get_channel_duty_fraction(self, channel: int) -> float:
        """Return the last-written duty as a 0–1 fraction."""
        return self.get_channel_duty_cycle(channel) / 0xFFFF

    def all_off(self) -> None:
        """Set all channels to zero (safety)."""
        for ch in range(16):
            self._write_channel(ch, 0)


# ── Singleton ─────────────────────────────────────────────────────────

_driver: Optional[PCA9685Driver] = None


def get_driver(address: int = 0x40) -> PCA9685Driver:
    """Return (and cache) the singleton driver instance.

    Respects the module-level ``_mock_config`` flag set by
    ``configure_mock()`` before server startup.
    """
    global _driver
    if _driver is None:
        _driver = PCA9685Driver(address=address, mock=_mock_config)
        _driver.initialize()
    return _driver
