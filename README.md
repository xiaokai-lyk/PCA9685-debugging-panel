# PCA9685 Debug Panel

> Web-based remote control panel for debugging PCA9685 servo drivers on robots.

> **⚠️ Security Notice:** By default, this tool starts with **no authentication**. For shared networks, use `--auth-token <token>` to require a shared secret for write operations (POST/DELETE). Never expose the panel directly to the public internet.

[![Python](https://img.shields.io/badge/python-%3E%3D3.10-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/fastapi-0.136%2B-009688)](https://fastapi.tiangolo.com)

[中文文档](README.zh_cn.md)

## Vedio Demonstration

<video src="https://github.com/user-attachments/assets/1ec76faa-98f0-4822-ad41-b33fc77ead6d" ></video>


## Description

A lightweight web panel (similar to FTC Dashboard) that runs on your robot and lets you control PCA9685-driven servos from any browser over Wi‑Fi. Supports per-channel angle control with calibration, live device status monitoring, and workspace save/load — so you can tune and debug servos without touching code.

**Why?** Adjusting servo angles on a robot usually means SSH + manual scripts. This panel gives you a visual UI in the browser with sliders, real-time feedback, and configuration persistence across restarts.

## Installing / Getting started

### Prerequisites

- Python 3.10+
- A Raspberry Pi (or similar) with I²C enabled and connected to PCA9685, **or** any machine for UI-only development (mock mode)

### Quick setup

#### Using Pip
```shell
# Install from PyPI
pip install pca9685-debugging-panel

# Start the server
pca9685-panel --host 0.0.0.0 --port 8080
```

#### From GitHub Releases

Each [release](https://github.com/xiaokai-lyk/PCA9685-debugging-panel/releases) includes a pre-built `.whl` file as an attachment. Download it and install directly:

```shell
pip install pca9685_debugging_panel-0.2.0-py3-none-any.whl
pca9685-panel --host 0.0.0.0 --port 8080
```

Then open `http://<robot-ip>:8080` in your browser.

#### From source

```shell
git clone https://github.com/xiaokai-lyk/PCA9685-debugging-panel.git
cd PCA9685-debugging-panel
uv sync
python main.py
```

On first launch a `config.json` file is created automatically with default values (I²C address `0x40`, 50 Hz, 600–2400 µs pulse range).

### Running on a desktop (no hardware)

Use the `--mock` flag to skip hardware initialisation entirely — all APIs work, the UI is fully interactive, and no real hardware is required for frontend development:

```shell
pca9685-panel --mock
```

### Protecting write operations

To require a shared secret token for all write operations (POST/DELETE), use the `--auth-token` flag:

```shell
pca9685-panel --auth-token my-secret-token
```

The browser will show a login overlay; enter the same token to unlock the panel. Read operations (status, channel polling, SSE events) remain public so you can still monitor the device without authentication.

## Developing

### Project structure

```
PCA9685-debugging-panel/
├── backend/
│   ├── app.py              # FastAPI entry point (REST + SSE)
│   ├── pca9685.py          # PCA9685 driver (real hardware + optional mock mode)
│   ├── config_store.py     # JSON configuration persistence
│   └── schemas.py          # Pydantic request/response models
├── frontend/
│   ├── index.html          # Single-page UI
│   ├── app.js              # SSE connection, REST calls, state management
│   └── styles.css          # Dark theme, responsive grid
├── config.json             # Auto-generated runtime configuration
├── main.py                 # Convenience launcher
├── plan.md                 # Architecture & design decisions
└── pyproject.toml          # Project metadata & dependencies
```

### API overview

| Method   | Path                         | Description                                                    |
| -------- | ---------------------------- | -------------------------------------------------------------- |
| `GET`  | `/api/status`              | Device status, frequency, I²C address                         |
| `GET`  | `/api/servo/channels`      | All 16 channel states                                          |
| `POST` | `/api/servo/set`           | Set angle (`{channel, angle}`) or duty (`{channel, duty}`) |
| `POST` | `/api/servo/name`          | Rename a channel `{channel, name}`                           |
| `POST` | `/api/servo/calibrate`     | Set angle ↔ pulse calibration                                 |
| `POST` | `/api/pca9685/frequency`   | Set PWM frequency `{frequency_hz}`                           |
| `POST` | `/api/pca9685/pulse_range` | Set default pulse range                                        |
| `POST` | `/api/output/global`       | Master switch: enable/disable all channels `{enabled}`       |
| `POST` | `/api/output/channel`      | Enable/disable a single channel `{channel, enabled}`         |
| `GET`  | `/api/workspace/export`    | Download full configuration as JSON                            |
| `POST` | `/api/workspace/import`    | Upload & apply a workspace JSON                                |
| `POST` | `/api/config/clear`        | Reset all config to factory defaults                           |
| `GET`  | `/api/actions`             | List all saved action records                                  |
| `POST` | `/api/actions/record`      | Save current positions as a named action `{name}`            |
| `POST` | `/api/actions/{index}/play`  | Replay a saved action (restore all channel positions)       |
| `DELETE` | `/api/actions/{index}`   | Delete a saved action                                          |
| `POST` | `/api/actions/{index}/rename` | Rename a saved action `{name}`                          |
| `GET`  | `/api/events`              | SSE stream for device status pushes                            |

Interactive docs available at `http://<host>:8080/docs` (Swagger UI).

## Features

- **16-channel servo grid** — angle slider / duty-cycle slider per channel, with live pulse-width display
- **Per-channel calibration** — map your own angle‑to‑pulse ranges for each servo
- **Real-time status** — device online/offline indicator with heartbeat via SSE
- **Frequency control** — adjustable 40–400 Hz PWM frequency
- **Workspace save/load** — export the full configuration (calibration, names, settings) as a JSON file; import it later or on a different robot
- **Restart persistence** — `config.json` survives reboots so your last setup is restored automatically
- **Mock mode** — run with `--mock` flag for UI development & testing without hardware
- **Dark theme** — responsive layout, works on desktop and mobile browsers

## Configuration

### config.json (auto-managed)

| Key              | Type       | Default       | Description                                    |
| ---------------- | ---------- | ------------- | ---------------------------------------------- |
| `i2c_address`  | `int`    | `64` (0x40) | I²C address of the PCA9685                    |
| `frequency_hz` | `float`  | `50.0`      | PWM frequency (40–400 Hz)                     |
| `min_pulse_us` | `float`  | `600.0`     | Default minimum pulse width in µs             |
| `max_pulse_us` | `float`  | `2400.0`    | Default maximum pulse width in µs             |
| `channels`     | `object` | `{}`        | Per-channel calibration, name, and last output |

This file is written automatically when settings change — no manual editing needed.

### Workspace file (user-managed)

Exported via the UI or `GET /api/workspace/export`. Contains the same fields plus full per-channel data (calibration, names, current positions). Can be imported on another machine to replicate a setup.

## Troubleshooting

### Device stays offline — "Hardware init failed: No module named 'RPi'" 

This may happen when you are **NOT** using Raspberry Pi OS.

The Adafruit Blinka library cannot find the GPIO driver for your Raspberry Pi.

```shell
# Recommended
pip install rpi-lgpio

# For older OS (not recommended, may involve the compilation of C extensions)
pip install RPi.GPIO
```

### Offline — Hardware init faile2d: No I2C device at address: 0x40

Your PCA9685 might be at a different address. Scan the bus:

```shell
sudo apt-get install i2c-tools
i2cdetect -y 1
```
If it's all `--` in the result, please check if the device connection is correct. Make sure the connection is correct and then re-scan.

Then update the address in `config.json` or via the Settings modal in the UI.

## Contributing

If you'd like to contribute, please fork the repository and use a feature branch. Pull requests are welcome.

For major changes, open an issue first to discuss what you would like to change.

## Links

- Repository: [https://github.com/xiaokai-lyk/PCA9685-debugging-panel](https://github.com/xiaokai-lyk/PCA9685-debugging-panel)
- Issue tracker: [https://github.com/xiaokai-lyk/PCA9685-debugging-panel/issues](https://github.com/xiaokai-lyk/PCA9685-debugging-panel/issues)
- Related projects:
  - [Adafruit CircuitPython PCA9685](https://github.com/adafruit/Adafruit_CircuitPython_PCA9685)
  - [FTC Dashboard](https://github.com/acmerobotics/ftc-dashboard)

## Licensing

The code in this project is licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).
