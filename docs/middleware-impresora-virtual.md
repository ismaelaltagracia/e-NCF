# Middleware Impresora Virtual — e-NCF Print Bridge

> Servicio de escritorio que actúa como impresora virtual: intercepta trabajos de impresión, extrae datos de factura, los envía a DGII vía la API e-NCF, y luego imprime en la impresora física con el comprobante electrónico.

---

## Concepto

```
[Sistema del cliente]        [Print Bridge]              [e-NCF API]        [Impresora física]
      │                           │                          │                      │
      │── Imprime factura ──────►│                          │                      │
      │   (impresora virtual)     │                          │                      │
      │                           │── Captura datos ────────►│                      │
      │                           │   (parsea según config)   │                      │
      │                           │                          │── Emite e-CF ──────►DGII
      │                           │                          │◄─ Respuesta (NCF) ──│
      │                           │◄─ NCF + Track ID ────────│                      │
      │                           │                          │                      │
      │                           │── Imprime en física ──────────────────────────►│
      │                           │   (con NCF + QR)                                │
      │                           │                                                 │
```

**Resultado:** El usuario imprime desde su sistema viejo (Excel, software contable, POS) y la factura sale con el e-NCF y QR de la DGII, sin cambiar nada en su software actual.

---

## Stack Técnico

| Componente | Tecnología | Por qué |
|------------|-----------|---------|
| Lenguaje   | C# (.NET 8) o Rust | Necesita acceso bajo nivel al spooler de Windows |
| Impresora virtual | Windows Print Monitor / Port Monitor | Se registra como impresora real en el sistema |
| Configuración | JSON local | Plantillas, mapeo de campos, impresoras |
| Comunicación API | HTTP/REST | Llama a la API e-NCF existente |
| Interfaz admin | Tray icon + web local (localhost:9876) | Configuración sin terminal |
| Instalador | MSI / NSIS | Instalación simple en Windows |
| OS Target | Windows 10/11 | 95% del mercado empresarial dominicano |

---

## Arquitectura

```
e-ncf-print-bridge/
├── src/
│   ├── Program.cs                    # Entry point + service host
│   ├── PrintMonitor/
│   │   ├── VirtualPrinterService.cs  # Registra la impresora virtual en Windows
│   │   ├── PrintJobWatcher.cs        # Monitorea el spooler por jobs nuevos
│   │   └── SpoolFileParser.cs        # Parsea el contenido del spool (EMF/RAW/TEXT)
│   ├── DataExtraction/
│   │   ├── TemplateEngine.cs         # Aplica plantilla JSON para extraer campos
│   │   ├── TextParser.cs             # Parsea texto plano (impresoras matriciales/POS)
│   │   ├── PdfParser.cs              # Parsea PDF renderizado
│   │   └── RegexExtractor.cs         # Extrae campos con regex configurable
│   ├── ApiClient/
│   │   ├── EncfApiClient.cs          # Cliente HTTP para la API e-NCF
│   │   ├── ApiKeyAuth.cs             # Agrega header X-API-Key en cada request
│   │   └── Models.cs                 # DTOs de request/response
│   ├── Printing/
│   │   ├── PhysicalPrinterService.cs # Envía a la impresora física
│   │   ├── ReceiptFormatter.cs       # Formatea el recibo con NCF + QR
│   │   └── QrGenerator.cs            # Genera QR para impresión
│   ├── Configuration/
│   │   ├── AppConfig.cs              # Modelo de configuración
│   │   ├── ConfigLoader.cs           # Carga y valida config.json
│   │   └── TemplateValidator.cs      # Valida plantillas
│   ├── TrayApp/
│   │   ├── SystemTrayIcon.cs         # Ícono en la bandeja del sistema
│   │   ├── StatusWindow.cs           # Ventana de estado (últimos jobs)
│   │   └── ConfigWebServer.cs        # Servidor local para config UI
│   └── Logging/
│       └── FileLogger.cs             # Log rotativo local
├── config/
│   ├── config.json                   # Configuración principal
│   ├── templates/
│   │   ├── pos-generico.json         # Plantilla para POS genérico
│   │   ├── excel-factura.json        # Plantilla para impresión desde Excel
│   │   └── sistema-contable.json     # Plantilla para software contable
│   └── README.md
├── installer/
│   └── setup.nsi                     # Script del instalador NSIS
├── tests/
│   ├── TemplateEngineTests.cs
│   ├── TextParserTests.cs
│   └── ApiClientTests.cs
└── docs/
    └── guia-instalacion.md
```

