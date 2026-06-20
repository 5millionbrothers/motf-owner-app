@echo off
chcp 65001 > nul
set "PATH=C:\Users\TT\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\TT\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;%PATH%"
cd /d "C:\Users\TT\Documents\Codex\2026-06-19\d\outputs\motf-app"
echo moTF 개발 화면을 시작합니다.
echo 잠시 후 브라우저에서 http://localhost:3000 을 여세요.
echo 이 창을 닫으면 개발 화면도 종료됩니다.
call "C:\Users\TT\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd" dev
pause
