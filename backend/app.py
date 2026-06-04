"""FastAPI entry point — REST + SSE server for the PCA9685 debug panel."""

from __future__ import annotations

import asyncio
import json
import time
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from backend.config_store import store
from backend.pca9685 import get_driver, PCA9685Driver
from backend.schemas import (
    CalibrateRequest,
    ChannelsResponse,
    DeviceStatus,
    FrequencyRequest,
    MessageResponse,
    OutputChannelRequest,
    OutputGlobalRequest,
    PulseRangeRequest,
    SetNameRequest,
    SetServoRequest,
    StatusResponse,
    WorkspaceData,
)

# ── Debug mode flag (set by main.py before server starts) ─────────────

_debug_mode: bool = False


def configure_debug(enabled: bool) -> None:
    """Enable or disable debug mode (called from launcher before startup)."""
    global _debug_mode
    _debug_mode = enabled

# ── SSE Manager ───────────────────────────────────────────────────────

class SSEManager:
    """Manages connected SSE clients and broadcasts server-pushed events."""

    def __init__(self) -> None:
        self._queues: list[asyncio.Queue[tuple[str, str]]] = []
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[tuple[str, str]]:
        q: asyncio.Queue[tuple[str, str]] = asyncio.Queue(maxsize=64)
        async with self._lock:
            self._queues.append(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue[tuple[str, str]]) -> None:
        async with self._lock:
            if q in self._queues:
                self._queues.remove(q)

    async def broadcast(self, event: str, data: str) -> None:
        async with self._lock:
            queues = list(self._queues)
        for q in queues:
            try:
                q.put_nowait((event, data))
            except asyncio.QueueFull:
                pass


sse = SSEManager()


# ── Heartbeat background task ────────────────────────────────────────

async def heartbeat_loop(driver: PCA9685Driver) -> None:
    """Periodically check device health and broadcast status changes."""
    while True:
        await asyncio.sleep(2)
        is_online = driver.check_heartbeat()
        await sse.broadcast(
            "status",
            json.dumps({
                "status": "online" if is_online else "offline",
                "last_heartbeat": _iso_now() if is_online else None,
            }),
        )


# ── Helpers ──────────────────────────────────────────────────────────

def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_status(driver: PCA9685Driver) -> StatusResponse:
    if driver.online:
        status = DeviceStatus.ONLINE
    else:
        status = DeviceStatus.OFFLINE
    return StatusResponse(
        status=status,
        i2c_address=store.i2c_address,
        frequency_hz=store.frequency_hz,
        min_pulse_us=store.min_pulse_us,
        max_pulse_us=store.max_pulse_us,
        output_enabled=store.output_enabled,
        last_heartbeat=datetime.fromtimestamp(driver.last_heartbeat, tz=timezone.utc).isoformat() if driver.last_heartbeat > 0 else None,
        last_error=driver.last_error,
        mock_mode=driver.mock_mode,
    )


def _check_driver(driver: PCA9685Driver) -> None:
    if not driver.online and not driver.mock_mode:
        detail = "PCA9685 device offline"
        if _debug_mode and driver.last_error:
            detail = f"PCA9685 device offline — {driver.last_error}"
        raise HTTPException(status_code=503, detail=detail)


# ── Lifespan ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    driver = get_driver(store.i2c_address)
    app.state.driver = driver
    hb_task = asyncio.create_task(heartbeat_loop(driver))
    app.state.hb_task = hb_task
    # Apply persisted config to hardware
    _apply_config(driver)
    yield
    # Shutdown
    hb_task.cancel()
    try:
        await hb_task
    except asyncio.CancelledError:
        pass
    driver.close()


def _apply_config(driver: PCA9685Driver) -> None:
    """Push persisted config to the hardware.  Channels are only restored
    when the global output-enable flag is True."""
    try:
        driver.set_frequency(store.frequency_hz)
        if store.output_enabled:
            _restore_all_channels(driver)
        else:
            driver.all_off()
    except Exception as exc:
        print(f"[startup] Failed to apply config to hardware: {exc}")


def _restore_all_channels(driver: PCA9685Driver) -> None:
    """Write persisted outputs to all enabled channels."""
    for ch in range(16):
        _restore_channel(driver, ch)


