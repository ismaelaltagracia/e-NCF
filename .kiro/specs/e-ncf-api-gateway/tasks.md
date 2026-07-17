# Implementation Plan: e-NCF API Gateway

## Overview

Implementación incremental del API Gateway REST para facturación electrónica (e-CF) de la DGII de República Dominicana usando NestJS con TypeScript. El plan sigue un enfoque bottom-up: primero la infraestructura base y módulos comunes, luego los módulos de dominio, integración DGII, y finalmente los módulos de soporte (webhooks, auditoría, polling, backup).

## Tasks

- [x] 1. Configuración del proyecto y estructura base
  - [x] 1.1 Inicializar proyecto NestJS con estructura de carpetas
    - Crear proyecto NestJS con `@nestjs/cli`
    - Configurar tsconfig.json con strict mode
    - Crear estructura de carpetas: src/common, src/modules, src/dgii, src/infrastructure, src/database, src/health
    - Configurar ESLint y Prettier
    - Instalar dependencias core: @nestjs/config, @nestjs/typeorm, typeorm, pg, ioredis, zod
    - _Requirements: 23.2, 23.4_
iu
  - [x] 1.2 Configurar Docker Compose y servicios de infraestructura
    - Crear docker-compose.yml con servicios: app (Node.js 20 Alpine multi-stage), PostgreSQL 16, Redis 7, MinIO
    - Configurar volúmenes persistentes para cada servicio
    - Definir health checks para todos los contenedores
    - Crear Dockerfile multi-stage para la aplicación
    - Crear archivo .env.example con todas las variables requeridas
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

  - [x] 1.3 Definir interfaces de infraestructura abstracta
    - Crear IStorageProvider (upload, download, getPresignedUrl, delete)
    - Crear ISecretsProvider (getEncryptionKey, getJwtPrivateKey, getJwtPublicKey)
    - Implementar MinioStorageAdapter usando @aws-sdk/client-s3
    - Implementar EnvSecretsAdapter para variables de entorno
    - Configurar inyección de dependencias con tokens de NestJS
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

  - [x] 1.4 Configurar base de datos y entidades TypeORM
    - Crear DatabaseModule con configuración desde variables de entorno
    - Definir todas las entidades: Empresa, Usuario, SuperAdmin, RefreshToken, ApiKey, FacturaElectronica, CatalogoItem, SecuenciaNcf, UsoMensual, Auditoria, Webhook
    - Definir enums: EstadoEmpresa, RolUsuario, ModoNcf, EstadoDgii, TipoComprobante, TipoCatalogo
    - Crear migraciones iniciales con índices y restricciones
    - _Requirements: 13.4, 18.1, 27.1, 27.11, 28.1, 31.1_

  - [x] 1.5 Configurar módulo común (decoradores, filtros, interceptores, pipes)
    - Crear GlobalExceptionFilter con formato ErrorResponse estandarizado
    - Crear CorrelationIdInterceptor (genera o extrae X-Correlation-ID UUID v4)
    - Crear LoggingInterceptor con formato JSON estructurado
    - Crear ZodValidationPipe genérico
    - Crear decoradores: @CurrentUser, @Roles, @ApiKeyScopes
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [ ] 2. Módulo de Autenticación y Autorización
  - [x] 2.1 Implementar autenticación OAuth 2.0 (login, refresh, logout)
    - Crear AuthModule con AuthService
    - Implementar POST /api/v1/auth/login con validación bcrypt (costo 12)
    - Emitir Access Token JWT RS256 (15 min TTL) con claims: usuario_id, empresa_id, rnc, rol
    - Emitir Refresh Token UUID opaco (7 días TTL), almacenar hash SHA-256 en DB
    - Implementar POST /api/v1/auth/refresh (revocar anterior, emitir nuevo par)
    - Implementar POST /api/v1/auth/logout (revocar refresh token)
    - Verificar que Empresa tiene estado "activo" antes de permitir login
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.11, 2.12_

  - [x] 2.2 Write property test: JWT round-trip emisión y verificación
    - **Property 5: Round-trip JWT emisión y verificación**
    - **Validates: Requirements 2.1, 2.5, 2.12**

  - [x] 2.3 Implementar bloqueo por intentos fallidos de login
    - Rastrear intentos_fallidos y bloqueado_hasta en tabla usuarios
    - Bloquear tras 5 intentos fallidos consecutivos en 15 minutos
    - Retornar 429 Too Many Requests durante período de bloqueo
    - Resetear contador tras login exitoso o expiración del bloqueo
    - _Requirements: 2.9_

  - [ ]* 2.4 Write property test: Bloqueo por intentos fallidos
    - **Property 23: Bloqueo por intentos fallidos de login**
    - **Validates: Requirements 2.9**

  - [x] 2.5 Implementar autenticación por API Keys
    - Crear ApiKeyGuard que busca hash SHA-256 del header X-API-Key
    - Verificar que API Key está activo y Empresa tiene estado "activo"
    - Extraer empresa_id y scopes para RequestContext unificado
    - Actualizar last_used_at en cada uso
    - _Requirements: 2B.1, 2B.2, 2B.3_

  - [ ]* 2.6 Write property test: API Key round-trip generación, hash y lookup
    - **Property 6: Round-trip API Key generación, hash y lookup**
    - **Validates: Requirements 2B.1, 2B.2, 2B.7**

  - [x] 2.7 Implementar RBAC Guard y verificación de scopes
    - Crear RolesGuard con jerarquía admin > facturador > lector
    - Crear ScopesGuard para verificación de scopes en API Keys
    - Resolver ambos mecanismos (JWT y API Key) a RequestContext unificado
    - _Requirements: 3.2, 2B.4, 2B.5_

  - [ ]* 2.8 Write property test: Enforcement RBAC por rol
    - **Property 3: Enforcement RBAC por rol**
    - **Validates: Requirements 3.2, 4.5, 17.7, 25.5, 28.12, 30.5, 31.3**

  - [ ]* 2.9 Write property test: Autorización por scopes de API Key
    - **Property 8: Autorización por scopes de API Key**
    - **Validates: Requirements 2B.4, 2B.5**

  - [x] 2.10 Implementar rate limiting por usuario y API Key
    - Configurar RateLimitMiddleware con Redis (sliding window)
    - 100 req/min para usuarios humanos, 1000 req/min para API Keys
    - Incluir header Retry-After en respuestas 429
    - _Requirements: 2.10, 2B.6_

  - [ ]* 2.11 Write property test: Rate limiting respeta umbrales
    - **Property 7: Rate limiting respeta umbrales configurados**
    - **Validates: Requirements 2.10, 2B.6**

