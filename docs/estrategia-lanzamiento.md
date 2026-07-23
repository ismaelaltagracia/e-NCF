# Estrategia de Lanzamiento — e-NCF

> Plan para salir al mercado como la plataforma de facturación electrónica más accesible de RD.

---

## Parte 1: Qué implementar antes de lanzar (MVP de lanzamiento)

### Ya tenemos (listo)
- ✅ Emisión de todos los tipos de e-CF
- ✅ Firma digital y envío a DGII
- ✅ Recepción y aprobación/rechazo de e-CF
- ✅ Portal web completo con UI
- ✅ API REST con API Keys
- ✅ Gestión de secuencias automáticas
- ✅ Catálogo de clientes y productos
- ✅ Multi-tenant y control de planes
- ✅ Certificación en TesteCF

### Debemos implementar antes de lanzar

| # | Feature | Por qué es bloqueante | Esfuerzo |
|---|---------|----------------------|----------|
| 1 | **PDF de factura con QR** | Sin esto no puedes entregar nada al cliente final. Es lo visible. | 1-2 semanas |
| 2 | **Email automático al receptor** | El receptor necesita recibir su factura. Sin email, es manual. | 3-5 días |
| 3 | **Facturación por carga de archivo** | 80% de PyMEs no van a usar API ni formularios uno por uno. | 1-2 semanas |
| 4 | **Modo contingencia básico** | Si DGII cae (pasa seguido), tus clientes no pueden facturar. Deal-breaker. | 1-2 semanas |
| 5 | **Landing page pública** | Necesitas un sitio donde la gente entienda qué es, cuánto cuesta, y se registre. | 3-5 días |

**Total estimado: 5-7 semanas de desarrollo.**

### Puede esperar al post-lanzamiento
- Reportes 606/607/608 (importante pero no bloquea facturar)
- Dashboard para contadores
- WhatsApp
- Facturación recurrente
- Multi-moneda

---

## Parte 2: Campaña de lanzamiento

### Público objetivo (en orden de prioridad)

**Segmento A — PyMEs obligadas (noviembre 2026)**
- Pequeñas y medianas empresas del 3er grupo de obligatoriedad DGII
- No tienen sistema, están buscando solución urgente
- Mensaje: "Cumple con la ley sin complicarte"

**Segmento B — Contadores y firmas contables**
- Manejan 10-50 empresas cada uno
- Buscan una herramienta para sus clientes
- Mensaje: "Una plataforma para todos tus clientes"

**Segmento C — Desarrolladores e integradores**
- Empresas con software propio que necesitan emitir e-CF
- Quieren API, no portal
- Mensaje: "API REST lista. Integra en una tarde."

---

### Mensajes clave

**Headline principal:**
> "Factura electrónica sin complicaciones. Sin contratos. Sin costo por factura."

**Para PyMEs:**
> "¿La DGII te obliga a facturar electrónicamente? Regístrate en 5 minutos y emite tu primera factura hoy."

**Para contadores:**
> "Gestiona la facturación electrónica de todos tus clientes desde un solo lugar."

**Para devs:**
> "API REST documentada. Firma digital incluida. Despliega con Docker o usa nuestro cloud."

---

### Pricing recomendado

| Plan | Precio/mes | Facturas/mes | Incluye |
|------|-----------|-------------|---------|
| **Inicio** | Gratis | 20 | Portal web, 1 usuario, certificación TesteCF |
| **PyME** | RD$ 1,500 (~US$25) | 200 | Portal + API, 3 usuarios, email automático, PDF |
| **Profesional** | RD$ 3,500 (~US$60) | 1,000 | Todo + API Keys ilimitadas, 10 usuarios, soporte prioritario |
| **Contador** | RD$ 5,000 (~US$85) | 500/empresa | Hasta 10 empresas, rol contador, reportes |
| **Enterprise** | Contactar | Ilimitadas | Self-hosted, SLA, soporte dedicado |

**Diferenciador de precio vs. competencia:**
- Alanube/FiscaliaCore cobran por factura (RD$5-15/factura)
- GuruSoft cobra licencia + implementación (RD$50,000+)
- e-NCF cobra por plan fijo. 200 facturas por RD$1,500 es ~RD$7.5/factura. A volumen es mucho más barato.

---

### Canales de marketing

**1. SEO / Contenido (largo plazo, alto ROI)**
- Blog: "Cómo cumplir con la facturación electrónica en RD"
- Blog: "Qué es un e-CF y cómo emitirlo"
- Blog: "Guía paso a paso: certificarse como emisor electrónico"
- Landing optimizada para: "facturación electrónica dominicana", "software e-CF DGII"
- Objetivo: ser el primer resultado cuando busquen "facturación electrónica RD"

**2. Grupos de WhatsApp y Telegram (corto plazo, alto impacto)**
- Hay decenas de grupos de contadores dominicanos
- Compartir contenido educativo, no spam
- Ofrecer webinars gratuitos de 15 min: "Cómo prepararse para noviembre 2026"

**3. Instagram / Facebook (awareness)**
- Posts cortos tipo carrusel: "5 cosas que debes saber sobre la facturación electrónica"
- Reels: demo rápida de 30 segundos mostrando lo fácil que es facturar
- Testimonios de primeros usuarios

**4. Alianzas con contadores**
- Programa de referidos: el contador gana comisión o descuento por cada cliente que refiera
- Acceso gratuito al plan Contador por 3 meses
- El contador se convierte en tu canal de ventas

**5. Presencia en eventos**
- Charlas en colegios de contadores
- Webinars con la Cámara de Comercio
- Stand en ExpoASJ, ExpoMIPYMES

**6. Google Ads (inmediato)**
- Keywords: "facturación electrónica RD", "software e-CF DGII", "cómo emitir factura electrónica dominicana"
- Budget: RD$15,000-30,000/mes inicial
- Landing dedicada con CTA directo a registro

---

### Cronograma de lanzamiento

| Semana | Acción |
|--------|--------|
| S1-S3 | Implementar PDF con QR + Email automático |
| S4-S5 | Implementar carga por archivo + Contingencia básica |
| S6 | Landing page + contenido SEO inicial |
| S7 | Beta cerrada: 10-15 empresas (contadores aliados) |
| S8 | Ajustes basados en feedback |
| S9 | **Lanzamiento público** |
| S9 | Activar Google Ads + publicar en grupos |
| S10-S12 | Contenido continuo + alianzas con contadores |

---

### Métricas de éxito (primeros 3 meses)

| Métrica | Objetivo |
|---------|----------|
| Registros | 100 empresas |
| Empresas activas (>1 factura/mes) | 40 |
| Facturas emitidas/mes | 2,000+ |
| Conversión free → pago | 25% |
| NPS | >50 |
| Churn mensual | <5% |

---

### Ventaja de timing

La 3ra ola de obligatoriedad DGII vence en **noviembre 2026**. Eso significa que miles de pequeñas empresas estarán buscando solución entre agosto y octubre 2026.

**Si lanzamos en septiembre 2026**, llegamos justo cuando la urgencia es máxima. Ese es el momento perfecto — la demanda es orgánica y obligatoria.

---

### Resumen ejecutivo

1. **Qué falta:** PDF, email, carga por archivo, contingencia, landing (5-7 semanas)
2. **A quién venderle primero:** PyMEs obligadas + contadores como canal
3. **Cómo diferenciarnos:** precio fijo (no por factura), portal + API, cero jerga técnica
4. **Cuándo lanzar:** septiembre 2026, antes de la fecha límite DGII de noviembre
5. **Budget marketing inicial:** RD$30,000-50,000/mes (Google Ads + contenido)
