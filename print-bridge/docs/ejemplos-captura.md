# Ejemplos de Captura de Datos

> Estos son ejemplos reales de lo que el Print Bridge recibe cuando un software imprime una factura. Cada ejemplo muestra el texto capturado y qué datos extrae la plantilla.

---

## Ejemplo 1: POS de farmacia (plantilla: `pos-generico`)

### Texto capturado de la impresión:

```
================================
   FARMACIA SAN JOSE S.R.L.
   RNC Emisor: 101234567
   Av. 27 de Febrero #52
   Santo Domingo, D.N.
================================
Fecha: 29/07/2026  Hora: 14:32
Cajero: María
RNC: 131456789
Cliente: DISTRIBUIDORA MÉDICA DEL CARIBE

---------- DETALLE ----------
Acetaminofén 500mg         2   150.00
Ibuprofeno 400mg           3   85.50
Omeprazol 20mg             1   220.00
Vitamina C 1000mg          5   45.00
Alcohol 70% 500ml          2   175.00
---------- TOTAL ----------
SUBTOTAL: $1,101.50
ITBIS 18%: $198.27
TOTAL: $1,299.77

Forma de pago: Efectivo
Cambio: $200.23
================================
     ¡Gracias por su compra!
================================
```

### Datos extraídos:

| Campo | Valor | Cómo lo extrajo |
|-------|-------|----------------|
| rnc_receptor | `131456789` | Regex: `RNC[:\s]*(\d{9,11})` |
| nombre_receptor | `DISTRIBUIDORA MÉDICA DEL CARIBE` | Regex: `Cliente[:\s]*(.*)` |
| tipo_comprobante | `E32` | Default (no se detectó tipo) |
| Items | 5 ítems | Regex entre DETALLE y TOTAL |
| Total | 1,299.77 | Regex: `TOTAL[:\s]*\$?([\d,.]+)` |

### Resultado de la API:
```json
{
  "id": "f47ac10b-...",
  "e_ncf": "E320010100000015",
  "track_id": "TRK-2026072914320001",
  "estado_dgii": "aceptado"
}
```

---

## Ejemplo 2: Factura impresa desde Excel (plantilla: `excel-factura`)

### Texto capturado:

```
                    FACTURA DE VENTA

Empresa: CONSULTORES TECH RD S.R.L.
RNC Emisor: 101567890
Dirección: C/ El Conde #15, Zona Colonial

Factura No: FAC-2026-0342
Fecha: 29 de julio de 2026

Cliente: INVERSIONES GRUPO NORTE SAS
RNC: 130987654

Descripción                         Cantidad    Precio Unit.    Total
------------------------------------------------------------------------
Consultoría sistemas (horas)             40       2,500.00    100,000.00
Licencia software anual                   1      15,000.00     15,000.00
Soporte técnico mensual (3 meses)         3       5,000.00     15,000.00
Capacitación personal (días)              2       8,000.00     16,000.00

Sub-Total:                                                   146,000.00
ITBIS 18%:                                                    26,280.00
Total General:                                               172,280.00

Condiciones: Crédito 30 días
Cuenta: Banreservas 010-123456-7
```

### Datos extraídos:

| Campo | Valor | Cómo lo extrajo |
|-------|-------|----------------|
| rnc_receptor | `130987654` | Regex: `RNC[:\s]*(\d{9,11})` |
| nombre_receptor | `INVERSIONES GRUPO NORTE SAS` | Regex: `Cliente[:\s]*(.*)` |
| tipo_comprobante | `E31` | Default de la plantilla |
| Items | 4 ítems | Regex de patron_linea |
| Subtotal | 146,000.00 | Regex: `Sub-?Total[:\s]*\$?([\d,.]+)` |
| ITBIS | 26,280.00 | Regex: `ITBIS[:\s]*\$?([\d,.]+)` |
| Total | 172,280.00 | Regex: `Total General[:\s]*\$?([\d,.]+)` |

---

## Ejemplo 3: Software contable (plantilla: `sistema-contable`)

### Texto capturado:

```
╔══════════════════════════════════════════════════════╗
║  IMPORTADORA DOMINICANA DE EQUIPOS S.A.            ║
║  RNC: 101890123                                     ║
║  Autopista Duarte Km 12, Santiago                   ║
╠══════════════════════════════════════════════════════╣
║  FACTURA DE CRÉDITO FISCAL                         ║
║  Tipo: E31                   No: 000456            ║
║  Fecha: 2026-07-29           Vence: 2026-08-28     ║
╠══════════════════════════════════════════════════════╣
║  A: FERRETERÍA EL CONSTRUCTOR SRL                  ║
║  NIF: 101345678                                    ║
║  Dir: Av. Independencia #89, La Vega               ║
╠══════════════════════════════════════════════════════╣

Código  Descripción                      Cant   P.Unitario    Total
------  -------------------------------- ----   ----------    --------
EQ-001  Taladro industrial 1/2"            5     4,500.00    22,500.00
EQ-015  Sierra circular 7-1/4"            3     6,200.00    18,600.00
EQ-030  Compresor 50L 2HP                 2    12,000.00    24,000.00
MT-100  Juego llaves combinadas          10       850.00     8,500.00
MT-205  Cinta métrica 5m                 20       125.00     2,500.00

                                          Sub-Total:        76,100.00
                                          ITBIS 18%:        13,698.00
                                          TOTAL:            89,798.00

Observaciones: Entrega en almacén del cliente
Vendedor: Roberto Martínez
```

