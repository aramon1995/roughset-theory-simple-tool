# Espera a que el servidor responda en $Url y abre el navegador predeterminado.
# Usado por start.bat, no necesita ejecutarse manualmente.
param(
    [string]$Url = "http://127.0.0.1:8000",
    [int]$MaxTries = 60
)

for ($i = 0; $i -lt $MaxTries; $i++) {
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null
        Start-Process $Url
        exit 0
    } catch {
        Start-Sleep -Seconds 1
    }
}
