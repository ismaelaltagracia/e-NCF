# Estudio de Mercado y Plan de Ingresos — e-NCF

---

## 1. Tamaño del Mercado

### Datos del mercado dominicano

| Dato | Fuente | Cifra |
|------|--------|-------|
| Contribuyentes registrados en DGII | Padrón RNC 2026 | ~771,000 |
| MiPyMEs como % del tejido empresarial | MAPFRE/Banco Central RD | 98% |
| MiPyMEs que son formales | World Bank | ~15% (el 85% es informal) |
| MiPyMEs formales estimadas | Cálculo | ~115,000 |
| Empresas en 3er grupo obligatorio (pequeñas, micro, no clasificadas) | DGII Ley 32-23 | ~100,000+ |
| Fecha límite de cumplimiento | DGII (extendida) | 15 noviembre 2026 |
| Contribución MiPyMEs al PIB | Encuesta Nacional | 38.6% |
| Empleos generados por MiPyMEs | MAPFRE | 2,500,000+ |

### Mercado total (TAM)
Las ~100,000 empresas del 3er grupo de obligatoriedad que deben migrar a e-CF antes de noviembre 2026. Estas empresas hoy no tienen sistema de facturación electrónica.

### Mercado alcanzable (SAM)
De esas 100,000 empresas, estimamos que ~30,000-40,000 buscarán una solución SaaS accesible (las demás usarán Odoo, consultores, o no cumplirán inicialmente).

### Mercado objetivo realista (SOM) — Año 1
Capturar **500-1,000 empresas** en los primeros 12 meses es realista para un producto nuevo con marketing limitado.

---

## 2. Competencia y Pricing del Mercado

| Competidor | Modelo de cobro | Precio estimado |
|------------|----------------|-----------------|
| Alanube | Por factura | ~RD$5-15/factura |
| FiscaliaCore | Por request API | ~US$0.05-0.10/request |
| GuruSoft | Licencia + implementación | RD$50,000-200,000 inicial + mensual |
| Odoo + módulo e-CF | Licencia Odoo + módulo | US$25-50/mes/usuario |
| Nuestro modelo | **Plan fijo mensual** | RD$0-5,000/mes |

**Ventaja de pricing:** A 200 facturas/mes con Alanube (RD$10/factura) = RD$2,000. Con e-NCF = RD$1,500 fijo. A mayor volumen, la diferencia crece exponencialmente a nuestro favor.

---

## 3. Estructura de Planes y Pricing

| Plan | Precio/mes (RD$) | Precio/mes (US$) | Facturas/mes | Target |
|------|-----------------|-----------------|-------------|--------|
| **Inicio** | Gratis | $0 | 20 | Probar la plataforma |
| **PyME** | 1,500 | ~$25 | 200 | Pequeñas empresas |
| **Profesional** | 3,500 | ~$60 | 1,000 | Medianas, alto volumen |
| **Contador** | 5,000 | ~$85 | 500/empresa (10 emp.) | Firmas contables |
| **API** | 4,500 | ~$75 | 1,000 | Desarrolladores/integradores |

---

## 4. Proyección de Ingresos

### Escenario conservador (Año 1)

**Supuestos:**
- Lanzamiento: septiembre 2026
- Crecimiento: 30-50 nuevos clientes/mes post-lanzamiento
- Conversión free → pago: 25%
- Churn mensual: 5%
- ARPU (ingreso promedio por usuario): RD$2,500/mes

| Mes | Clientes pagos | Ingreso mensual (RD$) | Ingreso mensual (US$) |
|-----|---------------|----------------------|----------------------|
| Mes 1 (sept) | 15 | 37,500 | ~$625 |
| Mes 2 (oct) | 35 | 87,500 | ~$1,460 |
| Mes 3 (nov) | 80 | 200,000 | ~$3,330 |
| Mes 4 (dic) | 120 | 300,000 | ~$5,000 |
| Mes 5 (ene) | 150 | 375,000 | ~$6,250 |
| Mes 6 (feb) | 180 | 450,000 | ~$7,500 |
| **Mes 9** | **250** | **625,000** | **~$10,400** |
| **Mes 12** | **350** | **875,000** | **~$14,580** |