### Datos extraídos:

| Campo | Valor | Cómo lo extrajo |
|-------|-------|----------------|
| rnc_receptor | `101345678` | Regex: `NIF[:\s./]*(\d{9,11})` |
| nombre_receptor | `FERRETERÍA EL CONSTRUCTOR SRL` | Regex: `A[:\s]*(.*)` |
| tipo_comprobante | `E31` | Regex: `Tipo[:\s]*(E\d{2})` |
| Items | 5 ítems | Patrón entre header y Sub-Total |
| Total | 89,798.00 | Regex: `TOTAL[:\s]*\$?\s*([\d,.]+)` |

---

## Ejemplo 4: Recibo simple de colmado (plantilla: `pos-generico`)

### Texto capturado:

```
COLMADO LA ESQUINA
Tel: 809-555-1234

Fecha: 29/07/2026

---------- DETALLE ----------
Arroz 5lb                   2   225.00
Habichuelas rojas           3   75.00
Aceite vegetal 1L           1   195.00
Leche evaporada             4   65.00
Pan sobao                   2   50.00
---------- TOTAL ----------
SUBTOTAL: $1,020.00
ITBIS: $0.00
TOTAL: $1,020.00

Gracias por su compra!
```

### Datos extraídos:

| Campo | Valor | Cómo lo extrajo |
|-------|-------|----------------|
| rnc_receptor | *(vacío)* | No hay RNC → factura de consumo final |
| nombre_receptor | `Consumidor Final` | Default |
| tipo_comprobante | `E32` | Default (consumo) |
| Items | 5 ítems | Entre DETALLE y TOTAL |
| ITBIS | 0.00 | Productos exentos |
| Total | 1,020.00 | Regex |

> **Nota:** Cuando no hay RNC del comprador, se emite como E32 (factura de consumo) a nombre de "Consumidor Final". Esto es válido según la normativa DGII.

---

## Ejemplo 5: Nota de crédito desde sistema (plantilla: `sistema-contable`)

### Texto capturado:

```
═══ NOTA DE CRÉDITO ═══
Empresa: SERVICIOS INTEGRALES RD SRL
RNC Emisor: 101678901

Tipo: E34
NCF Original: E310010100000008
Fecha: 2026-07-29

Cliente: CORP. DE ALIMENTOS TROPICALES
RNC: 131234567

Motivo: Devolución parcial de mercancía

Código  Descripción                Cant    Precio      Total
------  -------------------------  ----    ---------   ---------
PR-050  Aceite de coco 500ml        20      350.00     7,000.00

                            Sub-Total:                 7,000.00
                            ITBIS 18%:                 1,260.00
                            TOTAL:                     8,260.00
```

### Datos extraídos:

| Campo | Valor |
|-------|-------|
| rnc_receptor | `131234567` |
| nombre_receptor | `CORP. DE ALIMENTOS TROPICALES` |
| tipo_comprobante | `E34` (Nota de Crédito) |
| Items | 1 ítem |
| Total | 8,260.00 |

---

## Cómo crear una plantilla nueva

Si tu software imprime en un formato que no coincide con las plantillas incluidas:

1. Imprime una factura desde tu software en la impresora **"e-NCF Print Bridge"**
2. Abre la carpeta `C:\ProgramData\e-NCF-PrintBridge\watch\processed\`
3. Busca el último archivo `.txt` — ese es el texto capturado
4. Usa ese texto como referencia para crear los patrones regex
5. Crea un archivo JSON en `config\templates\` con tu plantilla
6. En el panel web, selecciona tu nueva plantilla

### Estructura mínima de una plantilla:

```json
{
  "nombre": "Mi Software",
  "version": "1.0",
  "formato_entrada": "text",
  "tipo_comprobante_default": "E31",
  "mapeo": {
    "rnc_receptor": {
      "tipo": "regex",
      "patron": "TU_PATRON_AQUI_(\\d{9,11})",
      "grupo": 1,
      "default": ""
    },
    "nombre_receptor": {
      "tipo": "regex",
      "patron": "TU_PATRON_AQUI_(.*)",
      "grupo": 1,
      "default": "Consumidor Final"
    }
  },
  "items": {
    "inicio": { "tipo": "regex", "patron": "PATRON_INICIO_ITEMS" },
    "fin": { "tipo": "regex", "patron": "PATRON_FIN_ITEMS" },
    "patron_linea": "^(.{1,30})\\s+(\\d+)\\s+([\\d,.]+)$",
    "campos_linea": {
      "descripcion": 1,
      "cantidad": 2,
      "precio_unitario": 3
    }
  },
  "totales": {
    "total": { "tipo": "regex", "patron": "TOTAL.*?([\\d,.]+)" }
  },
  "tasa_itbis_default": 18
}
```

### Tips para los regex:
- `[:\s]*` captura dos puntos o espacios opcionales
- `(\d{9,11})` captura exactamente un RNC (9 u 11 dígitos)
- `(.*)` captura todo el resto de la línea
- `[\d,.]+` captura números con comas y puntos decimales
- Usa `\\` para escapar backslash en JSON

---

## Archivos de ejemplo para pruebas

En la carpeta `print-bridge/watch/` puedes colocar estos archivos `.txt` para simular impresiones y probar la extracción sin impresora real.
