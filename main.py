"""PCA9685 Debug Panel — Launcher.

Run with:
    uv run uvicorn backend.app:app --host 0.0.0.0 --port 8080 --reload
"""

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8080, reload=True)
