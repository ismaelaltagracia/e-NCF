# Manual de Instalación y Configuración — e-NCF Print Bridge

---

## ¿Qué es el Print Bridge?

Es un programa que se instala en la computadora de tu negocio. Se registra como una impresora más en Windows. Cuando tu software (POS, Excel, sistema contable) "imprime" una factura en esa impresora virtual, el Print Bridge:

1. Captura el contenido impreso
2. Extrae los datos (RNC, cliente, ítems, totales)
3. Envía la factura a la DGII automáticamente
4. Recibe el número de comprobante (NCF)
5. Imprime en tu impresora real con el NCF y código QR

**No necesitas cambiar tu software actual.** Solo cambias la impresora seleccionada.

---

## Requisitos

- Windows 10 o Windows 11
- Conexión a internet
- Impresora física conectada (térmica o láser)
- Cuenta activa en e-NCF con una API Key generada

---

## Paso 1: Descargar e instalar

1. Descarga `e-NCF-PrintBridge-Setup.exe` desde tu panel e-NCF
2. Ejecuta el instalador como Administrador
3. Sigue las instrucciones (siguiente → siguiente → instalar)
4. Al terminar, verás el ícono 🟡 en la bandeja del sistema (junto al reloj)

El instalador:
- Registra la impresora virtual "e-NCF Print Bridge" en Windows
- Instala el servicio que corre en segundo plano
- Crea la carpeta de configuración en `C:\ProgramData\e-NCF-PrintBridge\`

---

## Paso 2: Generar la API Key

1. Ingresa a tu cuenta en el portal web e-NCF
2. Ve a **API Keys** en el menú lateral
3. Click en **"+ Nueva API Key"**
4. Ponle un nombre descriptivo (ej: "Print Bridge PC-Caja")
5. Copia la API Key generada (empieza con `sk_live_...`)

> ⚠️ La API Key solo se muestra una vez. Si la pierdes, genera una nueva.

---

## Paso 3: Configurar el Print Bridge

1. Click derecho en el ícono 🟡 de la bandeja del sistema
2. Selecciona **"Configuración"**
3. Se abre el navegador en `http://localhost:9876`

### 3.1 Conexión API
- Pega la API Key en el campo correspondiente
- Click **"Guardar y probar"**
- Si ves ✅ "Conexión verificada", está listo
- Si ves ❌, verifica que tienes internet y que la API Key es correcta

### 3.2 Seleccionar plantilla
Elige la plantilla según tu software:

| Tu software | Plantilla a elegir |
|-------------|-------------------|
| POS de caja (cualquier marca) | `pos-generico` |
| Facturas desde Excel | `excel-factura` |
| Mónica, Softland, ContaPyme, etc. | `sistema-contable` |

### 3.3 Impresora física
En Windows, asegúrate de que tu impresora real está instalada y funcionando. El Print Bridge la usará para la impresión final con NCF.

---

## Paso 4: Configurar tu software para usar el Print Bridge

En tu programa de facturación, cambia la impresora seleccionada a **"e-NCF Print Bridge"**.

### En Excel:
1. Archivo → Imprimir
2. En "Impresora", selecciona **"e-NCF Print Bridge"**
3. Imprimir

### En un POS:
1. Configuración → Impresoras
2. Cambiar impresora de facturas a **"e-NCF Print Bridge"**
3. Guardar

### En software contable:
1. Configuración → Dispositivos / Impresoras
2. Asignar **"e-NCF Print Bridge"** como impresora de facturas
3. Guardar

---

## Paso 5: Probar

1. Crea una factura de prueba en tu sistema
2. Imprímela seleccionando "e-NCF Print Bridge"
3. Revisa el panel web (localhost:9876):
   - Debe aparecer ✅ con el NCF asignado
4. Si todo funciona, la factura se imprime en tu impresora física con el NCF

---

## Indicadores de estado (ícono en la bandeja)

| Ícono | Significado |
|-------|-------------|
| 🟢 Verde | Todo funciona correctamente |
| 🟡 Amarillo | Modo contingencia (DGII caída, se encola) |
| 🔴 Rojo | Error (API Key inválida, sin internet) |

---

## Actualizar la API Key

Si revocaste la API Key desde el portal web:

1. Genera una nueva en el portal → API Keys
2. Abre Configuración del Print Bridge (click derecho → Configuración)
3. Pega la nueva key
4. Click "Guardar y probar"

No necesitas reiniciar el programa.

---

## Modo contingencia

Si la DGII no está disponible:

- El Print Bridge sigue capturando facturas
- Las guarda en una cola local
- Cada 60 segundos intenta reenviar
- Cuando la DGII vuelve, se envían automáticamente
- Mientras tanto, el recibo se imprime con la nota "PENDIENTE DE ENVÍO"

Puedes ver los pendientes en el panel web → sección "Cola de contingencia".

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| No aparece "e-NCF Print Bridge" como impresora | Reinstalar el programa como Administrador |
| Error 401 al probar conexión | La API Key es incorrecta o fue revocada. Genera una nueva. |
| La factura no se captura | Verifica que imprimiste en "e-NCF Print Bridge", no en otra impresora |
| No imprime en la física | Verifica que la impresora real está encendida y configurada en Windows |
| Ícono rojo | Revisa el panel web para ver el error específico |
| "Plantilla no encontrada" | Selecciona una plantilla válida en Configuración |

---

## Desinstalar

1. Panel de Control → Programas → Desinstalar
2. Buscar "e-NCF Print Bridge"
3. Desinstalar

Esto elimina el servicio, la impresora virtual, y la carpeta de configuración.
