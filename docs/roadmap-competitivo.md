# Roadmap Competitivo — e-NCF

> Funcionalidades necesarias para ser la plataforma de facturación electrónica más completa del mercado dominicano.

---

## Estado actual (ya implementado)

- [x] Emisión de e-CF (tipos 31, 32, 33, 34, 41, 43, 44, 45, 46, 47)
- [x] Firma digital con certificado P12
- [x] Envío a DGII y recepción de respuesta
- [x] Recepción de e-CF (aprobación/rechazo comercial)
- [x] Gestión de secuencias NCF automáticas
- [x] Catálogo de clientes y productos
- [x] API REST con autenticación por API Keys
- [x] Multi-tenant (múltiples empresas)
- [x] Portal web con UI completa
- [x] Self-hosted con Docker
- [x] Gestión de usuarios y roles por empresa
- [x] Control de planes y límites
- [x] Validación de RNC contra padrón DGII
- [x] Certificación en ambiente TesteCF

---

## Fase 1 — Paridad competitiva (Prioridad Alta)

### 1.1 Reportes fiscales (606 / 607 / 608)

- [ ] Generación automática del formato 606 (compras y gastos)
- [ ] Generación automática del formato 607 (ventas de bienes y servicios)
- [ ] Generación automática del formato 608 (comprobantes anulados)
- [ ] Exportación en formato TXT según especificación DGII
- [ ] Vista previa en UI antes de descargar
- [ ] Combinación de compras electrónicas (e-CF recibidos) + manuales (NCF físico)
- [ ] Filtros por periodo mensual y tipo de comprobante

### 1.2 Registro de compras no electrónicas

- [ ] Formulario para registrar NCF físicos recibidos de proveedores no electrónicos
- [ ] Validación de NCF contra servicio DGII
- [ ] Inclusión automática en el 606
- [ ] Adjuntar imagen/PDF de la factura física

### 1.3 Modo contingencia

- [ ] Detección automática de caída del servicio DGII
- [ ] Emisión en modo contingencia con e-NCF reservado
- [ ] Cola de reenvío automático cuando el servicio se restaure
- [ ] Indicador visual en UI del estado de conexión DGII
- [ ] Representación impresa con marca "Emitido en contingencia"
- [ ] Reintento con backoff exponencial

### 1.4 Representación impresa (PDF)

- [ ] Generación de PDF de factura con formato profesional
- [ ] Código QR con URL de verificación DGII
- [ ] Logo de la empresa configurable
- [ ] Plantillas personalizables (al menos 2-3 diseños)
- [ ] Descarga desde UI y envío por email
- [ ] PDF en respuesta de API (`GET /facturas/:id/pdf`)

### 1.5 Notificaciones

- [ ] Email al emisor cuando DGII aprueba/rechaza el e-CF
- [ ] Email al receptor con PDF adjunto de la factura
- [ ] Alerta por email cuando el certificado está por vencer (30, 15, 7 días)
- [ ] Alerta cuando se alcanza el 80% del límite de facturas del plan
- [ ] Webhook configurable para eventos (factura aprobada, rechazada, anulada)

### 1.6 Facturación por carga de archivo (batch)

- [ ] Subida de CSV o Excel con facturas a emitir
- [ ] Plantilla descargable con columnas predefinidas (RNC comprador, nombre, tipo e-CF, descripción ítems, cantidad, precio, ITBIS)
- [ ] Validación fila por fila: RNC existe, montos correctos, secuencias disponibles, campos obligatorios
- [ ] Preview en UI con errores marcados por fila (rojo = error, verde = válido)
- [ ] Emisión en lote tras confirmación del usuario
- [ ] Progreso en tiempo real (X de N procesadas)
- [ ] Reporte final descargable: facturas aprobadas, rechazadas por DGII, errores de validación
- [ ] Soporte vía API: `POST /api/v1/facturas/batch` con archivo adjunto
- [ ] Límite configurable por plan (ej: máximo 500 facturas por archivo)

---

## Fase 2 — Diferenciación (Prioridad Media)

### 2.1 Dashboard para contadores

- [ ] Rol "contador" con acceso de solo lectura
- [ ] Vista resumen: ventas, compras, ITBIS cobrado vs pagado
- [ ] Descarga de 606/607/608 sin acceso a configuración
- [ ] Exportación de movimientos en formato Excel/CSV
- [ ] Reporte de conciliación: facturas emitidas vs aprobadas por DGII

### 2.2 Integración WhatsApp / SMS

- [ ] Envío de PDF de factura por WhatsApp Business API
- [ ] Notificación al cliente cuando se emite su factura
- [ ] Recordatorio de facturas pendientes de pago (opcional)

### 2.3 Portal del receptor