- [x] 3. Checkpoint - Verificar autenticación y autorización
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Módulo de Gestión de Usuarios y Onboarding
  - [x] 4.1 Implementar módulo de onboarding (registro empresa + admin)
    - Crear OnboardingModule con OnboardingService
    - POST /api/v1/onboarding/registro: crear Empresa (estado "certificacion") + Usuario admin
    - Validar: nombre (max 150), RNC (9 u 11 dígitos), email (RFC 5322), contraseña (min 8, mayúscula, minúscula, dígito)
    - Almacenar contraseña con bcrypt costo 12
    - Asignar plan "Básico" por defecto
    - Verificar unicidad de RNC y email (409 Conflict)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.12, 27.2_

  - [ ]* 4.2 Write property test: Unicidad de RNC y email
    - **Property 4: Unicidad de RNC y email en registro**
    - **Validates: Requirements 1.3, 1.4, 3.7**

  - [x] 4.3 Implementar carga y encriptación de certificados PKCS12
    - POST /api/v1/empresas/me/certificado: subida archivo .p12/.pfx (max 10KB)
    - Validar certificado: PKCS12 válido, no expirado, RNC coincide con Empresa
    - Encriptar con AES-256-GCM (IV 12 bytes, auth_tag 16 bytes)
    - Almacenar certificado_encriptado, salt_encriptacion, auth_tag
    - Actualizar estado Empresa a "activo" tras primera carga exitosa
    - Solo accesible por rol "admin"
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 17.1, 17.2, 17.3, 17.5, 17.6, 17.7_

  - [ ]* 4.4 Write property test: Round-trip encriptación AES-256-GCM
    - **Property 1: Round-trip de encriptación AES-256-GCM**
    - **Validates: Requirements 1.7, 6.1, 17.1, 17.3**

  - [x] 4.5 Implementar CRUD de usuarios por empresa
    - Crear UsersModule con UsersService
    - POST /api/v1/usuarios: crear usuario (solo admin)
    - GET /api/v1/usuarios: listar usuarios de la empresa
    - PATCH /api/v1/usuarios/:id: actualizar rol, desactivar
    - Revocar refresh tokens al desactivar usuario
    - Protección del último administrador (409 Conflict)
    - Verificar que usuario pertenece a la misma empresa
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 4.6 Write property test: Protección del último administrador
    - **Property 21: Protección del último administrador**
    - **Validates: Requirements 3.8**

  - [x] 4.7 Implementar CRUD de API Keys
    - Crear ApiKeysModule con ApiKeysService
    - POST /api/v1/api-keys: generar key 256 bits base64, almacenar hash SHA-256 (solo admin)
    - GET /api/v1/api-keys: listar keys de la empresa (sin key ni hash)
    - POST /api/v1/api-keys/:id/rotate: revocar y regenerar
    - DELETE /api/v1/api-keys/:id: revocar (activo=false)
    - Validar scopes contra conjunto permitido
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 4.8 Write property test: Validación de scopes permitidos
    - **Property 25: Validación de scopes permitidos**
    - **Validates: Requirements 4.7, 4.8**

  - [ ]* 4.9 Write property test: Refresh token revoca el anterior
    - **Property 24: Refresh token revoca el anterior**
    - **Validates: Requirements 2.3, 2.4**