**Nota:** El mes 3 (noviembre) tiene pico por la fecha límite DGII — urgencia máxima.

### Escenario optimista (con marketing fuerte)

| Mes | Clientes pagos | Ingreso mensual (RD$) | Ingreso mensual (US$) |
|-----|---------------|----------------------|----------------------|
| Mes 3 | 150 | 375,000 | ~$6,250 |
| Mes 6 | 350 | 875,000 | ~$14,580 |
| Mes 9 | 500 | 1,250,000 | ~$20,830 |
| Mes 12 | 700 | 1,750,000 | ~$29,160 |

### Ingreso anual (Año 1)

| Escenario | Ingreso anual (RD$) | Ingreso anual (US$) |
|-----------|--------------------|--------------------|
| Conservador | ~4,500,000 | ~$75,000 |
| Optimista | ~10,000,000 | ~$167,000 |

---

## 5. Costos Operativos Mensuales

| Concepto | Costo mensual (RD$) | Costo mensual (US$) |
|----------|--------------------|--------------------|
| Servidor (VPS/Cloud) | 6,000-12,000 | $100-200 |
| Dominio + SSL | 500 | $8 |
| Email transaccional (Resend/Brevo) | 1,500 | $25 |
| Google Ads | 15,000-30,000 | $250-500 |
| Sentry (monitoreo) | 0 (free tier) | $0 |
| Contenido/Social Media | 5,000 | $83 |
| **Total costos fijos** | **~30,000-50,000** | **~$500-830** |

**Break-even:** ~20 clientes pagos a RD$2,500 promedio = RD$50,000/mes. Se alcanza en el mes 2-3.

---

## 6. Plan para Lograrlo (Primeros 6 Meses)

### Mes 0 — Pre-lanzamiento (agosto 2026)

| Acción | Resultado esperado |
|--------|-------------------|
| Completar certificación DGII producción | Habilitados para emitir facturas reales |
| Configurar dominio + HTTPS + SMTP | Infraestructura lista |
| Integrar Sentry + UptimeRobot | Monitoreo activo |
| Publicar landing page | URL pública disponible |
| Crear contenido SEO (3 blog posts) | Indexación en Google |
| Contactar 10 contadores aliados | Pipeline de referidos |
| Configurar Google Ads | Campaña lista para activar |

### Mes 1 — Lanzamiento (septiembre 2026)

| Acción | Resultado esperado |
|--------|-------------------|
| Activar Google Ads (keywords facturación electrónica RD) | 500-1,000 visitas/mes |
| Beta cerrada con 10-15 empresas de contadores aliados | Feedback + testimonios |
| Publicar en 5 grupos de WhatsApp de contadores | Awareness orgánico |
| Webinar gratuito: "Cómo cumplir con la DGII antes de noviembre" | 50-100 registros |
| Post semanal en Instagram/Facebook | Presencia constante |
| **Meta:** 30-50 registros, 15 clientes pagos | RD$37,500 |

### Mes 2 — Tracción (octubre 2026)

| Acción | Resultado esperado |
|--------|-------------------|
| Programa de referidos para contadores (15% comisión) | Canal de ventas escalable |
| Segundo webinar con Cámara de Comercio local | Credibilidad + leads |
| Aumentar budget Google Ads a RD$25,000 | Mayor volumen de leads |
| Publicar caso de éxito del primer cliente | Social proof |
| Integrar chat de soporte (Crisp/Tawk.to gratis) | Reducir fricción |
| **Meta:** 35 nuevos clientes pagos (total 50) | RD$125,000 |

### Mes 3 — Urgencia DGII (noviembre 2026)

