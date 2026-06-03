"""API request/response schemas and SSE event types."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Device status ────────────────────────────────────────────────────

class DeviceStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    ERROR = "error"


# ── Response models ──────────────────────────────────────────────────

class StatusResponse(BaseModel):
    status: DeviceStatus
    i2c_address: int
    frequency_hz: float
    min_pulse_us: float
    max_pulse_us: float
    output_enabled: bool = False
    last_heartbeat: Optional[str] = None
    last_error: str = ""
    mock_mode: bool = False


class ChannelState(BaseModel):
    channel: int = Field(ge=0, le=15)
    name: str = ""
    enabled: bool = True
    angle: Optional[float] = None
    duty: Optional[float] = None
    min_angle: Optional[float] = None
    max_angle: Optional[float] = None
    min_pulse: Optional[float] = None
    max_pulse: Optional[float] = None
    calibrated: bool = False


class ChannelsResponse(BaseModel):
    channels: list[ChannelState]


# ── Request models ───────────────────────────────────────────────────

class SetServoRequest(BaseModel):
    channel: int = Field(ge=0, le=15)
    angle: Optional[float] = None
    duty: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class SetNameRequest(BaseModel):
    channel: int = Field(ge=0, le=15)
    name: str


class CalibrateRequest(BaseModel):
    channel: int = Field(ge=0, le=15)
    min_angle: float
    max_angle: float
    min_pulse: float
    max_pulse: float


class FrequencyRequest(BaseModel):
    frequency_hz: float = Field(ge=40, le=400)


class PulseRangeRequest(BaseModel):
    min_pulse_us: float = Field(gt=0)
    max_pulse_us: float = Field(gt=0)


# ── Output enable ─────────────────────────────────────────────────

class OutputGlobalRequest(BaseModel):
    enabled: bool


class OutputChannelRequest(BaseModel):
    channel: int = Field(ge=0, le=15)
    enabled: bool


# ── Workspace ────────────────────────────────────────────────────────

class WorkspaceData(BaseModel):
    i2c_address: int
    frequency_hz: float
    min_pulse_us: float
    max_pulse_us: float
    channels: list[ChannelState]


# ── Generic ──────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    detail: str