- [x] 5. Módulo de Catálogo de Productos y Servicios
  - [x] 5.1 Implementar CRUD de catálogo con validaciones
    - Crear CatalogoModule con CatalogoService
    - POST /api/v1/catalogo: crear ítem (admin o facturador)
    - GET /api/v1/catalogo: listar con filtros (tipo, activo, search)
    - PATCH /api/v1/catalogo/:id: actualizar campos
    - DELETE /api/v1/catalogo/:id: borrado lógico (activo=false)
    - Validar: tipo (producto/servicio), tasa_itbis (0,16,18), precio_unitario (positivo, max 2 decimales)
    - Búsqueda parcial case-insensitive en descripcion y codigo
    - Aislamiento por empresa_id
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 25.8, 25.9_

  - [ ]* 5.2 Write property test: Búsqueda parcial case-insensitive
    - **Property 20: Búsqueda parcial case-insensitive en catálogo**
    - **Validates: Requirements 25.9**

- [x] 6. Módulo de Secuencias NCF y Planes
  - [x] 6.1 Implementar gestión de secuencias NCF
    - Crear SecuenciasNcfModule con SecuenciasNcfService
    - POST /api/v1/secuencias-ncf: crear secuencia (solo admin)
    - GET /api/v1/secuencias-ncf: listar secuencias de empresa
    - PATCH /api/v1/secuencias-ncf/:id: desactivar secuencia
    - GET /api/v1/secuencias-ncf/estado: resumen de capacidad restante
    - Asignación atómica con SELECT FOR UPDATE (prevenir race conditions)
    - Formato e-NCF: prefijo + LPAD(numero_actual, 8, '0')
    - Warning al 90% de uso de secuencia
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.7, 28.9, 28.10, 28.11, 28.12, 28.13, 28.14_

  - [ ]* 6.2 Write property test: Asignación atómica de e-NCF
    - **Property 15: Asignación atómica de e-NCF**
    - **Validates: Requirements 28.7, 28.9, 28.11**

  - [x] 6.3 Implementar validación condicional de e-NCF según modo
    - Soportar modo_ncf automático: ignorar e_ncf del payload, asignar desde secuencia
    - Soportar modo_ncf manual: requerir e_ncf en payload, validar formato
    - PATCH /api/v1/empresas/me/configuracion para cambiar modo_ncf
    - _Requirements: 28.5, 28.6, 28.7, 28.8_

  - [ ]* 6.4 Write property test: Validación condicional de e-NCF según modo
    - **Property 22: Validación condicional de e-NCF según modo**
    - **Validates: Requirements 8.6, 28.7, 28.8**

  - [x] 6.5 Implementar planes de suscripción y límites mensuales
    - Crear PlanesModule con PlanesService
    - Seed planes por defecto (Básico, Profesional, Empresarial)
    - Tabla uso_mensual: crear registro por empresa/mes, incrementar atómicamente
    - Verificar límite antes de crear factura (402 Payment Required)
    - GET /api/v1/empresas/me/uso: consultar uso actual
    - Endpoints admin: GET /api/v1/admin/planes, PATCH /api/v1/admin/empresas/:id/plan
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9, 27.10, 27.11, 27.12, 27.13_

  - [ ]* 6.6 Write property test: Enforcement de límite mensual
    - **Property 16: Enforcement de límite mensual de facturas**
    - **Validates: Requirements 27.3, 27.4, 27.5**