def _restore_channel(driver: PCA9685Driver, channel: int) -> None:
    """Restore a single channel's output if it is enabled, else kill it."""
    if not store.get_channel_enabled(channel):
        driver.set_channel_duty(channel, 0)
        return
    raw = store.get_channel_raw(channel)
    if raw.get("angle") is not None:
        calib = raw.get("calibration", {})
        if calib:
            driver.set_channel_angle(
                channel, raw["angle"],
                calib["min_angle"], calib["max_angle"],
                calib["min_pulse"], calib["max_pulse"],
            )
    elif raw.get("duty") is not None:
        driver.set_channel_duty(channel, raw["duty"])


# ── App ──────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
if not FRONTEND_DIR.is_dir():
    # Fallback: maybe frontend is alongside the backend package (alternative install layout)
    FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"

app = FastAPI(title="PCA9685 Debug Panel", lifespan=lifespan)


# ── Debug middleware ──────────────────────────────────────────────────

@app.middleware("http")
async def debug_request_log(request: Request, call_next):
    if _debug_mode:
        start = time.time()
        response = await call_next(request)
        duration = (time.time() - start) * 1000
        print(f"[debug] {request.method} {request.url.path} → {response.status_code} ({duration:.1f}ms)")
        return response
    return await call_next(request)


# ── Global exception handler (debug mode: return traceback) ──────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if _debug_mode:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        return JSONResponse(
            status_code=500,
            content={"detail": f"{type(exc).__name__}: {exc}\n\n{tb}"},
        )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Static files (CSS, JS) — served before the catch-all
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# ── REST endpoints ───────────────────────────────────────────────────

@app.get("/api/status", response_model=StatusResponse)
async def api_status(request: Request) -> StatusResponse:
    driver: PCA9685Driver = request.app.state.driver
    return _get_status(driver)


@app.get("/api/servo/channels", response_model=ChannelsResponse)
async def api_channels(request: Request) -> ChannelsResponse:
    """Return state for all 16 channels (config + driver state)."""
    channels = [store.get_channel(i) for i in range(16)]
    return ChannelsResponse(channels=channels)


@app.post("/api/servo/set", response_model=MessageResponse)
async def api_servo_set(body: SetServoRequest, request: Request) -> MessageResponse:
    """Set a channel output by angle (if calibrated) or duty (0–1).

    Values are always persisted.  The hardware is only updated when both
    the global output-enable flag and the per-channel enable flag are on.
    """
    driver: PCA9685Driver = request.app.state.driver
    _check_driver(driver)

    can_write = store.output_enabled and store.get_channel_enabled(body.channel)

    if body.angle is not None:
        calib = store.get_channel_raw(body.channel).get("calibration")
        if not calib:
            raise HTTPException(
                status_code=400,
                detail=f"Channel {body.channel} not calibrated. Use 'duty' instead.",
            )
        store.set_channel_output(body.channel, angle=body.angle)
        store.save()
        if can_write:
            driver.set_channel_angle(
                body.channel, body.angle,
                calib["min_angle"], calib["max_angle"],
                calib["min_pulse"], calib["max_pulse"],
            )
        return MessageResponse(
            detail=f"Channel {body.channel} set to {body.angle}°"
        )
    elif body.duty is not None:
        store.set_channel_output(body.channel, duty=body.duty)
        store.save()
        if can_write:
            driver.set_channel_duty(body.channel, body.duty)
        return MessageResponse(
            detail=f"Channel {body.channel} set to duty {body.duty:.3f}"
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Either 'angle' or 'duty' must be provided.",
        )


@app.post("/api/servo/name", response_model=MessageResponse)
async def api_servo_name(body: SetNameRequest) -> MessageResponse:
    store.set_channel_name(body.channel, body.name)
    store.save()
    return MessageResponse(
        detail=f"Channel {body.channel} renamed to '{body.name}'"
    )


