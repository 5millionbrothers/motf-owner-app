@echo off
cd /d "C:\Users\TT\Documents\Codex\2026-06-19\d\outputs\motf-app"
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start "" http://localhost:3000"
"C:\Users\TT\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "C:\Users\TT\Documents\Codex\2026-06-19\d\outputs\motf-app\node_modules\next\dist\bin\next" dev -p 3000
pause