- [x] 7. Checkpoint - Verificar módulos de dominio base
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integración DGII: Handshake y Token
  - [x] 8.1 Implementar servicio de semilla DGII (SOAP)
    - Crear DgiiModule con SemillaService
    - Solicitar semilla XML via SOAP (timeout 10s)
    - Validar que XML es bien formado con elemento raíz esperado
    - Manejar errores: 503 si inalcanzable, 502 si respuesta malformada
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 8.2 Implementar servicio de firma digital (XAdES-BES)
    - Crear FirmaService usando xadesjs (XMLDSIGjs)
    - Recuperar y desencriptar certificado PKCS12 desde DB
    - Firmar con: exc-c14n canonicalización, SHA-256 digest, RSA-SHA256 firma
    - Incluir KeyInfo con cadena X.509 completa
    - Incluir xades:SignedProperties (SigningCertificate + SigningTime UTC ISO 8601)
    - Firma enveloped en semillas y documentos e-CF
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 8.3 Write property test: Verificación de firma XAdES-BES
    - **Property 12: Verificación de firma digital XAdES-BES**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

  - [x] 8.4 Implementar DgiiTokenService (handshake completo + cache)
    - Enviar semilla firmada al endpoint de token DGII (timeout 10s)
    - Almacenar token en Redis con TTL 3540s (clave: dgii_token:{empresa_id})
    - Reutilizar token cacheado si disponible
    - Si Redis inalcanzable: handshake sin cache, log WARNING
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 9. Integración DGII: Transmisión y Resiliencia
  - [x] 9.1 Implementar conversor JSON a XML conforme XSD
    - Crear ConversorXmlService con fast-xml-parser
    - Transformar payload JSON validado a XML UTF-8 conforme XSD DGII
    - Preservar orden de elementos y namespaces
    - Soporte de recarga de esquema XSD sin reinicio (polling 5 min)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 22.1, 22.2, 22.3, 22.4, 22.5_

  - [ ]* 9.2 Write property test: Round-trip JSON a XML
    - **Property 11: Round-trip de conversión JSON a XML**
    - **Validates: Requirements 9.4**

  - [x] 9.3 Implementar Circuit Breaker con opossum
    - Crear CircuitBreakerService envolviendo llamadas a DGII
    - Configurar: timeout 30s, resetTimeout 30s, volumeThreshold 5, rollingCountTimeout 60s
    - Estados: CLOSED → OPEN (5 fallos en 60s) → HALF-OPEN (30s) → CLOSED/OPEN
    - Retornar 503 + retry-after en estado OPEN
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 9.4 Write property test: Máquina de estados Circuit Breaker
    - **Property 13: Máquina de estados del Circuit Breaker**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5**

  - [x] 9.5 Implementar cola de reintentos con BullMQ
    - Crear RetryQueueModule con BullMQ sobre Redis
    - Configurar: 5 intentos, backoff exponencial (5s, 10s, 20s, 40s, 80s)
    - Pausar workers cuando Circuit Breaker está OPEN
    - No reintentar rechazos de negocio (solo errores transitorios)
    - Actualizar estado_dgii en cada transición
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

  - [ ]* 9.6 Write property test: Cálculo de backoff exponencial
    - **Property 14: Cálculo de backoff exponencial**
    - **Validates: Requirements 19.1, 19.2**

  - [x] 9.7 Implementar servicio de transmisión a DGII
    - Crear TransmisionService
    - Transmitir XML firmado al endpoint e-CF con Bearer Token (timeout 30s)
    - Extraer Track_ID de respuesta exitosa
    - Re-handshake si token expirado (401) y reintentar una vez
    - Encolar en BullMQ si error transitorio o CB open
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 10. Módulo de Facturación (flujo completo)
  - [x] 10.1 Implementar validación Zod del payload de factura
    - Crear esquema Zod: RNC emisor/receptor, items (min 1), montos, ITBIS
    - Validar formato RNC (9 u 11 dígitos numéricos)
    - Validar aritmética de montos (tolerancia 0.01)
    - Validar e_ncf condicional según modo_ncf de la empresa
    - Retornar 400 con arreglo de errores (ruta + mensaje por campo)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 10.2 Write property test: Validación de formato RNC
    - **Property 9: Validación de formato RNC**
    - **Validates: Requirements 8.3**

  - [ ]* 10.3 Write property test: Invariante aritmética de montos
    - **Property 10: Invariante aritmética de montos de factura**
    - **Validates: Requirements 8.4**

  - [x] 10.4 Implementar validador de RNC receptor contra DGII
    - Crear RncValidatorService
    - Consultar servicio DGII de RNC (timeout 5s)
    - Cachear RNCs validados en Redis (TTL 24h)
    - Si DGII inalcanzable: proceder sin validación, flag rnc_validado=false
    - GET /api/v1/rnc/:rnc/validar para consulta manual
    - Flag configurable validar_rnc_receptor por empresa
    - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6_

  - [x] 10.5 Implementar flujo completo POST /api/v1/facturas
    - Crear FacturasModule con FacturasService
    - Orquestar: validar → verificar límite mensual → asignar NCF → crear registro → convertir XML → firmar → subir XML a S3 → transmitir a DGII
    - Crear Registro_Factura con empresa_id, usuario_id/api_key_id, e_ncf, estado "enviado"
    - Verificar RNC emisor coincide con empresa autenticada
    - Almacenar xml_s3_url tras subida
    - Encolar generación PDF tras aceptación
    - Incrementar uso_mensual atómicamente
    - _Requirements: 8.6, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 18.2, 18.3, 18.4_

  - [x] 10.6 Implementar consulta de facturas con aislamiento multi-tenencia
    - GET /api/v1/facturas: listar facturas de la empresa (paginado)
    - GET /api/v1/facturas/:id: detalle de factura
    - GET /api/v1/facturas/:id/estado: estado actual DGII
    - Filtro empresa_id en todas las consultas
    - Rechazar acceso cross-tenant con 403
    - _Requirements: 18.2, 18.5, 18.7, 29.3_

  - [ ]* 10.7 Write property test: Aislamiento multi-tenencia
    - **Property 2: Aislamiento multi-tenencia**
    - **Validates: Requirements 18.2, 18.5, 18.7, 25.2, 25.6, 16.5, 3.4, 3.5**