@app.post("/api/servo/calibrate", response_model=MessageResponse)
async def api_servo_calibrate(body: CalibrateRequest, request: Request) -> MessageResponse:
    driver: PCA9685Driver = request.app.state.driver
    _check_driver(driver)

    if body.min_angle >= body.max_angle:
        raise HTTPException(status_code=400, detail="min_angle must be < max_angle")
    if body.min_pulse >= body.max_pulse:
        raise HTTPException(status_code=400, detail="min_pulse must be < max_pulse")

    store.set_channel_calibration(
        body.channel,
        min_angle=body.min_angle,
        max_angle=body.max_angle,
        min_pulse=body.min_pulse,
        max_pulse=body.max_pulse,
    )
    store.save()
    return MessageResponse(
        detail=f"Channel {body.channel} calibrated: "
               f"{body.min_angle}°→{body.min_pulse}µs, "
               f"{body.max_angle}°→{body.max_pulse}µs"
    )


@app.post("/api/pca9685/frequency", response_model=MessageResponse)
async def api_set_frequency(body: FrequencyRequest, request: Request) -> MessageResponse:
    driver: PCA9685Driver = request.app.state.driver
    _check_driver(driver)
    driver.set_frequency(body.frequency_hz)
    store.frequency_hz = body.frequency_hz
    store.save()
    return MessageResponse(detail=f"Frequency set to {body.frequency_hz} Hz")


@app.post("/api/pca9685/pulse_range", response_model=MessageResponse)
async def api_set_pulse_range(body: PulseRangeRequest, request: Request) -> MessageResponse:
    if body.min_pulse_us >= body.max_pulse_us:
        raise HTTPException(status_code=400, detail="min_pulse_us must be < max_pulse_us")
    store.min_pulse_us = body.min_pulse_us
    store.max_pulse_us = body.max_pulse_us
    store.save()
    return MessageResponse(
        detail=f"Pulse range set to {body.min_pulse_us}–{body.max_pulse_us} µs"
    )


@app.post("/api/output/global", response_model=MessageResponse)
async def api_output_global(body: OutputGlobalRequest, request: Request) -> MessageResponse:
    """Master switch: enable or kill all channel outputs."""
    driver: PCA9685Driver = request.app.state.driver
    _check_driver(driver)
    store.output_enabled = body.enabled
    store.save()
    if body.enabled:
        _restore_all_channels(driver)
    else:
        driver.all_off()
    return MessageResponse(
        detail=f"Output {'enabled' if body.enabled else 'disabled'}"
    )


@app.post("/api/output/channel", response_model=MessageResponse)
async def api_output_channel(body: OutputChannelRequest, request: Request) -> MessageResponse:
    """Enable or disable a single channel."""
    driver: PCA9685Driver = request.app.state.driver
    _check_driver(driver)
    store.set_channel_enabled(body.channel, body.enabled)
    store.save()
    if store.output_enabled:
        _restore_channel(driver, body.channel)
    else:
        driver.set_channel_duty(body.channel, 0)
    return MessageResponse(
        detail=f"Channel {body.channel} {'enabled' if body.enabled else 'disabled'}"
    )


@app.get("/api/workspace/export", response_model=WorkspaceData)
async def api_workspace_export() -> WorkspaceData:
    """Return the full configuration snapshot for client download."""
    return store.export_workspace()


@app.post("/api/workspace/import", response_model=MessageResponse)
async def api_workspace_import(body: WorkspaceData, request: Request) -> MessageResponse:
    """Apply a workspace snapshot uploaded from the client."""
    driver: PCA9685Driver = request.app.state.driver
    store.import_workspace(body)
    _apply_config(driver)
    return MessageResponse(detail="Workspace imported and applied")


# ── SSE endpoint ─────────────────────────────────────────────────────

@app.get("/api/events")
async def api_events(request: Request) -> StreamingResponse:
    """Server-Sent Events stream for device status pushes."""

    async def event_generator():
        q = await sse.subscribe()
        try:
            # Send initial status
            driver: PCA9685Driver = request.app.state.driver
            status = _get_status(driver)
            yield f"event: status\ndata: {status.model_dump_json()}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event, data = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"event: {event}\ndata: {data}\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive comment
                    yield ": keepalive\n\n"
        finally:
            await sse.unsubscribe(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Root — serve index.html ──────────────────────────────────────────

@app.get("/")
async def root() -> HTMLResponse:
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Frontend not found</h1>", status_code=404)
