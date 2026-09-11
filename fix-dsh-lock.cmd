@echo off
rem ============================================================
rem  dsh lock doctor - clear the orphan profile writer lock
rem  Logic lives in fix-dsh-lock.ps1 (same folder).
rem  usage: fix-dsh-lock.cmd [/quiet]
rem ============================================================
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-dsh-lock.ps1"
set "RC=%errorlevel%"
if "%RC%"=="0" echo [dsh-lock] ready - dsh can start again
if "%RC%"=="3" echo [dsh-lock] another dsh instance is healing modules right now; retry in a few seconds
if "%RC%"=="4" echo [dsh-lock] could not delete the lock; close all dsh windows and retry
if /i not "%~1"=="/quiet" pause
endlocal