| Acción | Resultado esperado |
|--------|-------------------|
| Campaña de urgencia: "Última oportunidad antes de la multa" | Conversión alta |
| Triplicar budget de ads (RD$45,000) | Máximo alcance |
| Ofrecer onboarding gratuito por videollamada | Reduce barrera de entrada |
| Alianza con 2-3 firmas contables medianas | 20-30 clientes por alianza |
| Email marketing a registros del webinar | Conversión de leads tibios |
| **Meta:** 50-80 nuevos clientes pagos (total 120) | RD$300,000 |

### Mes 4-6 — Consolidación (dic 2026 - feb 2027)

| Acción | Resultado esperado |
|--------|-------------------|
| Lanzar plan Contador (paquete multi-empresa) | Ticket promedio más alto |
| Publicar app móvil (Flutter) en stores | Nuevo canal de adquisición |
| Automatizar onboarding (video tutorial in-app) | Menor costo de soporte |
| Expandir red de contadores aliados a 25+ | Canal de ventas principal |
| Optimizar SEO (aparecer top 3 en "facturación electrónica RD") | Tráfico orgánico gratuito |
| Reducir dependencia de ads | Margen más alto |
| **Meta mes 6:** 180 clientes pagos | RD$450,000/mes |

---

## 7. Métricas Clave (KPIs)

| Métrica | Objetivo Mes 3 | Objetivo Mes 6 | Objetivo Mes 12 |
|---------|---------------|---------------|----------------|
| Registros totales | 300 | 800 | 2,000 |
| Clientes pagos | 120 | 180 | 350 |
| MRR (ingreso mensual recurrente) | RD$300,000 | RD$450,000 | RD$875,000 |
| ARPU | RD$2,500 | RD$2,500 | RD$2,500 |
| Churn mensual | <8% | <5% | <4% |
| CAC (costo adquisición cliente) | RD$3,000 | RD$2,000 | RD$1,500 |
| LTV (lifetime value) | RD$50,000 | RD$50,000 | RD$62,500 |
| LTV/CAC ratio | 16x | 25x | 41x |
| NPS | >40 | >50 | >60 |

---

## 8. Proyección a 3 Años

| Año | Clientes pagos | MRR (RD$) | ARR (RD$) | ARR (US$) |
|-----|---------------|-----------|-----------|-----------|
| Año 1 | 350 | 875,000 | 10,500,000 | ~$175,000 |
| Año 2 | 800 | 2,000,000 | 24,000,000 | ~$400,000 |
| Año 3 | 1,500 | 3,750,000 | 45,000,000 | ~$750,000 |

Con 1,500 clientes del universo de 100,000 empresas obligadas, estamos capturando apenas el 1.5% del mercado. Hay espacio masivo de crecimiento.

---

## 9. Riesgos y Mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| DGII extiende plazo nuevamente | Media | Medio | Menos urgencia, pero la ley sigue vigente. Ajustar messaging. |
| Competidor grande baja precios | Baja | Alto | Diferenciarnos en UX, soporte, y self-hosted. No competir en precio con enterprise. |
| Churn alto (>10%) | Media | Alto | Onboarding excepcional, soporte proactivo, features que generen dependencia. |
| Problemas técnicos en producción | Media | Alto | Sentry + UptimeRobot + backup automático + modo contingencia. |
| Certificación DGII se retrasa | Baja | Crítico | Empezar proceso YA. Tener ambiente TesteCF listo para demos mientras tanto. |

---

## 10. Resumen Ejecutivo

- **Mercado:** 100,000+ empresas obligadas a migrar a e-CF antes de noviembre 2026
- **Oportunidad:** No existe solución dominicana que combine portal + API + precio fijo accesible
- **Meta Año 1:** 350 clientes pagos, RD$875,000/mes (US$14,580/mes)
- **Break-even:** Mes 2-3 (20 clientes pagos)
- **Inversión inicial:** ~RD$150,000 (infraestructura + primer mes de ads)
- **Margen neto estimado al mes 6:** ~85% (costos fijos bajos, producto digital)
- **Ventana de oportunidad:** agosto-noviembre 2026 (4 meses antes del deadline)