- [ ] URL pública donde el receptor puede ver/descargar sus facturas
- [ ] Verificación por RNC + código
- [ ] Aprobar/rechazar comercialmente sin tener cuenta en el sistema
- [ ] Historial de facturas recibidas

### 2.4 Facturación recurrente

- [ ] Programar facturas que se emitan automáticamente (mensual, quincenal, etc.)
- [ ] Plantillas de factura reutilizables
- [ ] Pausa/cancelación de suscripción de facturación
- [ ] Notificación antes de emitir la factura recurrente

### 2.5 Multi-moneda

- [ ] Soporte para facturación en USD y EUR
- [ ] Tasa de cambio automática desde Banco Central RD
- [ ] Conversión a DOP para fines fiscales según normativa DGII
- [ ] Historial de tasas utilizadas

### 2.6 Integraciones POS

- [ ] SDK/biblioteca JavaScript para integración con puntos de venta
- [ ] Endpoint optimizado para alto volumen (facturación tipo B02 consumo)
- [ ] Modo batch: enviar múltiples facturas en una sola petición
- [ ] Documentación y ejemplos para POS populares en RD

---

## Fase 3 — Liderazgo de mercado (Prioridad a futuro)

### 3.1 Módulo contable básico

- [ ] Plan de cuentas dominicano predefinido
- [ ] Asientos automáticos por cada factura emitida/recibida
- [ ] Balance de comprobación
- [ ] Estado de resultados
- [ ] Mayor general
- [ ] No pretende reemplazar un ERP — complementa para PyMEs sin sistema contable

### 3.2 Reportes avanzados y BI

- [ ] Dashboard con gráficos de tendencia (ventas mensuales, top clientes)
- [ ] Análisis de ITBIS: cobrado vs pagado, saldo a favor
- [ ] Reporte de antigüedad de cuentas por cobrar
- [ ] Exportación programada por email (reporte semanal automático)
- [ ] Comparativo año contra año

### 3.3 Marketplace de integraciones

- [ ] Conectores pre-construidos: QuickBooks, Xero, Odoo, SAP Business One
- [ ] Zapier/Make integration para workflows sin código
- [ ] API de webhooks bidireccional
- [ ] Documentación OpenAPI 3.1 interactiva (Swagger UI)

### 3.4 App móvil

- [ ] App React Native (iOS + Android)
- [ ] Emitir facturas rápidas desde el teléfono
- [ ] Notificaciones push de aprobación DGII
- [ ] Escanear NCF físico con cámara para registro de compras
- [ ] Dashboard resumido

### 3.5 Firma electrónica avanzada

- [ ] Soporte para múltiples certificados por empresa
- [ ] Renovación automática con proveedores de certificados locales
- [ ] HSM (Hardware Security Module) para empresas que lo requieran
- [ ] Auditoría de uso del certificado (quién firmó qué y cuándo)

### 3.6 Cumplimiento ampliado

- [ ] Generación de declaración IT-1 (borrador)
- [ ] Formato IR-17 (retenciones)
- [ ] Formato 609 (pagos al exterior)
- [ ] Calendario fiscal con recordatorios de vencimientos
- [ ] Validación cruzada: 607 vs facturas emitidas, 606 vs facturas recibidas

---

## Priorización sugerida

| Fase | Tiempo estimado | Impacto comercial |
|------|----------------|-------------------|
| 1.4 PDF con QR | 1-2 semanas | Alto — es lo que el usuario entrega al cliente |
| 1.1 Reportes 606/607 | 2-3 semanas | Alto — necesario para cualquier empresa |
| 1.3 Modo contingencia | 2 semanas | Alto — sin esto no puedes facturar si DGII cae |
| 1.6 Facturación por archivo | 2 semanas | Alto — clave para migración y empresas sin API |
| 1.5 Notificaciones email | 1 semana | Medio-alto — mejora experiencia |
| 1.2 Compras manuales | 1 semana | Medio — necesario para 606 completo |
| 2.1 Rol contador | 1-2 semanas | Medio — diferenciación |
| 2.4 Facturación recurrente | 2 semanas | Medio — atrae SaaS y servicios |
| 2.3 Portal receptor | 2-3 semanas | Medio — diferenciador único |
| 2.5 Multi-moneda | 1 semana | Medio — muchas empresas facturan en USD |

---

## Ventaja competitiva final

Al completar las Fases 1 y 2, e-NCF sería la **única plataforma dominicana** que ofrece:

1. Portal web completo + API REST (no solo uno de los dos)
2. Self-hosted con Docker O cloud managed
3. Sin costo por factura (modelo por plan, no por transacción)
4. Reportes fiscales integrados (606/607/608)
5. Portal de receptor sin cuenta
6. Facturación recurrente
7. Modo contingencia real
8. Multi-moneda con tasa automática del Banco Central

Ningún competidor actual en RD cubre todos estos puntos simultáneamente.
