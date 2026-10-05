#!/usr/bin/env bash
# Arranque de Rough Set Theory (Linux/macOS).
# - Instala uv si no esta presente.
# - Instala/actualiza las dependencias del proyecto (uv sync).
# - Levanta el servidor y abre una pestana del navegador automaticamente.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-8000}"
URL="http://127.0.0.1:${PORT}"

# 1) Asegurar que uv esta instalado.
if ! command -v uv >/dev/null 2>&1; then
    echo "[INFO] 'uv' no encontrado. Instalando..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

if ! command -v uv >/dev/null 2>&1; then
    echo "[ERROR] No se pudo instalar 'uv'. Instalalo manualmente: https://docs.astral.sh/uv/"
    exit 1
fi

# 2) Instalar/actualizar dependencias (crea/usa .venv segun uv.lock).
echo "[INFO] Instalando/actualizando dependencias con uv..."
uv sync

# 3) Lanzar el servidor en segundo plano.
echo "[INFO] Iniciando servidor en ${URL} ..."
uv run uvicorn app.main:app --port "$PORT" &
SERVER_PID=$!

cleanup() {
    kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# 4) Esperar a que el servidor responda y abrir el navegador.
echo "[INFO] Esperando a que el servidor este listo..."
for i in $(seq 1 40); do
    if curl -sSf "$URL" >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "$URL"
else
    echo "[INFO] Abre manualmente en tu navegador: $URL"
fi

# 5) Mantener el script en primer plano hasta que el servidor termine.
wait "$SERVER_PID"