- [x] 11. Checkpoint - Verificar flujo de facturación completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Generación de PDF y QR
  - [x] 12.1 Implementar generador de código QR
    - Crear QrGeneratorService
    - Generar QR PNG 150x150 px mínimo, corrección "M"
    - Payload: URL DGII + RNC emisor + RNC receptor + e-NCF + monto (2 decimales, sin símbolo)
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ]* 12.2 Write property test: Formato de payload QR
    - **Property 17: Formato de payload QR según patrón DGII**
    - **Validates: Requirements 14.1, 14.3**

  - [x] 12.3 Implementar generador de PDF con pdfkit
    - Crear PdfGeneratorService
    - Formatos: ticket (80mm) y carta (según preferencia empresa)
    - Incluir: QR (min 25x25mm), encabezado, RNCs, detalle ítems, ITBIS, totales, e-NCF, Track_ID
    - Subir PDF a MinIO/S3 (timeout 30s)
    - Almacenar pdf_s3_url en Registro_Factura
    - Reintentar subida hasta 3 veces si falla
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x] 12.4 Implementar endpoint de descarga de PDF (URL pre-firmada)
    - GET /api/v1/facturas/:id/pdf: generar URL pre-firmada (TTL 15 min)
    - Verificar que factura pertenece a la empresa del usuario
    - Retornar URL + timestamp expiración ISO 8601
    - 404 si factura no existe o PDF no disponible
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 13. Módulos de Soporte: Auditoría, Webhooks, Polling
  - [x] 13.1 Implementar módulo de auditoría
    - Crear AuditoriaModule con AuditoriaService
    - Registrar acciones: factura_enviada, factura_anulada, certificado_subido, certificado_reemplazado, configuracion_cambiada, usuario_creado, usuario_desactivado, plan_cambiado, secuencia_creada, api_key_creada, api_key_revocada
    - Capturar: empresa_id, usuario_id/api_key_id, datos antes/después, ip_origen, correlation_id
    - GET /api/v1/auditoria: paginado con filtros (accion, fecha, usuario_id) - solo admin
    - GET /api/v1/admin/auditoria: cross-empresa para Super_Admin
    - No permitir UPDATE ni DELETE de registros de auditoría
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6_

  - [x] 13.2 Implementar módulo de webhooks
    - Crear WebhooksModule con WebhooksService
    - POST /api/v1/webhooks: configurar webhook (url HTTPS, eventos, secret)
    - GET /api/v1/webhooks: listar webhooks de empresa
    - DELETE /api/v1/webhooks/:id: desactivar webhook
    - POST /api/v1/webhooks/:id/test: enviar evento de prueba
    - Entrega: timeout 10s, reintentos 3 (10s, 30s, 90s)
    - HMAC-SHA256 en header X-Webhook-Signature si secret configurado
    - Auto-desactivar tras 10 fallos consecutivos
    - Eventos: factura_aceptada, factura_rechazada, factura_anulada, secuencia_agotandose, plan_limite_alcanzado
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7, 32.8_

  - [ ]* 13.3 Write property test: Firma HMAC-SHA256 de webhooks
    - **Property 18: Firma HMAC-SHA256 de webhooks**
    - **Validates: Requirements 32.3**

  - [x] 13.4 Implementar polling de estado DGII
    - Crear EstadoPollingService con @nestjs/schedule
    - Consultar estado para facturas con estado_dgii="aceptado" (intervalo configurable, default 5 min)
    - Actualizar a estado terminal: aprobado, rechazado_definitivo
    - Disparar webhook al cambiar a estado terminal
    - Dejar de consultar tras estado terminal
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6_

  - [x] 13.5 Implementar anulación de e-CF
    - POST /api/v1/facturas/:id/anular: solo admin, solo facturas con estado "aprobado"
    - Generar XML de anulación, firmar con XAdES-BES, transmitir a DGII
    - Actualizar estado_dgii a "anulado" tras confirmación
    - No liberar e-NCF (consumido permanentemente)
    - Crear registro de auditoría
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7_

