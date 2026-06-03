# PCA9685 Debug Panel

> 基于 Web 的 PCA9685 舵机驱动远程调试面板，运行在机器人上，通过浏览器控制。

[![Python](https://img.shields.io/badge/python-%3E%3D3.10-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/fastapi-0.136%2B-009688)](https://fastapi.tiangolo.com)

[English](README.md)

## 简介

一个轻量级 Web 面板（类似 FTC Dashboard），运行在机器人上，让你可以通过 Wi‑Fi 在电脑浏览器中远程调试 PCA9685 驱动的舵机。支持单通道角度控制与校准、设备在线状态实时监控、以及 workspace 保存/加载——无需写代码即可调校舵机。

**痛点：** 在机器人上调舵机角度通常需要 SSH + 手动脚本。这个面板提供了可视化的浏览器 UI，带滑条、实时反馈、重启后配置自动恢复。

## 安装与快速开始

### 环境要求

- Python 3.10+
- 已启用 I²C 并连接到PCA9685的树莓派（或同类设备），**或**任意电脑用于纯 UI 开发（mock 模式）

### 快速启动

#### 使用 Pip 安装
```shell
# 从 PyPI 安装
pip install pca9685-debugging-panel

# 启动服务
pca9685-panel --host 0.0.0.0 --port 8080
```

然后在浏览器打开 `http://<机器人IP>:8080`。

#### 从源码安装

```shell
git clone https://github.com/xiaokai-lyk/PCA9685-debugging-panel.git
cd PCA9685-debugging-panel
uv sync
python main.py
```

首次启动时会自动生成 `config.json`，包含默认值（I²C 地址 `0x40`，频率 50 Hz，脉宽范围 600–2400 µs）。

### 在桌面端运行（无硬件）

使用 `--mock` 标志跳过硬件初始化——所有 API 正常工作，UI 可完整交互，前端开发无需真实硬件：

```shell
pca9685-panel --mock
```

## 开发

### 项目结构

```
PCA9685-debugging-panel/
├── backend/
│   ├── app.py              # FastAPI 入口（REST + SSE）
│   ├── pca9685.py          # PCA9685 驱动（真实硬件 + 可选 mock 模式）
│   ├── config_store.py     # JSON 配置持久化
│   └── schemas.py          # Pydantic 请求/响应模型
├── frontend/
│   ├── index.html          # 单页面 UI
│   ├── app.js              # SSE 连接、REST 调用、状态管理
│   └── styles.css          # 暗色主题、响应式布局
├── config.json             # 自动生成的运行配置
├── main.py                 # 便捷启动器
├── plan.md                 # 架构与设计决策
└── pyproject.toml          # 项目元数据与依赖
```

### API 一览

| 方法     | 路径                         | 说明                                                                 |
| -------- | ---------------------------- | -------------------------------------------------------------------- |
| `GET`  | `/api/status`              | 设备状态、频率、I²C 地址                                            |
| `GET`  | `/api/servo/channels`      | 全部 16 通道状态                                                     |
| `POST` | `/api/servo/set`           | 设置通道输出：角度 `{channel, angle}` 或占空比 `{channel, duty}` |
| `POST` | `/api/servo/name`          | 重命名通道 `{channel, name}`                                       |
| `POST` | `/api/servo/calibrate`     | 设置角度↔脉宽校准                                                   |
| `POST` | `/api/pca9685/frequency`   | 设置 PWM 频率 `{frequency_hz}`                                     |
| `POST` | `/api/pca9685/pulse_range` | 设置默认脉宽范围                                                     |
| `GET`  | `/api/workspace/export`    | 导出完整配置为 JSON 文件                                             |
| `POST` | `/api/workspace/import`    | 上传并应用 workspace JSON                                            |
| `GET`  | `/api/events`              | SSE 流，推送设备状态变化                                             |

访问 `http://<host>:8080/docs` 查看交互式 API 文档（Swagger UI）。

## 功能特性

- **16 通道舵机网格** — 每通道独立的角度滑条/占空比滑条，实时显示脉宽
- **逐通道校准** — 为每个舵机自定义角度到脉宽的映射关系
- **实时状态** — 通过 SSE 推送设备在线/离线状态与心跳
- **频率控制** — 40–400 Hz 可调 PWM 频率
- **Workspace 保存/加载** — 将完整配置（校准、名称、设置）导出为 JSON 文件，之后可导入或迁移到其他机器人
- **重启持久化** — `config.json` 在重启后自动恢复上次配置
- **Mock 模式** — 通过 `--mock` 标志启动，无需硬件即可进行 UI 开发与测试
- **暗色主题** — 响应式布局，适配桌面和移动端浏览器

## 配置

### config.json（自动管理）

| 键               | 类型       | 默认值         | 说明                         |
| ---------------- | ---------- | -------------- | ---------------------------- |
| `i2c_address`  | `int`    | `64`（0x40） | PCA9685 的 I²C 地址         |
| `frequency_hz` | `float`  | `50.0`       | PWM 频率（40–400 Hz）       |
| `min_pulse_us` | `float`  | `600.0`      | 默认最小脉宽（µs）          |
| `max_pulse_us` | `float`  | `2400.0`     | 默认最大脉宽（µs）          |
| `channels`     | `object` | `{}`         | 各通道校准、名称和历史输出值 |

此文件在设置变更时自动写入，无需手动编辑。

### Workspace 文件（用户管理）

通过 UI 或 `GET /api/workspace/export` 导出。包含上述字段以及完整的通道数据（校准、名称、当前位置）。可在另一台机器上导入以复现相同配置。

## 参与贡献

欢迎 Fork 仓库并使用 feature 分支提交 Pull Request。

重大变更请先提 Issue 讨论。

## 相关链接

- 仓库：[https://github.com/xiaokai-lyk/PCA9685-debugging-panel](https://github.com/xiaokai-lyk/PCA9685-debugging-panel)
- Issue 追踪：[https://github.com/xiaokai-lyk/PCA9685-debugging-panel/issues](https://github.com/xiaokai-lyk/PCA9685-debugging-panel/issues)
- 相关项目：
  - [Adafruit CircuitPython PCA9685](https://github.com/adafruit/Adafruit_CircuitPython_PCA9685)
  - [FTC Dashboard](https://github.com/acmerobotics/ftc-dashboard)

## 许可证

本项目使用 [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0) 许可证。