---

## Configuración Principal (`config.json`)

```json
{
  "api": {
    "base_url": "https://api.tudominio.com",
    "api_key": "TU_API_KEY_AQUI"
  },
  "impresora_virtual": {
    "nombre": "e-NCF Print Bridge",
    "puerto": "ENCF_PORT",
    "formato_captura": "text"
  },
  "impresora_fisica": {
    "nombre": "EPSON TM-T20III",
    "tipo": "termica",
    "ancho_mm": 80
  },
  "impresora_fisica_alternativa": {
    "nombre": "HP LaserJet Pro",
    "tipo": "carta",
    "usar_para": ["E31", "E41"]
  },
  "plantilla_activa": "pos-generico",
  "comportamiento": {
    "imprimir_despues_de_enviar": true,
    "agregar_qr": true,
    "agregar_ncf_al_recibo": true,
    "reintentar_si_falla_dgii": true,
    "max_reintentos": 3,
    "timeout_api_ms": 30000,
    "modo_contingencia": true,
    "log_level": "info"
  }
}
```

---

## Plantilla de Extracción (`templates/pos-generico.json`)

Define cómo extraer los datos de factura del texto capturado de la impresión:

```json
{
  "nombre": "POS Genérico",
  "version": "1.0",
  "formato_entrada": "text",
  "tipo_comprobante_default": "E32",
  "separador_items": "\n",
  "mapeo": {
    "rnc_receptor": {
      "tipo": "regex",
      "patron": "RNC[:\\s]*([0-9]{9,11})",
      "grupo": 1,
      "obligatorio": false,
      "default": ""
    },
    "nombre_receptor": {
      "tipo": "regex",
      "patron": "Cliente[:\\s]*(.*)",
      "grupo": 1,
      "obligatorio": false,
      "default": "Consumidor Final"
    },
    "tipo_comprobante": {
      "tipo": "regex",
      "patron": "Tipo[:\\s]*(E[0-9]{2})",
      "grupo": 1,
      "obligatorio": false,
      "default": "E32"
    }
  },
  "items": {
    "inicio": {
      "tipo": "regex",
      "patron": "---+\\s*DETALLE\\s*---+"
    },
    "fin": {
      "tipo": "regex",
      "patron": "---+\\s*(SUB)?TOTAL\\s*---+"
    },
    "patron_linea": "^(.{1,30})\\s+(\\d+)\\s+([\\d,.]+)\\s+([\\d,.]+)$",
    "campos_linea": {
      "descripcion": 1,
      "cantidad": 2,
      "precio_unitario": 3,
      "subtotal_linea": 4
    }
  },
  "totales": {
    "subtotal": {
      "tipo": "regex",
      "patron": "SUBTOTAL[:\\s]*\\$?([\\d,.]+)"
    },
    "itbis": {
      "tipo": "regex",
      "patron": "ITBIS[:\\s]*\\$?([\\d,.]+)"
    },
    "total": {
      "tipo": "regex",
      "patron": "TOTAL[:\\s]*\\$?([\\d,.]+)"
    }
  },
  "tasa_itbis_default": 18
}
```

### Plantilla Excel (`templates/excel-factura.json`)

