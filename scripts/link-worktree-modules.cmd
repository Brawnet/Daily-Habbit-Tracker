@echo off
REM Links frontend/node_modules from the primary repository to a target worktree.
REM Usage: scripts\link-worktree-modules.cmd "E:\Project\Daily-Habbit-Tracker-worktree-issue-15"

if "%~1"=="" (
    echo Usage: %0 ^<target-worktree-path^>
    exit /b 1
)

set "TARGET_DIR=%~1\frontend\node_modules"
set "SOURCE_DIR=%~dp0..\frontend\node_modules"

if not exist "%SOURCE_DIR%" (
    echo Source node_modules not found at %SOURCE_DIR%. Run npm install in primary frontend first.
    exit /b 1
)

if exist "%TARGET_DIR%" (
    echo Target node_modules already exists at %TARGET_DIR%.
    exit /b 0
)

echo Creating junction from %SOURCE_DIR% to %TARGET_DIR%...
mklink /J "%TARGET_DIR%" "%SOURCE_DIR%"
if %ERRORLEVEL% equ 0 (
    echo Junction created successfully.
) else (
    echo Failed to create junction.
)
