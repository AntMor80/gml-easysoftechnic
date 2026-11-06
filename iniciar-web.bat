@echo off
chcp 65001 >nul
title GML EasySoftechnic - web
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encuentra Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo.
  start https://nodejs.org/es
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias por primera vez, puede tardar unos minutos...
  call npm install
  if errorlevel 1 ( pause ^& exit /b 1 )
)
echo Abriendo la aplicacion en el navegador. Cierra esta ventana para detenerla.
call npm run web
pause
