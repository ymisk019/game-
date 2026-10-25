@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules ( call npm install )
if not exist dist\index.html ( call npm run build )
echo Starting BALL VS KEEPER ... (the mini server stops when you close the game tab)
node server.js --auto --open
