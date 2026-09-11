@echo off
title dsh-web-server - keep this window open
cd /d G:\Tools\deepseek-harness

rem --- port 3080 collision guard (2026-09-11) -------------------------------
rem Without this, double-clicking a second launcher while one dsh web already
rem owns 3080 makes the NEW process die instantly with EADDRINUSE (it never
rem reaches the browser), which looks exactly like "dsh randomly crashed".
netstat -ano | findstr ":3080 " | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 goto already

rem clear an orphan profile writer lock first: a launch killed during profile
rem boot would otherwise brick every later launch with "timed out waiting for
rem the writer lock at ...\.dsh\profiles\node_modules.lock" (see fix-dsh-lock.ps1)
call "G:\Tools\deepseek-harness\fix-dsh-lock.cmd" /quiet

rem put the workbuddy managed node (versions/current) first on PATH so the
rem pnpm scripts resolve the expected node build
for /f "delims=" %%v in ('type "C:\Users\Landrom\.workbuddy\binaries\node\versions\current"') do set "WB_NODEVER=%%v"
set "PATH=C:\Users\Landrom\.workbuddy\binaries\node\versions\%WB_NODEVER%;%PATH%"
set "WB_NODE=C:\Users\Landrom\.workbuddy\binaries\node\versions\%WB_NODEVER%\node.exe"
"%WB_NODE%" "C:\Users\Landrom\.workbuddy\binaries\node\workspace\node_modules\pnpm\bin\pnpm.cjs" dsh web
pause
exit /b 0

:already
echo [dsh] port 3080 is already LISTENING - an existing dsh web keeps serving.
echo [dsh] no second instance started (EADDRINUSE avoided); opening the browser.
start "" http://127.0.0.1:3080
timeout /t 3 /nobreak >nul
exit /b 0
