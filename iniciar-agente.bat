@echo off
title Kablam Print Agent
echo ====================================
echo   🖨️  Kablam Print Agent
echo ====================================
echo.
echo Iniciando agente de impresion...
echo.
echo Abri http://localhost:9102 en tu navegador
echo para iniciar sesion.
echo.
echo Para cerrar, cerra esta ventana.
echo ====================================
echo.

node "%~dp0kablam-print-agent.js"
pause
