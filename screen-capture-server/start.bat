@echo off
chcp 65001 >nul 2>&1
echo ══════════════════════════════════════════
echo   螢幕擷取伺服器 啟動腳本
echo ══════════════════════════════════════════
echo.

REM 檢查 Python 是否已安裝
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 找不到 Python！請先安裝 Python 3.8 以上版本。
    echo 下載連結: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 安裝依賴套件
echo [1/2] 正在安裝依賴套件...
pip install -r "%~dp0requirements.txt" -q
if %errorlevel% neq 0 (
    echo [錯誤] 套件安裝失敗！
    pause
    exit /b 1
)

echo [2/2] 正在啟動伺服器...
echo.
python "%~dp0server.py"
pause
