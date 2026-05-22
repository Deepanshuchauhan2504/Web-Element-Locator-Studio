@echo off
title AutoLocator Studio Launcher
color 0A

echo =======================================================================
echo              AutoLocator Studio - Automation Page Object Generator
echo =======================================================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found on your system!
    echo Please install Python 3.8+ and ensure it's added to your PATH.
    echo.
    pause
    exit /b
)

:: Check for virtual environment
if not exist .venv (
    echo [INFO] Creating Python virtual environment...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment!
        pause
        exit /b
    )
    echo [INFO] Virtual environment created successfully.
    echo.
)

:: Activate venv and verify dependencies
echo [INFO] Activating virtual environment...
call .venv\Scripts\activate

echo [INFO] Verifying / installing dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies!
    pause
    exit /b
)
echo [INFO] Dependencies are up to date.
echo.

:: Open browser automatically
echo [INFO] Launching AutoLocator Studio in your default browser...
start http://127.0.0.1:5000

:: Start the Flask app
echo [INFO] Starting Flask Server on http://127.0.0.1:5000...
echo Close this window or press Ctrl+C to stop the application.
echo -----------------------------------------------------------------------
python app.py

pause