```json
{
  "nombre": "Factura desde Excel",
  "version": "1.0",
  "formato_entrada": "text",
  "tipo_comprobante_default": "E31",
  "mapeo": {
    "rnc_receptor": {
      "tipo": "posicion",
      "linea": 5,
      "columna_inicio": 15,
      "columna_fin": 30
    },
    "nombre_receptor": {
      "tipo": "posicion",
      "linea": 6,
      "columna_inicio": 15,
      "columna_fin": 50
    }
  },
  "items": {
    "inicio": { "tipo": "linea_numero", "valor": 12 },
    "fin": { "tipo": "regex", "patron": "^\\s*$" },
    "patron_linea": "^(.{1,40})\\s+(\\d+)\\s+([\\d,.]+)\\s+([\\d,.]+)\\s+([\\d,.]+)$",
    "campos_linea": {
      "descripcion": 1,
      "cantidad": 2,
      "precio_unitario": 3,
      "itbis": 4,
      "subtotal_linea": 5
    }
  },
  "totales": {
    "subtotal": { "tipo": "regex", "patron": "Sub-?total[:\\s]*\\$?([\\d,.]+)" },
    "itbis": { "tipo": "regex", "patron": "ITBIS|IVA[:\\s]*\\$?([\\d,.]+)" },
    "total": { "tipo": "regex", "patron": "Total[:\\s]*\\$?([\\d,.]+)" }
  },
  "tasa_itbis_default": 18
}
```

---

## Flujo de un Trabajo de Impresión

```
1. Usuario imprime desde su software (Excel, POS, contable)
         ↓
2. Windows envía el job a "e-NCF Print Bridge" (la impresora virtual)
         ↓
3. PrintJobWatcher detecta nuevo job en el spooler
         ↓
4. SpoolFileParser extrae el contenido como texto
         ↓
5. TemplateEngine aplica la plantilla activa (config.json → plantilla_activa)
         ↓
6. RegexExtractor extrae: RNC receptor, nombre, items, totales
         ↓
7. EncfApiClient llama a POST /api/v1/facturas con los datos extraídos
   (autenticado con header X-API-Key)
         ↓
8. API responde con: { id, e_ncf, track_id, estado_dgii }
         ↓
9. ReceiptFormatter genera el recibo final:
   - Contenido original + NCF asignado + QR de verificación DGII
         ↓
10. PhysicalPrinterService envía a la impresora física configurada
         ↓
11. El recibo sale impreso con NCF + QR ✓
```

---

## Múltiples Impresoras

El sistema soporta rutear a diferentes impresoras según el tipo de comprobante:

```json
{
  "ruteo_impresoras": [
    {
      "tipos": ["E32"],
      "impresora": "EPSON TM-T20III",
      "formato": "termica_80mm"
    },
    {
      "tipos": ["E31", "E33", "E34", "E41"],
      "impresora": "HP LaserJet Pro",
      "formato": "carta"
    },
    {
      "tipos": ["*"],
      "impresora": "EPSON TM-T20III",
      "formato": "termica_80mm"
    }
  ]
}
```

- `E32` (consumo) → impresora térmica (ticket POS)
- `E31` (crédito fiscal) → impresora láser (carta con membrete)
- `*` → fallback a la primera configurada

---

## Modo Contingencia

Si la API e-NCF no responde (DGII caída):

1. El sistema imprime el recibo SIN NCF con marca "PENDIENTE DE ENVÍO"
2. Guarda el job en cola local (`pending_jobs/`)
3. Cada 60 segundos intenta reenviar los pendientes
4. Cuando la API responde, actualiza el registro y logea
5. Opcionalmente re-imprime con el NCF asignado

---

## Interfaz del System Tray

Al instalarse, el Print Bridge corre como servicio de Windows con un ícono en la bandeja del sistema:

**Click derecho → Menú:**
- ✅ Estado: Conectado a e-NCF API
- 📊 Últimos 10 trabajos (ver estado)
- ⚙️ Configuración (abre localhost:9876 en el navegador)
- 🔄 Reconectar API
- 📋 Ver logs
- ❌ Salir

**Indicador visual:**
- 🟢 Verde = conectado, todo OK
- 🟡 Amarillo = modo contingencia (DGII caída)
- 🔴 Rojo = error (no puede conectar a la API, impresora offline)

---

## Panel de Configuración Web (localhost:9876)

Interfaz web local para configurar sin tocar JSON manualmente:

