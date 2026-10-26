@echo off
title FoodBridge Activity Exporter
echo ==========================================================
echo        FoodBridge Activity and Audit Logs Exporter
echo ==========================================================
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0export_activity.ps1"
echo.
echo Press any key to open the generated report in your browser...
pause >nul
start "" "%~dp0FoodBridge_Activity_Report.html"
