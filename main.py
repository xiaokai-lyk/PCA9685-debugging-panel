"""PCA9685 Debug Panel — Launcher.

Usage:
    python main.py              # hardware mode (real PCA9685 required)
    python main.py --mock       # mock mode for UI development (no hardware)
    python main.py --debug      # debug mode (detailed error messages and request logging)

After installing the package (pip install / uv add):
    pca9685-panel               # hardware mode
    pca9685-panel --mock        # mock mode
    pca9685-panel --debug       # debug mode
"""

import argparse

from backend.pca9685 import configure_mock


def main():
    """Entry point for console_scripts and direct invocation."""
    parser = argparse.ArgumentParser(description="PCA9685 Debug Panel")
    parser.add_argument(
        "--mock", action="store_true", default=False,
        help="Run in mock mode (no hardware required — useful for UI development)",
    )
    parser.add_argument(
        "--debug", action="store_true", default=False,
        help="Enable debug mode (detailed error messages, request logging, tracebacks in responses)",
    )
    parser.add_argument(
        "--host", default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port", type=int, default=8080,
        help="Port to listen on (default: 8080)",
    )
    parser.add_argument(
        "--reload", action="store_true", default=False,
        help="Enable uvicorn auto-reload (dev only)",
    )
    parser.add_argument(
        "--auth-token", default=None,
        help="Shared token for write operations (POST/DELETE). "
             "If not set, no authentication is required (unsafe).",
    )
    args = parser.parse_args()

    configure_mock(enabled=args.mock)

    from backend.app import configure_debug, configure_auth
    configure_debug(enabled=args.debug)
    configure_auth(token=args.auth_token)

    import uvicorn
    uvicorn.run(
        "backend.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="debug" if args.debug else "info",
    )


if __name__ == "__main__":
    main()
