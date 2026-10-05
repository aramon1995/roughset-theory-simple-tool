@echo off
REM Arranque de Rough Set Theory (Windows).
REM Doble click: instala uv y las dependencias si faltan, levanta el
REM servidor y abre una pestana del navegador automaticamente.
setlocal

cd /d "%~dp0"

set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%"

REM 1) Asegurar que uv esta instalado.
where uv >nul 2>nul
if errorlevel 1 (
    echo [INFO] 'uv' no encontrado. Instalando...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
    where uv >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] No se pudo instalar 'uv'. Instalalo manualmente: https://docs.astral.sh/uv/
        pause
        exit /b 1
    )
)

REM 2) Instalar/actualizar dependencias (crea/usa .venv segun uv.lock).
echo [INFO] Instalando/actualizando dependencias con uv...
uv sync
if errorlevel 1 (
    echo [ERROR] Fallo "uv sync".
    pause
    exit /b 1
)

REM 3) Lanzar en segundo plano un helper que espera al servidor y abre el navegador.
echo [INFO] Se abrira el navegador automaticamente cuando el servidor este listo...
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open_browser.ps1" -Url "%URL%"

REM 4) Iniciar el servidor en primer plano (cerrar esta ventana lo detiene).
echo [INFO] Iniciando servidor en %URL% (no cierres esta ventana)...
uv run uvicorn app.main:app --port %PORT%

pause
