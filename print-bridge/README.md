# e-NCF Print Bridge

Impresora virtual que intercepta trabajos de impresión, extrae datos de factura, los envía a la API e-NCF (DGII), y luego imprime en la impresora física con NCF + QR.

## Desarrollo con Docker

```bash
# Build y ejecutar
cd print-bridge
docker compose up --build

# El panel web queda disponible en http://localhost:9876
# Para simular un job de impresión, crea un archivo .txt en ./watch/
echo "RNC: 123456789
Cliente: Test
---------- DETALLE ----------
Producto A                  2   500.00
---------- TOTAL ----------
TOTAL: $1000.00" > watch/test-job.txt
```

## Ejecutar tests

```bash
docker compose run --rm print-bridge dotnet test /src/tests/PrintBridge.Tests
```

## Estructura

```
print-bridge/
├── src/PrintBridge.Core/      # Lógica: templates, API client, pipeline
├── src/PrintBridge.Api/       # Panel web + host (Kestrel en :9876)
├── tests/PrintBridge.Tests/   # Tests unitarios (xUnit)
├── config/                    # Config JSON + plantillas
│   ├── config.json
│   └── templates/
│       └── pos-generico.json
├── watch/                     # Carpeta de jobs simulados (Docker)
├── Dockerfile
└── docker-compose.yml
```

## Cómo funciona

1. Monitorea la carpeta `watch/` (en Docker) o el spooler de Windows (en producción)
2. Al detectar un job, aplica la plantilla configurada para extraer datos
3. Llama a `POST /api/v1/facturas` con los datos (autenticado con API Key)
4. Recibe el NCF asignado
5. En Windows: imprime en la impresora física con NCF + QR

## Configuración

Editar `config/config.json` o usar el panel web en http://localhost:9876
