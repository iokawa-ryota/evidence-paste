@echo off
chcp 65001 > nul
set PORT=8000
set SERVER_EXEC=server.exe
set TOOL_URL=http://localhost:%PORT%/index.html

echo Webサーバーを起動しています (ポート:%PORT%)
echo このウィンドウを閉じるとツールが終了します。
echo -------------------------------------------

:: 1. Webサーバーをバックグラウンドで起動
start /B %SERVER_EXEC% %PORT%

:: 2. サーバーが起動するのを待つ
timeout /t 1 >nul

:: 3. ブラウザでツールを開く
start "" %TOOL_URL%