- [x] 14. Checkpoint - Verificar módulos de soporte
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Health Check, Correlation ID y Backup
  - [x] 15.1 Implementar endpoints de health check
    - GET /health: estado general + dependencias (PostgreSQL, Redis, MinIO) con latencia
    - GET /health/dgii: verificar conectividad con endpoint semilla DGII (timeout 10s)
    - Timeout 5s por dependencia, 503 si PostgreSQL o Redis caídos
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [ ]* 15.2 Write property test: Propagación de Correlation ID
    - **Property 19: Propagación de Correlation ID**
    - **Validates: Requirements 21.1, 21.3, 21.4**

  - [x] 15.3 Implementar servicio de backup automático
    - Crear contenedor backup en docker-compose.yml
    - pg_dump diario (default 02:00 UTC, configurable)
    - Comprimir a .sql.gz, retener últimos 7 días (configurable BACKUP_RETENTION_DAYS)
    - Reintentar una vez tras 5 min si falla
    - Log JSON con resultado (éxito + tamaño, o error)
    - GET /health/backup: estado último backup (solo Super_Admin)
    - _Requirements: 34.1, 34.2, 34.3, 34.4, 34.5, 34.6_

- [x] 16. Módulo Admin (Super_Admin)
  - [x] 16.1 Implementar endpoints de administración de plataforma
    - Crear AdminModule
    - Autenticación Super_Admin via misma ruta login (JWT con rol="super_admin", sin empresa_id)
    - GET /api/v1/admin/planes: listar todos los planes
    - PATCH /api/v1/admin/empresas/:id/plan: cambiar plan de empresa
    - GET /api/v1/admin/auditoria: auditoría cross-empresa con filtros
    - GET /health/backup: acceso exclusivo Super_Admin
    - Rechazar acceso 403 para usuarios no Super_Admin en /api/v1/admin/*
    - _Requirements: 27.6, 27.7, 27.8, 31.6_

- [x] 17. Aplicación Web React (SPA)
  - [x] 17.1 Configurar proyecto React SPA servido por NestJS
    - Crear proyecto React en carpeta client/ con Vite
    - Configurar NestJS ServeStaticModule para servir en /app
    - Configurar rutas y navegación SPA
    - _Requirements: 1.1, 1.11_

  - [x] 17.2 Implementar flujo de onboarding en React
    - Formulario registro: nombre empresa, RNC, nombre admin, email, contraseña
    - Validación client-side antes de envío
    - Paso de carga de certificado (.p12/.pfx, max 10MB, campo contraseña)
    - Pantalla de confirmación tras activación
    - Manejo de errores inline por campo
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 1.9, 1.10, 1.11_

  - [x] 17.3 Implementar interfaz de facturación en React
    - Formulario: RNC receptor, nombre receptor, selector de ítems del catálogo con búsqueda
    - Agregar múltiples líneas (min 1)
    - Cálculo en tiempo real: subtotal, ITBIS por línea, total
    - Validación: al menos 1 ítem, RNC 9/11 dígitos
    - Envío a POST /api/v1/facturas con Access Token
    - Mostrar resultado (Track_ID, e-NCF, link PDF) o errores inline
    - Modo solo lectura para rol "lector"
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9, 26.10_

  - [x] 17.4 Implementar módulo de gestión de catálogo en React
    - CRUD visual de productos/servicios
    - Búsqueda y filtros (tipo, activo)
    - Formulario con validación (precio, tasa ITBIS)
    - _Requirements: 25.1, 25.2, 25.3, 25.4_

- [x] 18. Checkpoint final - Verificar integración completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript with NestJS, fast-check for PBT, and Jest for testing
- All infrastructure interactions go through abstract interfaces (IStorageProvider, ISecretsProvider)
- Multi-tenancy is enforced via empresa_id filter in all queries
- The React SPA (tasks 17.x) can be developed in parallel with backend modules

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5"] },
    { "id": 3, "tasks": ["2.1", "2.5"] },
    { "id": 4, "tasks": ["2.2", "2.3", "2.6", "2.7", "2.10"] },
    { "id": 5, "tasks": ["2.4", "2.8", "2.9", "2.11"] },
    { "id": 6, "tasks": ["4.1", "4.5", "4.7"] },
    { "id": 7, "tasks": ["4.2", "4.3", "4.6", "4.8", "4.9"] },
    { "id": 8, "tasks": ["4.4", "5.1"] },
    { "id": 9, "tasks": ["5.2", "6.1", "6.5"] },
    { "id": 10, "tasks": ["6.2", "6.3", "6.6"] },
    { "id": 11, "tasks": ["6.4", "8.1"] },
    { "id": 12, "tasks": ["8.2", "8.4"] },
    { "id": 13, "tasks": ["8.3", "9.1"] },
    { "id": 14, "tasks": ["9.2", "9.3", "9.5"] },
    { "id": 15, "tasks": ["9.4", "9.6", "9.7"] },
    { "id": 16, "tasks": ["10.1"] },
    { "id": 17, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 18, "tasks": ["10.5"] },
    { "id": 19, "tasks": ["10.6", "10.7"] },
    { "id": 20, "tasks": ["12.1"] },
    { "id": 21, "tasks": ["12.2", "12.3"] },
    { "id": 22, "tasks": ["12.4", "13.1", "13.2"] },
    { "id": 23, "tasks": ["13.3", "13.4", "13.5"] },
    { "id": 24, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 25, "tasks": ["16.1"] },
    { "id": 26, "tasks": ["17.1"] },
    { "id": 27, "tasks": ["17.2", "17.3", "17.4"] }
  ]
}
```
