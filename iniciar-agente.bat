@echo off
title Kablam Print Agent
echo ====================================
echo   🖨️  Kablam Print Agent v2.0
echo ====================================
echo.
echo Iniciando agente de impresion...
echo.
echo Abri http://localhost:9102 en tu navegador
echo para iniciar sesion.
echo.
echo IMPORTANTE: La primera vez instalá Node.js
echo desde https://nodejs.org (LTS)
echo.
echo Para cerrar, cerra esta ventana.
echo ====================================
echo.

cd /d "%~dp0"
node kablam-print-agent.js
pause