- **Conexión API:** URL base del servidor, campo para ingresar/actualizar la API Key en cualquier momento, botón "Probar conexión" que valida contra la API
- **Actualizar API Key:** Si la key se revocó o rotó, el usuario pega la nueva aquí y el servicio se reconecta sin reiniciar
- **Impresora virtual:** nombre a mostrar en Windows
- **Impresoras físicas:** listar las disponibles, asignar por tipo de comprobante
- **Plantillas:** seleccionar activa, previsualizar mapeo, probar con texto de ejemplo
- **Cola pendiente:** ver trabajos en cola, reenviar manualmente
- **Logs:** últimos 100 registros filtrable por nivel

Si el Print Bridge detecta un 401 (API Key inválida/revocada), muestra notificación en el tray icon y cambia el indicador a 🔴 rojo con el mensaje "API Key inválida — actualícela desde Configuración".

---

## Instalación

### Requisitos
- Windows 10/11
- .NET 8 Runtime (incluido en el instalador)
- API Key generada desde el portal e-NCF (sección API Keys)

### Proceso
1. Ejecutar `e-NCF-PrintBridge-Setup.exe`
2. El instalador:
   - Instala el servicio Windows
   - Registra la impresora virtual "e-NCF Print Bridge"
   - Crea directorio de config en `C:\ProgramData\e-NCF-PrintBridge\`
   - Agrega ícono en bandeja del sistema
3. Abrir panel de configuración (localhost:9876)
4. Pegar la API Key generada desde el portal e-NCF
5. Seleccionar impresora física
6. Seleccionar plantilla según el software del cliente
7. Probar con una impresión de prueba

---

## Casos de Uso

| Software del cliente | Plantilla | Impresora física |
|---------------------|-----------|-----------------|
| POS genérico (texto) | pos-generico.json | Térmica 80mm |
| Excel (factura impresa) | excel-factura.json | Láser carta |
| Software contable (Mónica, Softland) | sistema-contable.json | Según tipo |
| Sistema propio sin API | Personalizada | Según config |

---

## Seguridad

- Credenciales almacenadas encriptadas (DPAPI de Windows)
- La API Key se guarda encriptada localmente — nunca en texto plano
- Comunicación con API siempre por HTTPS
- No almacena datos de facturas localmente (solo cola temporal en contingencia)
- Auto-borrado de cola pendiente tras envío exitoso
- Log no incluye payloads completos (solo IDs y estados)

---

## Fases de Desarrollo

### Fase 1 — MVP (4-5 semanas)
- [ ] Print Monitor que captura jobs del spooler
- [ ] Parser de texto plano
- [ ] Template engine con regex
- [ ] Cliente API (login + crear factura)
- [ ] Envío a impresora física
- [ ] Config JSON básico
- [ ] Log local

### Fase 2 — UX (2-3 semanas)
- [ ] System tray icon con menú
- [ ] Panel web de configuración (localhost)
- [ ] Instalador MSI/NSIS
- [ ] Modo contingencia (cola local)
- [ ] Múltiples impresoras por tipo

### Fase 3 — Templates avanzados (2 semanas)
- [ ] Parser PDF (para software que imprime PDF)
- [ ] Template editor visual en panel web
- [ ] Template marketplace (compartir configuraciones entre clientes)
- [ ] Auto-detección de formato

### Fase 4 — Producción (1 semana)
- [ ] Pruebas con 5+ software reales (POS, Excel, Mónica)
- [ ] Documentación de instalación
- [ ] Auto-updater
- [ ] Telemetría anónima (errores)

**Total estimado: 9-11 semanas**

---

## Modelo de Negocio del Print Bridge

| Opción | Precio |
|--------|--------|
| Incluido gratis con plan Profesional+ | $0 (atrae clientes al plan alto) |
| Venta standalone | RD$3,000-5,000 licencia única |
| Soporte de instalación remota | RD$2,000 por PC |

**Ventaja competitiva:** Ningún competidor en RD ofrece esto. Es el puente perfecto para empresas que NO quieren cambiar su software pero SÍ deben cumplir con la DGII.
