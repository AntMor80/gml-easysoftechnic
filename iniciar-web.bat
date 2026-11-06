@echo off
chcp 65001 >nul
title GML EasySoftechnic - web
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encuentra Node.js. Instalalo desde https://nodejs.org/es ^(version LTS^) y vuelve a abrir este archivo.
  start https://nodejs.org/es
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Instalando lo necesario. La primera vez puede tardar unos minutos...
  call npm install
  if not exist "node_modules\vite\bin\vite.js" (
    echo.
    echo La instalacion no se ha completado. Haz una captura de esta ventana y enviasela a Claude.
    pause
    exit /b 1
  )
)

echo.
echo Abriendo la aplicacion en el navegador: http://localhost:5173
echo Para detenerla, cierra esta ventana.
echo.
node "node_modules\vite\bin\vite.js" "apps\web" --open
pause
