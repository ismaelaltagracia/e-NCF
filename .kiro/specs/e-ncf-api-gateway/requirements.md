# Requirements Document

## Introduction

Este documento define los requisitos para un servicio API Gateway REST que actúa como middleware entre los sistemas de facturación de PYMES y la plataforma de facturación electrónica (e-CF) de la Dirección General de Impuestos Internos (DGII) de República Dominicana. El sistema se despliega como un stack Docker Compose en un servidor personal (on-premise), con diseño cloud-agnostic que permite migración a AWS cuando se requieran más recursos. El gateway maneja handshakes de autenticación, firma digital con XAdES-BES, transmisión XML, generación de PDF con códigos QR y persistencia transaccional. Soporta multi-tenencia con separación de empresas y usuarios, autenticación dual (OAuth 2.0 para usuarios humanos y API keys para sistemas), control de acceso basado en roles (RBAC), patrón circuit breaker para resiliencia y colas de reintentos estructuradas.

## Glossary

- **API_Gateway**: El servicio REST basado en NestJS que recibe solicitudes de facturación, firma documentos XML, los transmite a la DGII y gestiona el ciclo de vida completo del e-CF.
- **DGII**: Dirección General de Impuestos Internos — la autoridad tributaria de República Dominicana que opera la plataforma de facturación electrónica e-CF.
- **e-CF**: Comprobante Fiscal Electrónico — el estándar de documento fiscal electrónico definido por la DGII.
- **e-NCF**: Número de Comprobante Fiscal Electrónico — el identificador secuencial único asignado a cada documento fiscal electrónico.
- **Semilla**: Un documento XML temporal emitido por el servicio SOAP de la DGII, utilizado como parte del handshake de autenticación para obtener un Bearer Token.
- **Bearer_Token**: Un token de acceso temporal emitido por la DGII tras la firma exitosa de la semilla, válido por 1 hora.
- **XAdES-BES**: XML Advanced Electronic Signatures — perfil Basic Electronic Signature, el estándar de firma criptográfica requerido por la DGII para documentos e-CF.
- **Certificado_PKCS12**: Un archivo .p12/.pfx que contiene la clave privada de la empresa y la cadena de certificados X.509, utilizado para operaciones de firma digital.
- **RNC**: Registro Nacional de Contribuyentes — el número único de identificación tributaria en República Dominicana.
- **ITBIS**: Impuesto a la Transferencia de Bienes Industrializados y Servicios — el impuesto al valor agregado de República Dominicana.
- **Track_ID**: Un código único de recepción devuelto por la DGII tras el envío exitoso de un e-CF, utilizado para rastrear el estado del documento.
- **Cache_Token**: Almacenamiento basado en Redis utilizado para persistir Bearer Tokens con expiración TTL. Desplegado como contenedor Docker on-premise o Amazon ElastiCache en la nube.
- **Cola_Reintentos**: Cola basada en BullMQ con backoff exponencial para reintentar transmisiones fallidas a la DGII.
- **Circuit_Breaker**: Patrón de resiliencia basado en opossum que previene fallos en cascada cuando los servicios de la DGII no están disponibles.
- **Validador**: El componente de validación de esquemas basado en Zod que valida los payloads JSON entrantes contra las estructuras e-CF definidas.
- **Conversor_XML**: El componente basado en fast-xml-parser que transforma payloads JSON validados en documentos XML conformes con la DGII.
- **Servicio_Firma**: El componente responsable de extraer claves privadas de certificados PKCS12 y aplicar firmas digitales XAdES-BES a documentos XML.
- **Generador_PDF**: El componente basado en pdfkit que produce representaciones impresas de facturas con códigos QR embebidos.
- **Almacenamiento_Objetos**: Proveedor de almacenamiento que expone una API compatible con S3. Implementación por defecto: MinIO en Docker. Alternativa: AWS S3. Utilizado para documentos XML firmados y archivos PDF generados.
- **MinIO**: Servidor de almacenamiento de objetos compatible con la API de S3, utilizado como el proveedor de almacenamiento por defecto en el despliegue Docker on-premise.
- **Proveedor_Secretos**: Capa de abstracción para la gestión de claves de encriptación. On-premise utiliza variables de entorno (ENCRYPTION_KEY) o archivos de configuración encriptados. Puede intercambiarse por AWS Secrets Manager o HashiCorp Vault.
- **Docker_Compose**: Herramienta de orquestación de contenedores utilizada para desplegar el stack completo (API Gateway, PostgreSQL, Redis, MinIO) en un único servidor.
- **Empresa**: Una entrada en la tabla `empresas` de la base de datos que representa un tenant (organización/PYME) con su certificado encriptado, RNC, estado operacional, plan_id (referencia a la tabla `planes`) y modo_ncf (enum: 'automatico', 'manual', default: 'automatico') que determina cómo se asignan los números de comprobante fiscal a las facturas. Una Empresa puede tener múltiples Usuarios y múltiples API Keys.
- **Usuario**: Una entrada en la tabla `usuarios` de la base de datos que representa una persona individual que pertenece a exactamente una Empresa, con credenciales de acceso (email, contraseña) y un rol asignado (admin, facturador, lector).
- **Registro_Factura**: Una entrada en la tabla `facturas_electronicas` de la base de datos que representa una transacción e-CF enviada.
- **Monitor_Salud**: El componente que verifica la disponibilidad del API Gateway y el estado de conectividad con los servicios de la DGII.
- **ID_Correlacion**: Un identificador único propagado en todas las entradas de log de una solicitud, permitiendo trazabilidad de extremo a extremo.
- **API_Key**: Una clave secreta única de 256 bits asociada a una Empresa (no a un Usuario individual), utilizada para autenticación de sistemas externos (ERPs, aplicaciones) que consumen el API Gateway. Una Empresa puede tener múltiples API Keys con scopes configurables.
- **OAuth2**: Protocolo de autorización utilizado para la autenticación de usuarios humanos mediante el flujo Authorization Code con PKCE, emitiendo Access Tokens y Refresh Tokens.
- **Access_Token**: Un JSON Web Token (JWT) firmado con RS256 y expiración de 15 minutos, conteniendo claims: usuario_id, empresa_id, rnc y rol. Utilizado para autenticación de usuarios humanos en endpoints protegidos.
- **Refresh_Token**: Un token opaco (UUID) almacenado como hash en la base de datos con expiración de 7 días, utilizado para obtener nuevos Access Tokens sin requerir re-autenticación del usuario.
- **Scope**: Un permiso granular asignado a un API Key que define las operaciones permitidas para ese sistema externo (por ejemplo: facturas:write, facturas:read, pdf:read).
- **Rol**: El nivel de acceso asignado a un Usuario dentro de una Empresa. Valores válidos: admin (acceso completo), facturador (envío y consulta de facturas propias), lector (solo lectura). Estos son roles a nivel de empresa. El rol Super_Admin es un rol a nivel de plataforma que se gestiona en una tabla separada `super_admins`.
- **JWT**: JSON Web Token — un token firmado con RS256 y expiración configurable que contiene claims del usuario (usuario_id, empresa_id, RNC, rol) para autenticación de solicitudes.
- **Interfaz_Onboarding**: La aplicación web tipo Single Page Application construida con React y servida por el API Gateway que funciona como aplicación web completa, incluyendo el flujo de onboarding (registro de empresa, creación del usuario administrador y carga de certificados), gestión del catálogo de productos/servicios y creación de facturas electrónicas.
- **Catalogo_Item**: Una entrada en la tabla `catalogo_items` que representa un producto o servicio ofrecido por una Empresa, con información de precio y tasa de ITBIS asociada.
- **Interfaz_Facturacion**: La interfaz web dentro de la React SPA que permite a usuarios humanos crear facturas electrónicas seleccionando ítems del catálogo, especificando receptores y enviando el documento a la DGII.
- **Plan**: Un registro en la tabla `planes` que define un nivel de suscripción con nombre, límite mensual de facturas, precio mensual en DOP y estado. Planes disponibles: Básico (50 facturas/mes), Profesional (200 facturas/mes), Empresarial (ilimitado).
- **Super_Admin**: Un rol de plataforma (distinto a los roles de empresa) que puede gestionar planes, asignar planes a empresas y administrar la plataforma globalmente. No pertenece a ninguna Empresa específica. Se almacena en una tabla separada `super_admins` con campos: id (UUID), email (unique), password_hash, nombre, activo, created_at. Los Super_Admins se autentican vía el mismo endpoint de login pero reciben un JWT con rol="super_admin" y sin empresa_id.
- **Contador_Facturas**: El conteo mensual de facturas generadas por una Empresa, representado por el campo `facturas_generadas` en la tabla `uso_mensual` para el mes y año actual, que se compara contra el límite del Plan asignado. Se reinicia implícitamente cada mes al crearse un nuevo registro `uso_mensual`.
- **Uso_Mensual**: Un registro pre-calculado en la tabla `uso_mensual` que rastrea el número de facturas generadas por una Empresa en un mes específico, incrementado atómicamente con cada creación exitosa de factura. Contiene snapshots del límite del plan y nombre del plan al momento de su creación.
- **Secuencia_NCF**: Un registro en la tabla `secuencias_ncf` que representa un rango autorizado de números e-NCF para un tipo de documento específico dentro de una Empresa. Contiene: prefijo/indicador de tipo, número de inicio, número de fin, número actual (siguiente a utilizar) y estado activo.
- **Tipo_Comprobante**: El tipo de documento fiscal que determina el prefijo del e-NCF. Tipos comunes: E31 (Factura de Crédito Fiscal), E32 (Factura de Consumo), E33 (Nota de Débito), E34 (Nota de Crédito), E41 (Compras), E43 (Gastos Menores), E44 (Regímenes Especiales), E45 (Gubernamental).
- **Modo_NCF**: Configuración a nivel de Empresa que determina cómo se asignan los números e-NCF a las facturas. Valores: "automatico" (el sistema asigna el siguiente número disponible de la secuencia) o "manual" (el usuario debe proveer el e-NCF en el payload de la factura).
- **Estado_DGII_Polling**: Componente que periódicamente consulta el estado de los e-CF enviados a la DGII usando el servicio de consulta de estado, actualizando el Registro_Factura con el estado definitivo (aprobado, rechazado, en proceso).
- **Anulacion_eCF**: El proceso de cancelar un e-CF previamente enviado y aceptado por la DGII. Requiere enviar un documento XML de anulación firmado digitalmente y obtener confirmación de la DGII.
- **Log_Auditoria**: Un registro inmutable en la tabla `auditoria` que captura todas las acciones fiscalmente relevantes (envío de facturas, anulaciones, cambios de certificados, cambios de configuración) con timestamp, actor, acción, empresa_id y datos antes/después del cambio.
- **Webhook**: Una URL configurada por la Empresa a la cual el sistema enviará notificaciones HTTP POST cuando ocurran eventos relevantes (factura aceptada, factura rechazada, secuencia NCF agotándose, etc.).
- **Validador_RNC**: Componente que verifica la existencia y estado activo de un RNC receptor contra el servicio de consulta de la DGII antes de procesar una factura.

## Requirements

### Requisito 1: Onboarding de Empresa PYME vía Interfaz Web

**Historia de Usuario:** Como propietario de una PYME, quiero registrar mi empresa, crear mi cuenta de administrador y subir mis certificados digitales a través de la aplicación web, para que el proceso de activación sea intuitivo sin necesidad de integración técnica inicial.

#### Criterios de Aceptación

1. THE API_Gateway SHALL servir una aplicación web accesible en la ruta `/app` que incluya un módulo de onboarding con un formulario de registro con campos de empresa: nombre de empresa (máximo 150 caracteres) y RNC (formato alfanumérico de 9 u 11 caracteres); y campos del usuario administrador: nombre completo (máximo 100 caracteres), correo electrónico (formato RFC 5322 válido) y contraseña (mínimo 8 caracteres, al menos una letra mayúscula, una minúscula y un dígito).
2. WHEN un nuevo cliente completa el formulario de registro con datos válidos y hace clic en "Registrar", THE API_Gateway SHALL crear una nueva Empresa con estado "certificacion" y un Usuario con rol "admin" asociado a esa Empresa, y redirigir al paso de carga de certificado en un tiempo máximo de 3 segundos.
3. IF un cliente intenta registrarse con un RNC que ya existe en una Empresa, THEN THE API_Gateway SHALL mostrar un mensaje de error en la interfaz web indicando que el RNC ya se encuentra registrado, sin crear un registro duplicado.
4. IF un cliente intenta registrarse con un correo electrónico que ya existe en la tabla de Usuarios, THEN THE API_Gateway SHALL mostrar un mensaje de error en la interfaz web indicando que el correo electrónico ya se encuentra registrado.
5. WHEN un cliente registrado accede al paso de carga de certificado en la interfaz web, THE API_Gateway SHALL presentar un formulario de subida de archivo que acepte archivos .p12 o .pfx con un tamaño máximo de 10 MB, junto con el campo de contraseña del certificado.
6. WHEN el cliente sube un archivo Certificado_PKCS12 con su contraseña a través de la interfaz web, THE API_Gateway SHALL validar que el certificado es un PKCS12 válido, que no está expirado, y que el RNC del certificado coincide con el RNC de la Empresa.
7. WHEN el Certificado_PKCS12 es validado exitosamente, THE API_Gateway SHALL encriptar el certificado con AES-256-GCM, almacenarlo en la Empresa, actualizar el estado a "activo", y mostrar una pantalla de confirmación indicando que la empresa ha sido activada exitosamente.
8. IF el Certificado_PKCS12 está expirado o es inválido, THEN THE API_Gateway SHALL mostrar un mensaje de error en la interfaz web indicando el motivo del rechazo y permitir al usuario subir un nuevo archivo sin perder su sesión de registro.
9. IF el RNC del certificado no coincide con el RNC de la Empresa, THEN THE API_Gateway SHALL mostrar un mensaje de error indicando discrepancia de RNC en la interfaz web y permitir al usuario subir un archivo diferente.
10. IF el archivo subido excede 10 MB o no tiene extensión .p12 ni .pfx, THEN THE API_Gateway SHALL rechazar la subida y mostrar un mensaje de error indicando el formato o tamaño aceptado.
11. THE API_Gateway SHALL implementar la aplicación web como una Single Page Application construida con React que incluya módulos de onboarding, gestión de catálogo y creación de facturas, con validación de formularios en el cliente antes del envío al servidor.
12. THE API_Gateway SHALL almacenar la contraseña del Usuario administrador usando bcrypt con un costo mínimo de 12 rondas.

### Requisito 2A: Autenticación de Usuarios Humanos (OAuth 2.0)

**Historia de Usuario:** Como usuario de una PYME, quiero autenticarme con mi correo electrónico y contraseña para obtener tokens de acceso, para que pueda interactuar con el sistema de forma segura desde la aplicación web o móvil.

#### Criterios de Aceptación

1. WHEN un Usuario envía una solicitud POST a `/api/v1/auth/login` con correo electrónico y contraseña que coinciden con un Usuario activo perteneciente a una Empresa con estado "activo", THE API_Gateway SHALL devolver una respuesta 200 con un Access_Token (JWT firmado con RS256, expiración de 15 minutos) conteniendo los claims: usuario_id, empresa_id, rnc y rol, junto con un Refresh_Token (UUID opaco, expiración de 7 días).
2. THE API_Gateway SHALL almacenar el hash SHA-256 del Refresh_Token en la tabla `refresh_tokens` de la base de datos junto con usuario_id, empresa_id, fecha de expiración y estado (activo/revocado).
3. WHEN un Usuario envía una solicitud POST a `/api/v1/auth/refresh` con un Refresh_Token válido y no expirado, THE API_Gateway SHALL devolver una respuesta 200 con un nuevo Access_Token y un nuevo Refresh_Token, revocando el Refresh_Token anterior.
4. WHEN un Usuario envía una solicitud POST a `/api/v1/auth/logout` con un Refresh_Token válido, THE API_Gateway SHALL revocar el Refresh_Token en la base de datos y devolver una respuesta 200 confirmando el cierre de sesión.
5. WHEN una solicitud es recibida en cualquier endpoint protegido con un header `Authorization: Bearer {access_token}`, THE API_Gateway SHALL verificar la firma RS256 del JWT, validar que no ha expirado, y extraer los claims (usuario_id, empresa_id, rnc, rol) para el contexto de autorización.
6. IF el Access_Token ha expirado, tiene firma inválida o está malformado, THEN THE API_Gateway SHALL devolver una respuesta 401 Unauthorized sin revelar detalles sobre el motivo específico del fallo.
7. IF un Usuario envía una solicitud POST a `/api/v1/auth/login` con correo electrónico o contraseña que no coinciden con un Usuario registrado, THEN THE API_Gateway SHALL devolver una respuesta 401 Unauthorized sin revelar si el correo electrónico existe o si la contraseña es incorrecta.
8. IF la Empresa del Usuario tiene estado "inactivo" o "certificacion", THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden indicando que la empresa no está completamente activada.
9. IF un Usuario acumula 5 intentos fallidos de login consecutivos dentro de una ventana de 15 minutos, THEN THE API_Gateway SHALL bloquear los intentos de login para ese correo electrónico por 15 minutos y devolver una respuesta 429 Too Many Requests.
10. IF un Usuario autenticado excede las 100 solicitudes por minuto, THEN THE API_Gateway SHALL devolver una respuesta 429 Too Many Requests con un header `Retry-After` indicando los segundos restantes hasta que la ventana de rate limiting se reinicie.
11. THE API_Gateway SHALL almacenar las contraseñas de Usuarios usando bcrypt con un costo mínimo de 12 rondas.
12. THE API_Gateway SHALL firmar los Access_Tokens con una clave privada RSA (RS256) y verificarlos con la clave pública correspondiente.

### Requisito 2B: Autenticación de Sistemas Externos (API Keys)

**Historia de Usuario:** Como desarrollador de un ERP o sistema externo, quiero autenticar mis solicitudes al API Gateway mediante un API key, para que mi sistema pueda enviar facturas de forma automatizada sin intervención humana.

#### Criterios de Aceptación

1. WHEN una solicitud es recibida en cualquier endpoint protegido con un header `X-API-Key`, THE API_Gateway SHALL buscar el hash SHA-256 del API key en la tabla `api_keys`, verificar que el registro está activo y que la Empresa asociada tiene estado "activo".
2. WHEN un API_Key válido es verificado, THE API_Gateway SHALL extraer la empresa_id y los scopes asociados para el contexto de autorización, y actualizar el campo last_used_at del registro de API_Key.
3. IF el API_Key proporcionado no existe en la base de datos, está revocado (activo=false) o la Empresa asociada no tiene estado "activo", THEN THE API_Gateway SHALL devolver una respuesta 401 Unauthorized sin revelar detalles sobre el motivo específico del fallo.
4. WHEN un sistema externo autenticado por API_Key intenta acceder a un endpoint, THE API_Gateway SHALL verificar que los scopes del API_Key incluyen el permiso requerido para la operación solicitada (por ejemplo: facturas:write para enviar facturas, facturas:read para consultar, pdf:read para descargar PDFs).
5. IF los scopes del API_Key no incluyen el permiso requerido para la operación solicitada, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden indicando que el API key no tiene permisos suficientes para la operación.
6. IF un API_Key excede las 1000 solicitudes por minuto, THEN THE API_Gateway SHALL devolver una respuesta 429 Too Many Requests con un header `Retry-After` indicando los segundos restantes hasta que la ventana de rate limiting se reinicie.
7. THE API_Gateway SHALL generar API Keys como valores aleatorios de 256 bits codificados en base64 y almacenar únicamente el hash SHA-256 en la base de datos.
8. THE API_Gateway SHALL soportar que una Empresa tenga múltiples API Keys activos simultáneamente, cada uno con un nombre descriptivo (por ejemplo: "produccion", "staging") y scopes independientes.

### Requisito 3: Gestión de Usuarios por Empresa

**Historia de Usuario:** Como administrador de una PYME, quiero gestionar los usuarios de mi empresa (crear, desactivar, asignar roles), para que pueda controlar quién accede al sistema y con qué permisos.

#### Criterios de Aceptación

1. WHEN un Usuario con rol "admin" envía una solicitud POST a `/api/v1/usuarios` con nombre completo, correo electrónico, contraseña y rol (admin, facturador o lector), THE API_Gateway SHALL crear un nuevo Usuario asociado a la misma Empresa del administrador y devolver una respuesta 201 con los datos del Usuario creado (sin incluir la contraseña).
2. IF un Usuario con rol distinto a "admin" intenta crear, modificar o desactivar un Usuario, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden indicando que solo administradores pueden gestionar usuarios.
3. WHEN un Usuario con rol "admin" envía una solicitud PATCH a `/api/v1/usuarios/{usuario_id}` con campo activo=false, THE API_Gateway SHALL desactivar el Usuario, revocar todos sus Refresh_Tokens activos y devolver una respuesta 200 confirmando la desactivación.
4. IF un Usuario con rol "admin" intenta gestionar un Usuario que pertenece a una Empresa diferente, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden y registrar el intento con nivel WARNING incluyendo el ID_Correlacion.
5. WHEN un Usuario con rol "admin" envía una solicitud GET a `/api/v1/usuarios`, THE API_Gateway SHALL devolver una lista de todos los Usuarios pertenecientes a la misma Empresa del administrador, incluyendo: usuario_id, nombre, correo electrónico, rol y estado (activo/inactivo).
6. WHEN un Usuario con rol "admin" envía una solicitud PATCH a `/api/v1/usuarios/{usuario_id}` con un nuevo rol válido, THE API_Gateway SHALL actualizar el rol del Usuario y devolver una respuesta 200 confirmando el cambio.
7. IF el correo electrónico proporcionado para un nuevo Usuario ya existe en la tabla de Usuarios, THEN THE API_Gateway SHALL devolver una respuesta 409 Conflict indicando que el correo electrónico ya está registrado.
8. THE API_Gateway SHALL garantizar que una Empresa siempre tenga al menos un Usuario con rol "admin" activo, rechazando la desactivación o cambio de rol del último administrador activo con una respuesta 409 Conflict.

### Requisito 4: Gestión de API Keys por Empresa

**Historia de Usuario:** Como administrador de una PYME, quiero crear, rotar y revocar API keys para mi empresa, para que pueda gestionar el acceso de los sistemas externos de forma segura.

#### Criterios de Aceptación

1. WHEN un Usuario con rol "admin" envía una solicitud POST a `/api/v1/api-keys` con nombre y scopes (arreglo de strings), THE API_Gateway SHALL generar un nuevo API_Key de 256 bits, almacenar su hash SHA-256 en la tabla `api_keys` con la empresa_id del administrador, y devolver una respuesta 201 con el API key en texto plano (única vez que se muestra).
2. WHEN un Usuario con rol "admin" envía una solicitud GET a `/api/v1/api-keys`, THE API_Gateway SHALL devolver una lista de todos los API Keys de su Empresa incluyendo: id, nombre, scopes, activo, created_at y last_used_at (sin incluir el key ni el hash).
3. WHEN un Usuario con rol "admin" envía una solicitud POST a `/api/v1/api-keys/{api_key_id}/rotate`, THE API_Gateway SHALL revocar el API_Key actual, generar un nuevo API_Key de 256 bits con los mismos scopes y nombre, y devolver una respuesta 200 con el nuevo API key en texto plano.
4. WHEN un Usuario con rol "admin" envía una solicitud DELETE a `/api/v1/api-keys/{api_key_id}`, THE API_Gateway SHALL marcar el API_Key como inactivo (activo=false) y devolver una respuesta 200 confirmando la revocación.
5. IF un Usuario con rol distinto a "admin" intenta crear, rotar o revocar un API_Key, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden indicando que solo administradores pueden gestionar API keys.
6. IF un Usuario con rol "admin" intenta gestionar un API_Key que pertenece a una Empresa diferente, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden y registrar el intento con nivel WARNING incluyendo el ID_Correlacion.
7. THE API_Gateway SHALL validar que los scopes proporcionados al crear un API_Key sean valores válidos del conjunto permitido: facturas:write, facturas:read, pdf:read, estado:read.
8. IF los scopes proporcionados contienen valores no válidos, THEN THE API_Gateway SHALL devolver una respuesta 400 Bad Request indicando los scopes inválidos.

### Requisito 5: Solicitud de Semilla a la DGII

**Historia de Usuario:** Como operador del API Gateway, quiero que el sistema solicite una semilla temporal al servicio SOAP de la DGII, para que se pueda iniciar el handshake de autenticación para la adquisición del token de transmisión.

#### Criterios de Aceptación

1. WHEN un Bearer_Token no está presente en el Cache_Token para una Empresa dada, THE API_Gateway SHALL enviar una solicitud SOAP al endpoint de semilla de la DGII con un timeout de 10 segundos y recibir un documento XML de Semilla que contenga los elementos esperados por el protocolo de autenticación de la DGII.
2. IF el endpoint de semilla de la DGII devuelve un error SOAP, un código HTTP distinto a 200, o no responde dentro del timeout de 10 segundos, THEN THE API_Gateway SHALL registrar el error con un ID_Correlacion y devolver una respuesta 503 Service Unavailable al llamante.
3. WHEN una Semilla es recibida de la DGII, THE API_Gateway SHALL validar que el XML de la Semilla es un documento XML bien formado según la especificación W3C XML 1.0 y que contiene el elemento raíz esperado antes de proceder al paso de firma.
4. IF el XML de la Semilla recibido no es un documento XML bien formado o no contiene el elemento raíz esperado, THEN THE API_Gateway SHALL registrar el fallo de validación con un ID_Correlacion y devolver una respuesta 502 Bad Gateway indicando que la respuesta de la DGII no pudo ser procesada.

### Requisito 6: Firma Digital de la Semilla

**Historia de Usuario:** Como operador del API Gateway, quiero que el sistema firme digitalmente la semilla de la DGII usando el certificado .p12 de la empresa, para que la semilla firmada pueda ser enviada de vuelta para obtener un token de acceso.

#### Criterios de Aceptación

1. WHEN un XML de Semilla válido es recibido de la DGII, THE Servicio_Firma SHALL recuperar el Certificado_PKCS12 de la Empresa solicitante desde PostgreSQL y desencriptarlo usando la clave AES-256 del Proveedor_Secretos en un tiempo máximo de 5 segundos.
2. WHEN el Certificado_PKCS12 es desencriptado, THE Servicio_Firma SHALL firmar el XML de la Semilla usando una firma XML-DSig Enveloped Signature con algoritmo de canonicalización Exclusive XML Canonicalization, digest SHA-256 y firma RSA-SHA256.
3. IF el Certificado_PKCS12 no puede ser desencriptado o está expirado, THEN THE API_Gateway SHALL devolver una respuesta 401 Unauthorized con un mensaje de error indicando la causa específica del fallo: desencriptación fallida o certificado expirado, junto con el ID_Correlacion de la solicitud.
4. IF la Empresa solicitante no tiene un Certificado_PKCS12 almacenado, THEN THE API_Gateway SHALL devolver una respuesta 401 Unauthorized con un mensaje de error indicando ausencia de certificado y el ID_Correlacion de la solicitud.

### Requisito 7: Adquisición y Almacenamiento en Caché del Token

**Historia de Usuario:** Como operador del API Gateway, quiero que el sistema envíe la semilla firmada a la DGII y almacene en caché el token resultante, para que envíos de facturas subsiguientes puedan autenticarse sin repetir el handshake.

#### Criterios de Aceptación

1. WHEN una Semilla XML firmada está lista, THE API_Gateway SHALL enviar la Semilla firmada al endpoint de token de la DGII vía SOAP con un timeout máximo de 10 segundos y recibir un Bearer_Token.
2. WHEN un Bearer_Token es recibido de la DGII, THE API_Gateway SHALL almacenar el Bearer_Token en el Cache_Token con un TTL de 3540 segundos (59 minutos) para compensar la desviación de reloj, usando como clave de caché el identificador único de la Empresa solicitante.
3. WHEN una solicitud de autenticación es requerida y un Bearer_Token existe en el Cache_Token para la Empresa solicitante (es decir, la clave no ha expirado por TTL), THE API_Gateway SHALL reutilizar el token en caché sin iniciar un nuevo handshake de autenticación.
4. IF el endpoint de token de la DGII rechaza la semilla firmada con una respuesta de error explícita, THEN THE API_Gateway SHALL registrar los detalles del rechazo con un ID_Correlacion y devolver una respuesta 401 Unauthorized.
5. IF el endpoint de token de la DGII es inalcanzable o no responde dentro del timeout de 10 segundos, THEN THE API_Gateway SHALL registrar el error con un ID_Correlacion y devolver una respuesta 503 Service Unavailable al llamante.
6. IF el Cache_Token (Redis) es inalcanzable al momento de almacenar o consultar un Bearer_Token, THEN THE API_Gateway SHALL proceder a realizar un nuevo handshake de autenticación con la DGII y registrar una advertencia con un ID_Correlacion.

### Requisito 8: Validación del Payload JSON de Factura

**Historia de Usuario:** Como desarrollador de PYME, quiero que la API valide mi payload JSON de factura antes de procesarlo, para que reciba retroalimentación inmediata sobre errores estructurales sin esperar el rechazo de la DGII.

#### Criterios de Aceptación

1. WHEN una solicitud POST es recibida en `/api/v1/facturas`, THE Validador SHALL validar el payload JSON contra el esquema Zod que exige los campos requeridos: RNC emisor, RNC receptor, al menos 1 ítem en el arreglo de detalles (cada ítem con descripción, cantidad mayor a 0, precio unitario no negativo y tasa de ITBIS), montos y desglose de ITBIS.
2. IF el payload JSON falla la validación Zod, THEN THE API_Gateway SHALL devolver una respuesta 400 Bad Request conteniendo un arreglo de errores de validación donde cada error incluya la ruta del campo (en notación dot-path) y un mensaje describiendo la restricción violada.
3. THE Validador SHALL aplicar el formato de RNC como una cadena numérica de exactamente 9 o exactamente 11 dígitos, rechazando valores que contengan caracteres no numéricos o longitudes distintas.
4. THE Validador SHALL verificar que el monto total sea igual a la suma de los subtotales de ítems más los montos de ITBIS, con una tolerancia máxima de 0.01 unidades monetarias por redondeo.
5. IF el cuerpo de la solicitud no es un JSON válido (sintaxis malformada), THEN THE API_Gateway SHALL devolver una respuesta 400 Bad Request con un mensaje de error indicando fallo de parseo del JSON, sin invocar la validación de esquema Zod.
6. THE Validador SHALL aplicar la validación del campo e_ncf en función del Modo_NCF configurado en la Empresa: si modo_ncf es "manual", el campo e_ncf es requerido en el payload; si modo_ncf es "automatico", el campo e_ncf es opcional y será ignorado (el sistema lo asignará automáticamente desde la Secuencia_NCF activa).

### Requisito 9: Conversión de JSON a XML

**Historia de Usuario:** Como operador del API Gateway, quiero que el sistema convierta facturas JSON validadas a XML conforme con la DGII, para que el documento cumpla con el esquema XSD oficial del e-CF antes de la firma.

#### Criterios de Aceptación

1. WHEN un payload JSON pasa la validación, THE Conversor_XML SHALL transformar el payload en un documento XML con codificación UTF-8 y declaración XML estándar, conforme al esquema XSD de e-CF de la DGII, en un tiempo no mayor a 2 segundos.
2. THE Conversor_XML SHALL producir documentos XML que pasen la validación contra la versión activa del esquema XSD de la DGII, incluyendo namespaces y estructura de elementos requeridos por el esquema.
3. WHEN el esquema XSD de la DGII es actualizado, THE Conversor_XML SHALL soportar la carga de una nueva versión del XSD sin requerir redespliegue de la aplicación.
4. THE Conversor_XML SHALL preservar todos los valores de campos del payload JSON original en el XML generado, de modo que al parsear el XML de vuelta a un objeto estructurado, cada campo conserve su valor semántico y precisión numérica (propiedad de ida y vuelta).
5. IF la transformación de JSON a XML falla debido a datos incompatibles con la estructura XSD activa, THEN THE Conversor_XML SHALL devolver una respuesta 422 Unprocessable Entity con un mensaje de error indicando los campos o elementos que no pudieron mapearse al esquema, incluyendo el ID_Correlacion.

### Requisito 10: Firma Digital XAdES-BES del e-CF

**Historia de Usuario:** Como operador del API Gateway, quiero que el sistema firme el XML de la factura con XAdES-BES usando el certificado de la empresa, para que la DGII acepte el documento como auténticamente emitido por el contribuyente.

#### Criterios de Aceptación

1. WHEN un documento XML válido es producido por el Conversor_XML, THE Servicio_Firma SHALL recuperar el Certificado_PKCS12 de la Empresa desde PostgreSQL, desencriptarlo usando la clave AES-256 del Proveedor_Secretos, y aplicar una firma digital XAdES-BES enveloped usando la clave privada extraída del certificado.
2. THE Servicio_Firma SHALL embeber la cadena completa de certificados X.509 en el XML firmado como elemento KeyInfo dentro del bloque ds:Signature.
3. THE Servicio_Firma SHALL usar Exclusive XML Canonicalization (exc-c14n) como método de canonicalización, SHA-256 como algoritmo de digest y RSA-SHA256 como algoritmo de firma.
4. THE Servicio_Firma SHALL incluir un elemento xades:SignedProperties conteniendo la referencia al certificado firmante (xades:SigningCertificate con digest SHA-256) y el timestamp de firma (xades:SigningTime en formato UTC ISO 8601).
5. IF la operación de firma falla debido a un certificado expirado, inválido, corrupto o a un error en la extracción de la clave privada, THEN THE API_Gateway SHALL devolver una respuesta 500 Internal Server Error con un mensaje de error indicando el tipo de fallo de firma y referenciando el ID_Correlacion.

### Requisito 11: Transmisión del XML Firmado a la DGII

**Historia de Usuario:** Como operador del API Gateway, quiero que el sistema transmita el XML firmado a la DGII y obtenga un Track_ID, para que la factura quede oficialmente registrada ante la autoridad tributaria.

#### Criterios de Aceptación

1. WHEN un documento XML firmado está listo, THE API_Gateway SHALL transmitir el documento al endpoint de recepción e-CF de la DGII usando el Bearer_Token para autenticación con un timeout máximo de 30 segundos.
2. WHEN la DGII devuelve una respuesta exitosa, THE API_Gateway SHALL extraer el Track_ID de la respuesta, actualizar el Registro_Factura correspondiente y devolverlo al llamante en una respuesta JSON con estado HTTP 201.
3. IF el endpoint de recepción de la DGII devuelve un rechazo, THEN THE API_Gateway SHALL almacenar los detalles del rechazo en el Registro_Factura, actualizar el estado_dgii a "rechazado" y devolver una respuesta 422 Unprocessable Entity con los códigos de error de la DGII.
4. IF el endpoint de recepción de la DGII es inalcanzable (timeout de conexión, fallo DNS o respuesta HTTP 5xx), THEN THE API_Gateway SHALL encolar la transmisión en la Cola_Reintentos con backoff exponencial comenzando en 5 segundos.
5. IF la DGII devuelve un error 401 indicando token expirado, THEN THE API_Gateway SHALL invalidar el Bearer_Token en Cache_Token, iniciar un nuevo handshake de autenticación y reintentar la transmisión una vez con el nuevo token.

### Requisito 12: Circuit Breaker para Resiliencia con DGII

**Historia de Usuario:** Como operador del API Gateway, quiero que el sistema use un patrón circuit breaker para la comunicación con la DGII, para que se prevengan fallos en cascada durante caídas del servicio de la DGII.

#### Criterios de Aceptación

1. WHILE el Circuit_Breaker está en estado OPEN, THE API_Gateway SHALL rechazar solicitudes de transmisión a la DGII sin reenviarlas al endpoint de la DGII y devolver una respuesta 503 Service Unavailable con un header `retry-after` cuyo valor sea igual al tiempo restante del período OPEN (máximo 30 segundos).
2. WHEN el Circuit_Breaker detecta 5 fallos consecutivos al endpoint de la DGII dentro de una ventana de 60 segundos, THE Circuit_Breaker SHALL transicionar del estado CLOSED al estado OPEN. Un fallo se define como: timeout de conexión, error de red, o respuesta HTTP con código de estado 500, 502, 503 o 504.
3. WHEN el Circuit_Breaker está en estado OPEN por 30 segundos, THE Circuit_Breaker SHALL transicionar al estado HALF-OPEN y permitir una única solicitud de prueba al endpoint de la DGII.
4. WHEN una solicitud de prueba en estado HALF-OPEN recibe una respuesta HTTP con código de estado 2xx de la DGII, THE Circuit_Breaker SHALL transicionar de vuelta al estado CLOSED y restablecer el contador de fallos a cero.
5. IF una solicitud de prueba en estado HALF-OPEN falla (timeout, error de red o respuesta HTTP 5xx), THEN THE Circuit_Breaker SHALL transicionar de vuelta al estado OPEN e iniciar un nuevo período de espera de 30 segundos.

### Requisito 13: Persistencia de Transacciones

**Historia de Usuario:** Como desarrollador de PYME, quiero que todas las transacciones de facturación se almacenen en la base de datos, para que pueda consultar el historial de envíos y rastrear el estado de procesamiento en la DGII.

#### Criterios de Aceptación

1. WHEN una factura es enviada vía POST `/api/v1/facturas`, THE API_Gateway SHALL crear un Registro_Factura con el payload JSON, e-NCF, empresa_id, usuario_id (si la solicitud fue autenticada por un Usuario) o api_key_id (si fue autenticada por API_Key), estado_dgii inicial de "enviado" y timestamp created_at con la fecha y hora UTC del momento de creación.
2. WHEN la DGII devuelve un Track_ID exitoso, THE API_Gateway SHALL actualizar el Registro_Factura correspondiente con el valor del Track_ID y establecer el campo estado_dgii a "aceptado".
3. WHEN el XML firmado es generado, THE API_Gateway SHALL subir el XML al Almacenamiento_Objetos y almacenar la URL del objeto en el campo xml_s3_url del Registro_Factura dentro de los 30 segundos siguientes a la generación.
4. THE API_Gateway SHALL asignar un UUID v4 como clave primaria para cada nuevo Registro_Factura.
5. IF la subida del XML al Almacenamiento_Objetos falla, THEN THE API_Gateway SHALL registrar el error con el ID_Correlacion, mantener el Registro_Factura con xml_s3_url nulo, y reintentar la subida en la Cola_Reintentos con un máximo de 3 intentos.
6. IF la creación del Registro_Factura falla por un error de base de datos, THEN THE API_Gateway SHALL devolver una respuesta 500 Internal Server Error al llamante con el ID_Correlacion y no proceder con la firma ni transmisión del documento.

### Requisito 14: Generación de Código QR

**Historia de Usuario:** Como operador de PYME, quiero que se genere un código QR para cada factura aprobada, para que los documentos impresos incluyan un enlace de verificación escaneable como lo requiere la ley dominicana.

#### Criterios de Aceptación

1. WHEN una factura recibe un Track_ID exitoso de la DGII, THE Generador_PDF SHALL generar un código QR conteniendo la URL de consulta de la DGII, RNC emisor, RNC receptor, número de e-NCF y monto total, obtenidos del Registro_Factura asociado.
2. THE Generador_PDF SHALL codificar el código QR como una imagen PNG con una resolución mínima de 150x150 píxeles, utilizando un nivel de corrección de errores mínimo "M" (15% de recuperación) para garantizar legibilidad en documentos impresos.
3. THE Generador_PDF SHALL formatear el payload del QR siguiendo el patrón de URL especificado por la DGII para verificación de documentos fiscales, concatenando los parámetros RNC emisor, RNC receptor, e-NCF y monto total con dos decimales sin símbolo de moneda.
4. IF la generación del código QR falla por datos faltantes o error de codificación, THEN THE Generador_PDF SHALL registrar el error con el ID_Correlacion y devolver un error indicando que la representación impresa no pudo ser generada, sin bloquear la respuesta del Track_ID al cliente.

### Requisito 15: Generación de PDF de Factura

**Historia de Usuario:** Como operador de PYME, quiero una representación PDF de cada factura, para que pueda proveer copias impresas a los clientes como lo requieren las regulaciones fiscales.

#### Criterios de Aceptación

1. WHEN un código QR de factura es generado, THE Generador_PDF SHALL crear un documento PDF en formato ticket (80mm de ancho) o formato factura completa (tamaño carta) según la preferencia almacenada en la Empresa, usando formato factura completa (tamaño carta) como valor por defecto si no hay preferencia configurada.
2. THE Generador_PDF SHALL embeber la imagen del código QR con un tamaño mínimo de 25x25mm para garantizar escaneabilidad, encabezado de factura con RNC emisor y receptor, detalle de líneas de ítems, desglose de ITBIS y montos totales.
3. THE Generador_PDF SHALL incluir el número de e-NCF y el Track_ID en la sección de encabezado del PDF.
4. WHEN un PDF es generado, THE API_Gateway SHALL subir el PDF al Almacenamiento_Objetos en un bucket privado dentro de un timeout de 30 segundos y almacenar la URL del objeto en el campo pdf_s3_url del Registro_Factura.
5. IF la generación del PDF falla por error interno del Generador_PDF, THEN THE API_Gateway SHALL registrar el error con el ID_Correlacion, mantener el Registro_Factura sin pdf_s3_url y devolver una respuesta 500 indicando fallo en generación de PDF.
6. IF la subida del PDF al Almacenamiento_Objetos falla o excede el timeout de 30 segundos, THEN THE API_Gateway SHALL registrar el error con el ID_Correlacion y encolar un reintento de subida en la Cola_Reintentos con un máximo de 3 intentos.

### Requisito 16: URL Firmada Temporal para Descarga de PDF

**Historia de Usuario:** Como desarrollador de PYME, quiero obtener una URL temporal de descarga para el PDF generado, para que mis usuarios finales puedan descargar la factura sin acceso directo al almacenamiento de objetos.

#### Criterios de Aceptación

1. WHEN un cliente autenticado envía una solicitud GET a `/api/v1/facturas/{factura_id}/pdf`, THE API_Gateway SHALL generar una URL pre-firmada del Almacenamiento_Objetos con un TTL de 15 minutos y devolverla en una respuesta HTTP 200.
2. IF el Registro_Factura con el factura_id proporcionado no existe, THEN THE API_Gateway SHALL devolver una respuesta 404 Not Found indicando que la factura no fue encontrada.
3. IF el Registro_Factura no tiene un pdf_s3_url, THEN THE API_Gateway SHALL devolver una respuesta 404 Not Found indicando que el PDF aún no está disponible.
4. THE API_Gateway SHALL incluir la URL pre-firmada en el cuerpo de respuesta JSON junto con el timestamp de expiración en formato ISO 8601 UTC.
5. IF el cliente autenticado no pertenece a la misma Empresa propietaria del Registro_Factura solicitado, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden.

### Requisito 17: Almacenamiento y Encriptación de Certificados de Empresa

**Historia de Usuario:** Como operador de plataforma, quiero que los certificados de las empresas se almacenen encriptados en reposo, para que las claves privadas estén protegidas incluso si la base de datos es comprometida.

#### Criterios de Aceptación

1. WHEN un Usuario con rol "admin" sube un nuevo Certificado_PKCS12 para su Empresa, THE API_Gateway SHALL verificar que el archivo no exceda 10 KB de tamaño y encriptar el binario del certificado usando AES-256-GCM con la clave obtenida del Proveedor_Secretos, generando un vector de inicialización aleatorio de 12 bytes único por operación de encriptación.
2. THE API_Gateway SHALL almacenar el certificado encriptado en el campo certificado_encriptado de la Empresa, el vector de inicialización de 12 bytes en el campo salt_encriptacion, y el authentication tag de 16 bytes generado por GCM en el campo auth_tag de la Empresa.
3. THE API_Gateway SHALL realizar la encriptación y desencriptación usando el módulo crypto de Node.js a nivel de aplicación, y SHALL verificar el authentication tag durante cada operación de desencriptación para detectar manipulación de datos.
4. IF el Proveedor_Secretos no puede proporcionar la clave de encriptación dentro de 5 segundos, THEN THE API_Gateway SHALL devolver una respuesta 503 Service Unavailable y rehusarse a procesar operaciones de certificados.
5. WHEN una Empresa ya posee un certificado_encriptado y un Usuario con rol "admin" sube un nuevo Certificado_PKCS12, THE API_Gateway SHALL sobrescribir el certificado anterior con el nuevo certificado encriptado, generando un nuevo vector de inicialización y authentication tag.
6. IF el archivo subido excede 10 KB de tamaño, THEN THE API_Gateway SHALL devolver una respuesta 400 Bad Request indicando que el archivo excede el tamaño máximo permitido.
7. IF un Usuario con rol distinto a "admin" intenta subir o reemplazar un certificado, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden indicando que solo administradores pueden gestionar certificados.

### Requisito 18: Multi-Tenencia y Aislamiento de Empresas

**Historia de Usuario:** Como operador de plataforma, quiero que los datos de cada empresa estén aislados por tenant, para que una empresa no pueda acceder a los datos de otra empresa.

#### Criterios de Aceptación

1. THE API_Gateway SHALL asociar cada Registro_Factura con una Empresa específica mediante la clave foránea empresa_id y aplicar un índice en la columna empresa_id.
2. WHEN un cliente consulta su historial de facturas vía GET `/api/v1/facturas`, THE API_Gateway SHALL incluir un filtro WHERE empresa_id = {tenant_id} en todas las consultas y devolver únicamente los Registros_Factura pertenecientes al contexto de tenant de esa Empresa.
3. WHEN un cliente envía una factura, THE API_Gateway SHALL validar que el RNC emisor en el payload coincida con el RNC de la Empresa autenticada antes de procesar la solicitud.
4. IF el RNC emisor del payload no coincide con el RNC de la Empresa autenticada, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden indicando discrepancia de RNC emisor.
5. IF una solicitud intenta acceder a un Registro_Factura o Empresa perteneciente a un tenant diferente, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden y registrar el intento con nivel de severidad WARNING incluyendo el ID_Correlacion, el tenant solicitante y el recurso intentado.
6. THE API_Gateway SHALL garantizar que las operaciones de certificado (carga, lectura, desencriptación) solo sean accesibles para Usuarios con rol "admin" de la Empresa propietaria del certificado.
7. THE API_Gateway SHALL garantizar que todos los Usuarios de una Empresa solo puedan ver y operar sobre los datos de su propia Empresa, aplicando el filtro empresa_id en todas las consultas de datos.

### Requisito 19: Cola de Reintentos con Backoff Exponencial

**Historia de Usuario:** Como operador del API Gateway, quiero que las transmisiones fallidas a la DGII se reintenten automáticamente, para que errores transitorios de red no resulten en facturas perdidas.

#### Criterios de Aceptación

1. WHEN una transmisión a la DGII falla debido a un error de conexión, timeout de red (sin respuesta en 30 segundos) o respuesta HTTP 5xx del servidor, THE Cola_Reintentos SHALL encolar el trabajo de transmisión con un retraso inicial de 5 segundos y THE API_Gateway SHALL actualizar el estado_dgii del Registro_Factura a "reintentando".
2. THE Cola_Reintentos SHALL aplicar backoff exponencial con un multiplicador de 2 para cada intento de reintento subsiguiente (5s, 10s, 20s, 40s, 80s), hasta un máximo de 5 intentos de reintento y un retraso máximo de 80 segundos entre intentos.
3. WHEN el conteo máximo de reintentos es alcanzado sin éxito, THE API_Gateway SHALL actualizar el estado_dgii del Registro_Factura a "fallido" y publicar un evento en el sistema de eventos interno conteniendo la empresa_id, factura_id e ID_Correlacion para que los mecanismos de notificación suscritos alerten al cliente.
4. WHEN una transmisión reintentada tiene éxito, THE API_Gateway SHALL actualizar el Registro_Factura con el Track_ID y establecer estado_dgii a "aceptado".
5. WHILE el Circuit_Breaker está en estado OPEN, THE Cola_Reintentos SHALL pausar la ejecución de trabajos de reintento pendientes hasta que el Circuit_Breaker transite a estado HALF-OPEN o CLOSED.
6. IF la DGII devuelve un rechazo de negocio (error de validación del documento), THEN THE Cola_Reintentos SHALL NO reintentar la transmisión y THE API_Gateway SHALL actualizar el estado_dgii del Registro_Factura a "rechazado" con los detalles del error.

### Requisito 20: Health Check y Monitoreo de Estado DGII

**Historia de Usuario:** Como ingeniero DevOps, quiero endpoints de health check, para que pueda monitorear el estado operacional del API Gateway y la conectividad con la DGII.

#### Criterios de Aceptación

1. THE Monitor_Salud SHALL exponer un endpoint GET `/health` que devuelva HTTP 200 con un objeto JSON conteniendo: estado general ("up" o "down"), y por cada dependencia (PostgreSQL, Redis, Almacenamiento_Objetos) un objeto con campos nombre, estado ("up" o "down") y latencia en milisegundos, aplicando un timeout de 5 segundos por cada verificación de dependencia.
2. THE Monitor_Salud SHALL exponer un endpoint GET `/health/dgii` que envíe una solicitud al endpoint de semilla de la DGII con un timeout de 10 segundos y devuelva un objeto JSON con campos: estado ("up" o "down"), latencia en milisegundos y timestamp de la última verificación exitosa.
3. IF alguna dependencia crítica (PostgreSQL o Redis) no responde dentro del timeout de 5 segundos, THEN THE Monitor_Salud SHALL devolver HTTP 503 con un objeto JSON que identifique cada componente que falla por nombre y su estado como "down".
4. IF el endpoint de semilla de la DGII no responde dentro del timeout de 10 segundos o devuelve un error, THEN THE Monitor_Salud SHALL devolver HTTP 200 en el endpoint `/health/dgii` con el campo estado establecido a "down" y un campo mensaje indicando el tipo de fallo de conectividad.

### Requisito 21: Logging Estructurado con IDs de Correlación

**Historia de Usuario:** Como ingeniero DevOps, quiero que todas las entradas de log incluyan IDs de correlación, para que pueda rastrear una solicitud individual a través de todos los componentes del servicio.

#### Criterios de Aceptación

1. WHEN una solicitud HTTP es recibida, THE API_Gateway SHALL generar un ID_Correlacion único (UUID v4) y adjuntarlo a todas las entradas de log producidas durante el ciclo de vida de esa solicitud. IF la solicitud incluye un header `X-Correlation-ID` con un UUID v4 válido, THEN THE API_Gateway SHALL usar ese valor como ID_Correlacion en lugar de generar uno nuevo.
2. THE API_Gateway SHALL usar formato de log JSON estructurado con campos obligatorios: timestamp (formato ISO 8601 UTC), level (uno de: debug, info, warn, error, fatal), correlation_id, module, message; y campos opcionales: metadata (objeto), duration_ms (número).
3. THE API_Gateway SHALL incluir el ID_Correlacion en el header de respuesta `X-Correlation-ID` y en el cuerpo JSON de todas las respuestas de error devueltas al cliente.
4. WHEN un trabajo es encolado en la Cola_Reintentos, THE API_Gateway SHALL propagar el ID_Correlacion original de la solicitud al trabajo encolado, de modo que los logs del worker de reintentos sean trazables a la solicitud original.

### Requisito 22: Versionado de Esquema XSD

**Historia de Usuario:** Como operador de plataforma, quiero actualizar el esquema XSD de la DGII sin redesplegar la aplicación, para que los cambios de esquema de la DGII puedan adoptarse rápidamente.

#### Criterios de Aceptación

1. THE Conversor_XML SHALL cargar archivos de esquema XSD desde una ruta de archivo configurable o ubicación del Almacenamiento_Objetos al inicio de la aplicación, identificando la versión del esquema mediante el nombre del archivo o un campo de metadatos.
2. WHEN una nueva versión del esquema XSD es desplegada en la ubicación configurada, THE API_Gateway SHALL detectar y cargar el esquema actualizado dentro de 5 minutos sin requerir un reinicio, utilizando un mecanismo de polling o notificación de cambios.
3. THE API_Gateway SHALL registrar en log la versión activa del esquema XSD al inicio y en cada evento de recarga de esquema, incluyendo el timestamp de carga y el nombre del archivo de esquema.
4. IF el nuevo archivo XSD es inválido o no puede ser parseado, THEN THE API_Gateway SHALL mantener la versión anterior del esquema activa, registrar un error con nivel FATAL incluyendo el nombre del archivo rechazado, y continuar operando con el esquema previo.
5. WHEN una recarga de esquema XSD se ejecuta, THE API_Gateway SHALL completar las solicitudes en curso con la versión del esquema que tenían al momento de iniciar su procesamiento, aplicando la nueva versión solo a solicitudes recibidas después de la recarga.

### Requisito 23: Despliegue Docker Compose On-Premise

**Historia de Usuario:** Como operador de plataforma, quiero que el sistema completo se despliegue mediante un único archivo Docker Compose en mi servidor personal, para que pueda ejecutar el stack completo sin dependencias de servicios cloud.

#### Criterios de Aceptación

1. THE API_Gateway SHALL proveer un archivo docker-compose.yml que despliegue el stack completo: aplicación API Gateway, PostgreSQL 16, Redis 7 y MinIO como servicios.
2. THE API_Gateway SHALL empaquetarse como una imagen Docker basada en Node.js 20 Alpine con build multi-stage para minimizar el tamaño de la imagen.
3. THE docker-compose.yml SHALL configurar volúmenes persistentes para los datos de PostgreSQL, datos de Redis y almacenamiento de MinIO para prevenir pérdida de datos al reiniciar contenedores.
4. THE API_Gateway SHALL leer toda la configuración de infraestructura (URL de base de datos, URL de Redis, endpoint S3, clave de encriptación) desde variables de entorno, habilitando despliegue en Docker on-premise o AWS sin cambios de código.
5. THE docker-compose.yml SHALL incluir un health check para cada contenedor de servicio para habilitar reinicio automático en caso de fallo.
6. WHEN el sistema es desplegado on-premise, THE API_Gateway SHALL conectarse a MinIO usando la API compatible con S3 a través del SDK @aws-sdk/client-s3 con una URL de endpoint configurable.
7. THE API_Gateway SHALL soportar el cambio entre proveedores on-premise (MinIO, variables de entorno) y cloud (AWS S3, AWS Secrets Manager) únicamente mediante cambios en variables de entorno sin requerir modificaciones de código ni recompilación.

### Requisito 24: Portabilidad Cloud-Agnostic

**Historia de Usuario:** Como operador de plataforma, quiero que el sistema utilice capas de abstracción para los servicios de infraestructura, para que pueda migrar desde mi servidor Docker personal a AWS sin modificar el código de la aplicación.

#### Criterios de Aceptación

1. THE API_Gateway SHALL definir una interfaz (abstracción) para operaciones de almacenamiento de objetos (subir, descargar, generar URL pre-firmada) que pueda ser implementada por MinIO o AWS S3.
2. THE API_Gateway SHALL definir una interfaz para gestión de secretos (obtener clave de encriptación) que pueda ser implementada por variables de entorno, secretos basados en archivos, o AWS Secrets Manager.
3. THE API_Gateway SHALL usar inyección de dependencias de NestJS para seleccionar la implementación del proveedor de infraestructura basándose en variables de entorno al iniciar la aplicación.
4. THE API_Gateway SHALL usar el mismo SDK @aws-sdk/client-s3 para MinIO y AWS S3, diferenciándose únicamente en la configuración del endpoint.
5. THE API_Gateway SHALL NO importar ni referenciar ningún servicio específico de AWS directamente en los módulos de lógica de negocio; todas las interacciones con servicios cloud SHALL estar encapsuladas en módulos adaptadores de infraestructura.

### Requisito 25: Catálogo de Productos y Servicios

**Historia de Usuario:** Como operador de una PYME, quiero gestionar un catálogo de mis productos y servicios con precios y tasas de ITBIS, para que pueda seleccionar ítems rápidamente al crear facturas sin reingresar la información cada vez.

#### Criterios de Aceptación

1. WHEN un Usuario con rol "admin" o "facturador" envía una solicitud POST a `/api/v1/catalogo` con los campos tipo (producto o servicio), codigo (opcional, máximo 50 caracteres), descripcion (requerido, máximo 250 caracteres), precio_unitario (requerido, decimal positivo) y tasa_itbis (requerido, uno de: 0, 16, 18), THE API_Gateway SHALL crear un nuevo Catalogo_Item asociado a la empresa_id del usuario autenticado y devolver una respuesta 201 con los datos del ítem creado.
2. WHEN un Usuario envía una solicitud GET a `/api/v1/catalogo`, THE API_Gateway SHALL devolver únicamente los Catalogo_Items pertenecientes a la Empresa del usuario, soportando filtros opcionales por tipo (producto o servicio) y activo (true o false).
3. WHEN un Usuario con rol "admin" o "facturador" envía una solicitud PATCH a `/api/v1/catalogo/{item_id}`, THE API_Gateway SHALL actualizar los campos especificados del Catalogo_Item y devolver una respuesta 200 con los datos actualizados.
4. WHEN un Usuario con rol "admin" o "facturador" envía una solicitud DELETE a `/api/v1/catalogo/{item_id}`, THE API_Gateway SHALL establecer el campo activo=false (borrado lógico) en el Catalogo_Item y devolver una respuesta 200 confirmando la desactivación.
5. IF un Usuario con rol "lector" intenta crear, actualizar o eliminar un Catalogo_Item, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden indicando permisos insuficientes.
6. IF un Usuario intenta acceder a un Catalogo_Item perteneciente a una Empresa diferente, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden y registrar el intento con nivel WARNING incluyendo el ID_Correlacion.
7. THE API_Gateway SHALL validar que el campo tasa_itbis sea uno de los valores permitidos: 0, 16 o 18 (representando porcentaje), rechazando cualquier otro valor con una respuesta 400 Bad Request.
8. THE API_Gateway SHALL validar que el campo precio_unitario sea un número positivo con un máximo de 2 decimales, rechazando valores negativos, cero o con más de 2 decimales con una respuesta 400 Bad Request.
9. WHEN un Usuario envía una solicitud GET a `/api/v1/catalogo` con el parámetro de consulta `search`, THE API_Gateway SHALL filtrar los resultados por coincidencia parcial (case-insensitive) en los campos descripcion o codigo del Catalogo_Item.

### Requisito 26: Creación de Facturas desde la Interfaz Web

**Historia de Usuario:** Como operador de una PYME, quiero crear facturas directamente desde la aplicación web seleccionando ítems de mi catálogo, para que pueda emitir comprobantes fiscales electrónicos sin necesidad de una integración de sistema externo.

#### Criterios de Aceptación

1. THE Interfaz_Facturacion SHALL presentar un formulario de creación de factura accesible a Usuarios con rol "admin" o "facturador" que incluya: campo RNC receptor, campo nombre receptor, un selector de ítems con búsqueda que cargue desde los Catalogo_Items de la Empresa, campo de cantidad por ítem, y cálculo automático de subtotales, montos de ITBIS y total general.
2. WHEN un Usuario agrega un Catalogo_Item al formulario de factura, THE Interfaz_Facturacion SHALL pre-cargar la descripcion, precio_unitario y tasa_itbis desde el catálogo, permitiendo al usuario modificar el precio_unitario si es necesario.
3. THE Interfaz_Facturacion SHALL calcular y mostrar en tiempo real: subtotal por línea (cantidad × precio_unitario), ITBIS por línea (subtotal × tasa_itbis / 100), total de ITBIS (suma de ITBIS de todas las líneas) y monto total (suma de subtotales + suma de ITBIS).
4. WHEN un Usuario hace clic en "Enviar Factura" en la interfaz web, THE Interfaz_Facturacion SHALL construir un payload JSON conforme al esquema existente de POST /api/v1/facturas y enviarlo a ese endpoint usando el Access_Token del usuario.
5. WHEN la factura es enviada exitosamente (HTTP 201 con Track_ID), THE Interfaz_Facturacion SHALL mostrar un mensaje de éxito con el Track_ID y el número de e-NCF, y proveer un enlace para descargar la representación PDF.
6. IF el envío de la factura devuelve un error de validación (HTTP 400), THEN THE Interfaz_Facturacion SHALL mostrar los errores de validación específicos por campo de forma inline en el formulario.
7. IF el envío de la factura devuelve un error 422 (rechazo de la DGII), THEN THE Interfaz_Facturacion SHALL mostrar los códigos de error y descripciones de la DGII al usuario.
8. THE Interfaz_Facturacion SHALL permitir al usuario agregar múltiples líneas de ítems del catálogo (mínimo 1, sin límite máximo) a una única factura.
9. THE Interfaz_Facturacion SHALL validar que al menos una línea de ítem esté presente y que el RNC receptor sea un número válido de 9 u 11 dígitos antes de permitir el envío del formulario.
10. IF un Usuario con rol "lector" accede a la interfaz de creación de facturas, THEN THE Interfaz_Facturacion SHALL mostrar el formulario en modo solo lectura sin el botón de envío.

### Requisito 27: Planes de Suscripción y Límites de Facturación

**Historia de Usuario:** Como operador de plataforma, quiero que cada empresa tenga un plan de suscripción asignado con un límite mensual de facturas, para que pueda controlar el uso de recursos y ofrecer niveles de servicio escalonados.

#### Criterios de Aceptación

1. THE API_Gateway SHALL mantener una tabla `planes` con campos: id (UUID), nombre (varchar, unique), limite_facturas_mensual (integer, NULL para ilimitado), precio (decimal 10,2, precio mensual en DOP), activo (boolean), created_at. El sistema SHALL incluir tres planes por defecto: "Básico" (50 facturas/mes, precio por configurar), "Profesional" (200 facturas/mes, precio por configurar), "Empresarial" (NULL = ilimitado, precio por configurar).
2. THE API_Gateway SHALL asociar cada Empresa con exactamente un Plan a través de una clave foránea plan_id en la tabla `empresas`. Las nuevas empresas creadas durante el onboarding SHALL ser asignadas al plan "Básico" por defecto.
3. WHEN una factura es enviada vía POST `/api/v1/facturas`, THE API_Gateway SHALL leer el campo `facturas_generadas` del registro Uso_Mensual correspondiente a la Empresa autenticada en el año y mes actual, y compararlo contra el limite_facturas_mensual del Plan asignado a la Empresa.
4. IF la Empresa ha alcanzado o excedido su límite mensual de facturas (facturas_generadas >= limite_facturas_mensual) AND el limite_facturas_mensual del Plan no es NULL, THEN THE API_Gateway SHALL rechazar el envío de la factura con una respuesta 402 Payment Required conteniendo un mensaje indicando que el límite mensual ha sido alcanzado, el nombre del plan actual y el conteo actual.
5. THE Contador_Facturas SHALL reiniciarse implícitamente cada mes porque un nuevo registro Uso_Mensual es creado para cada combinación (empresa_id, anio, mes) con facturas_generadas iniciando en 0.
6. WHEN un Super_Admin envía una solicitud PATCH a `/api/v1/admin/empresas/{empresa_id}/plan` con un plan_id válido, THE API_Gateway SHALL actualizar el plan_id de la Empresa y devolver una respuesta 200 confirmando el cambio. El nuevo límite toma efecto inmediatamente.
7. WHEN un Super_Admin envía una solicitud GET a `/api/v1/admin/planes`, THE API_Gateway SHALL devolver una lista de todos los planes con sus campos id, nombre, limite_facturas_mensual, precio y estado activo.
8. IF un usuario que no es Super_Admin intenta acceder a cualquier endpoint `/api/v1/admin/*`, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden.
9. THE API_Gateway SHALL exponer un endpoint GET `/api/v1/empresas/me/uso` accesible para cualquier usuario autenticado de la Empresa, que lea del registro Uso_Mensual del mes actual y devuelva: nombre del plan, límite mensual, facturas_generadas, facturas restantes (limite_aplicado - facturas_generadas, o "ilimitado" si el plan no tiene límite) y precio del plan actual.
10. WHEN el plan de una Empresa es cambiado de un límite mayor a un límite menor y el conteo del mes actual ya excede el nuevo límite, THE API_Gateway SHALL NO invalidar retroactivamente facturas ya enviadas pero SHALL bloquear nuevos envíos hasta que el próximo mes se reinicie.
11. THE API_Gateway SHALL mantener una tabla `uso_mensual` con campos: id (UUID), empresa_id (FK → empresas), anio (integer), mes (integer), facturas_generadas (integer, DEFAULT 0), limite_aplicado (integer, NULL para ilimitado, snapshot del límite del plan al momento de creación del registro), plan_nombre (varchar, snapshot del nombre del plan), created_at (timestamptz), updated_at (timestamptz), con una restricción UNIQUE sobre (empresa_id, anio, mes).
12. WHEN un Registro_Factura es persistido exitosamente, THE API_Gateway SHALL incrementar atómicamente el campo `facturas_generadas` en el registro Uso_Mensual de la Empresa para el año y mes actual usando `UPDATE uso_mensual SET facturas_generadas = facturas_generadas + 1, updated_at = NOW() WHERE empresa_id = :empresa_id AND anio = :anio AND mes = :mes`.
13. WHEN una factura es enviada y no existe un registro Uso_Mensual para la Empresa en el año y mes actual, THE API_Gateway SHALL crear un nuevo registro Uso_Mensual con facturas_generadas=0, limite_aplicado igual al limite_facturas_mensual del Plan actual de la Empresa, y plan_nombre igual al nombre del Plan actual, antes de realizar la verificación de límite.

### Requisito 28: Administración de Secuencias de Comprobantes Fiscales (e-NCF)

**Historia de Usuario:** Como administrador de una PYME, quiero gestionar mis secuencias autorizadas de e-NCF para que el sistema pueda asignar automáticamente el siguiente número de comprobante fiscal disponible al crear facturas, o pueda proveerlo manualmente si lo prefiero.

#### Criterios de Aceptación

1. THE API_Gateway SHALL mantener una tabla `secuencias_ncf` con campos: id (UUID), empresa_id (FK → empresas), tipo_comprobante (varchar, e.g. "E31", "E32", "E33", "E34"), prefijo (varchar, el prefijo completo incluyendo indicador de tipo), numero_inicio (bigint, inicio del rango autorizado), numero_fin (bigint, fin del rango autorizado), numero_actual (bigint, siguiente número a utilizar), activo (boolean), created_at (timestamptz), updated_at (timestamptz). Con una restricción UNIQUE sobre (empresa_id, tipo_comprobante, prefijo) para prevenir secuencias duplicadas.
2. WHEN un Usuario con rol "admin" envía una solicitud POST a `/api/v1/secuencias-ncf` con tipo_comprobante, prefijo, numero_inicio y numero_fin, THE API_Gateway SHALL crear una nueva Secuencia_NCF con numero_actual establecido a numero_inicio y activo=true, asociada a la Empresa del administrador, y devolver una respuesta 201.
3. WHEN un Usuario con rol "admin" envía una solicitud GET a `/api/v1/secuencias-ncf`, THE API_Gateway SHALL devolver todos los registros Secuencia_NCF de su Empresa, incluyendo: id, tipo_comprobante, prefijo, numero_inicio, numero_fin, numero_actual, números restantes (numero_fin - numero_actual + 1) y activo.
4. WHEN un Usuario con rol "admin" envía una solicitud PATCH a `/api/v1/secuencias-ncf/{id}` con activo=false, THE API_Gateway SHALL desactivar la secuencia y devolver una respuesta 200.
5. THE tabla Empresa SHALL incluir un campo `modo_ncf` (enum: 'automatico', 'manual') con valor por defecto 'automatico'.
6. WHEN un Usuario con rol "admin" envía una solicitud PATCH a `/api/v1/empresas/me/configuracion` con modo_ncf ('automatico' o 'manual'), THE API_Gateway SHALL actualizar el campo modo_ncf de la Empresa y devolver una respuesta 200.
7. WHEN una factura es enviada vía POST `/api/v1/facturas` AND el modo_ncf de la Empresa es "automatico", THE API_Gateway SHALL determinar el tipo_comprobante desde el payload de la factura (basado en el campo de tipo de documento), encontrar la Secuencia_NCF activa para ese tipo_comprobante en la Empresa, asignar atómicamente el siguiente e-NCF leyendo numero_actual, formateándolo como la cadena completa de e-NCF (prefijo + número con ceros a la izquierda), e incrementar numero_actual en 1, e incluir el e-NCF asignado en el Registro_Factura. IF el campo e_ncf es proporcionado en el payload cuando modo_ncf es "automatico", THE API_Gateway SHALL ignorarlo y usar el valor auto-asignado.
8. WHEN una factura es enviada vía POST `/api/v1/facturas` AND el modo_ncf de la Empresa es "manual", THE API_Gateway SHALL requerir el campo e_ncf en el payload. IF el campo e_ncf está ausente, THEN THE API_Gateway SHALL devolver una respuesta 400 Bad Request indicando que el e-NCF es requerido en modo manual. THE API_Gateway SHALL validar que el e-NCF proporcionado tenga un formato válido (prefijo + número secuencial). THE API_Gateway SHALL NO modificar los registros Secuencia_NCF (el modo manual omite la gestión de secuencias).
9. IF la Secuencia_NCF activa para el tipo_comprobante requerido se ha agotado (numero_actual > numero_fin), THEN THE API_Gateway SHALL rechazar la factura con una respuesta 409 Conflict indicando que la secuencia de e-NCF para ese tipo de documento está agotada y que un nuevo rango debe ser configurado.
10. IF no existe una Secuencia_NCF activa para el tipo_comprobante requerido en la Empresa, THEN THE API_Gateway SHALL rechazar la factura con una respuesta 409 Conflict indicando que no hay una secuencia activa configurada para ese tipo de documento.
11. THE API_Gateway SHALL usar un bloqueo a nivel de base de datos (SELECT FOR UPDATE o advisory lock) al asignar el siguiente número e-NCF para prevenir condiciones de carrera en envíos concurrentes de facturas.
12. IF un usuario con rol distinto a "admin" intenta crear, modificar o desactivar una Secuencia_NCF, THEN THE API_Gateway SHALL devolver una respuesta 403 Forbidden.
13. THE API_Gateway SHALL exponer un endpoint GET `/api/v1/secuencias-ncf/estado` accesible a usuarios con rol "admin" o "facturador" que devuelva un resumen de todas las secuencias activas con su capacidad restante (porcentaje utilizado y números restantes) para alertar cuando las secuencias se están agotando.
14. WHEN una Secuencia_NCF alcanza el 90% de uso (numero_actual >= numero_inicio + 0.9 * (numero_fin - numero_inicio)), THE API_Gateway SHALL registrar un WARNING indicando que la secuencia está casi agotada, incluyendo empresa_id, tipo_comprobante y números restantes.

### Requisito 29: Consulta de Estado de e-CF en la DGII

**Historia de Usuario:** Como operador de una PYME, quiero que el sistema consulte automáticamente el estado final de procesamiento de las facturas enviadas en la DGII, para que sepa si mis facturas fueron definitivamente aprobadas o rechazadas.

#### Criterios de Aceptación

1. THE Estado_DGII_Polling SHALL periodically query the DGII status service for all Registros_Factura with estado_dgii = "aceptado" (meaning received but not yet confirmed as definitively processed) using the Track_ID, with a polling interval configurable via environment variable (default: every 5 minutes).
2. WHEN the DGII status service returns a definitive status ("aprobado" or "rechazado_definitivo") for a Registro_Factura, THE API_Gateway SHALL update the estado_dgii field accordingly and store the DGII response details in the error_dgii field if rejected.
3. THE API_Gateway SHALL expose a GET endpoint `/api/v1/facturas/{factura_id}/estado` that returns the current estado_dgii, Track_ID, and the last DGII status check timestamp.
4. IF the DGII status service is unreachable during polling, THE Estado_DGII_Polling SHALL log the error with ID_Correlacion and retry in the next polling cycle without affecting other operations.
5. THE Estado_DGII_Polling SHALL stop polling a Registro_Factura once it reaches a terminal state ("aprobado", "rechazado_definitivo", "anulado").
6. WHEN a Registro_Factura transitions to a terminal state via polling, THE API_Gateway SHALL trigger the configured Webhook for the Empresa (if any) with the event details.

### Requisito 30: Anulación de Comprobantes Fiscales Electrónicos

**Historia de Usuario:** Como administrador de una PYME, quiero cancelar (anular) una factura electrónica que fue enviada por error, para que el registro fiscal sea corregido ante la DGII.

#### Criterios de Aceptación

1. WHEN a Usuario with role "admin" sends a POST to `/api/v1/facturas/{factura_id}/anular` with a motivo (reason for cancellation, max 500 chars), THE API_Gateway SHALL validate that the Registro_Factura exists, belongs to the user's Empresa, and has estado_dgii = "aprobado".
2. WHEN the cancellation request is valid, THE API_Gateway SHALL generate an XML cancellation document conforming to the DGII annulment schema, sign it with the Empresa's certificate using XAdES-BES, and transmit it to the DGII annulment endpoint.
3. WHEN the DGII confirms the annulment, THE API_Gateway SHALL update the Registro_Factura estado_dgii to "anulado", store the annulment confirmation in the record, and create a Log_Auditoria entry.
4. IF the DGII rejects the annulment request, THEN THE API_Gateway SHALL return a 422 Unprocessable Entity with the DGII rejection codes and NOT modify the Registro_Factura estado_dgii.
5. IF a Usuario with role "facturador" or "lector" attempts to annul an invoice, THEN THE API_Gateway SHALL return 403 Forbidden (only admin can annul).
6. IF the Registro_Factura estado_dgii is not "aprobado" (e.g., "enviado", "rechazado", "anulado"), THEN THE API_Gateway SHALL return 409 Conflict indicating that only approved invoices can be annulled.
7. THE API_Gateway SHALL NOT release the e-NCF number back to the sequence after annulment (annulled NCFs are consumed permanently per DGII regulations).

### Requisito 31: Log de Auditoría Fiscal

**Historia de Usuario:** Como operador de plataforma, quiero un log de auditoría inmutable de todas las acciones fiscalmente relevantes, para que pueda demostrar cumplimiento regulatorio y rastrear cambios no autorizados.

#### Criterios de Aceptación

1. THE API_Gateway SHALL maintain a table `auditoria` with fields: id (UUID), empresa_id (FK → empresas), usuario_id (FK → usuarios, nullable), api_key_id (FK → api_keys, nullable), accion (varchar: factura_enviada, factura_anulada, certificado_subido, certificado_reemplazado, configuracion_cambiada, usuario_creado, usuario_desactivado, plan_cambiado, secuencia_creada, api_key_creada, api_key_revocada), recurso_tipo (varchar), recurso_id (UUID), datos_anteriores (jsonb, nullable), datos_nuevos (jsonb, nullable), ip_origen (varchar), correlation_id (UUID), created_at (timestamptz).
2. WHEN any of the following actions occurs, THE API_Gateway SHALL create a Log_Auditoria entry: invoice submission, invoice annulment, certificate upload/replacement, modo_ncf change, plan change, user creation/deactivation, NCF sequence creation/deactivation, API key creation/rotation/revocation.
3. THE API_Gateway SHALL expose a GET endpoint `/api/v1/auditoria` accessible only to users with role "admin" that returns paginated audit log entries for their Empresa, supporting filters by accion, date range (created_at), and usuario_id.
4. THE API_Gateway SHALL NOT allow modification or deletion of audit log entries. The table SHALL NOT have UPDATE or DELETE operations exposed via any endpoint.
5. THE API_Gateway SHALL record the IP address of the requester (from X-Forwarded-For header or direct connection) in the ip_origen field of each Log_Auditoria entry.
6. WHEN a Super_Admin accesses GET `/api/v1/admin/auditoria`, THE API_Gateway SHALL return paginated audit entries across all Empresas, supporting filters by empresa_id, accion, and date range.

### Requisito 32: Webhooks para Notificaciones de Eventos

**Historia de Usuario:** Como desarrollador de una PYME integrando con el API, quiero configurar URLs de webhook para recibir notificaciones en tiempo real cuando cambian los estados de facturas, para que mi sistema pueda reaccionar sin necesidad de polling.

#### Criterios de Aceptación

1. WHEN a Usuario with role "admin" sends a POST to `/api/v1/webhooks` with url (valid HTTPS URL), eventos (array of event types: factura_aceptada, factura_rechazada, factura_anulada, secuencia_agotandose, plan_limite_alcanzado), and an optional secret (for HMAC signature verification), THE API_Gateway SHALL create a new Webhook configuration for the Empresa and return 201.
2. WHEN an event matching a configured Webhook's eventos array occurs for the Empresa, THE API_Gateway SHALL send an HTTP POST to the Webhook url within 30 seconds, with a JSON body containing: event_type, timestamp, empresa_id, and event-specific data (e.g., factura_id, track_id, estado_dgii).
3. IF a Webhook secret is configured, THE API_Gateway SHALL include an `X-Webhook-Signature` header containing the HMAC-SHA256 of the request body using the secret as key, allowing the receiver to verify authenticity.
4. IF the Webhook delivery fails (non-2xx response or timeout of 10 seconds), THE API_Gateway SHALL retry delivery 3 times with exponential backoff (10s, 30s, 90s). After all retries fail, THE API_Gateway SHALL mark the delivery as failed and log a WARNING.
5. WHEN a Usuario with role "admin" sends a GET to `/api/v1/webhooks`, THE API_Gateway SHALL return all configured Webhooks for their Empresa with id, url, eventos, activo, created_at, and last delivery status.
6. WHEN a Usuario with role "admin" sends a DELETE to `/api/v1/webhooks/{webhook_id}`, THE API_Gateway SHALL deactivate the Webhook and return 200.
7. IF a Webhook receives 10 consecutive failed deliveries, THE API_Gateway SHALL automatically deactivate the Webhook (activo=false) and log an ERROR indicating the Webhook has been disabled due to repeated failures.
8. THE API_Gateway SHALL expose a POST endpoint `/api/v1/webhooks/{webhook_id}/test` that sends a test event to the configured URL to verify connectivity.

### Requisito 33: Validación de RNC Receptor contra la DGII

**Historia de Usuario:** Como operador de una PYME, quiero que el sistema valide el RNC del receptor contra el registro de la DGII antes de procesar una factura, para que no desperdicie números de comprobantes fiscales en facturas que serán rechazadas por receptor inválido.

#### Criterios de Aceptación

1. WHEN an invoice is submitted via POST `/api/v1/facturas`, THE Validador_RNC SHALL query the DGII's RNC consultation service to verify that the RNC receptor exists and has an active status ("activo") before proceeding with invoice processing.
2. IF the RNC receptor does not exist in the DGII registry or has an inactive status, THEN THE API_Gateway SHALL return a 422 Unprocessable Entity with a descriptive message indicating the RNC receptor is invalid or inactive, including the DGII-reported status.
3. THE Validador_RNC SHALL cache validated RNCs in Redis with a TTL of 24 hours to avoid repeated queries to the DGII for the same recipient RNC within a short period.
4. IF the DGII RNC consultation service is unreachable (timeout of 5 seconds or error), THE API_Gateway SHALL proceed with invoice processing without RNC validation, log a WARNING indicating the validation was skipped, and include a flag in the Registro_Factura indicating "rnc_validado: false".
5. THE API_Gateway SHALL expose a GET endpoint `/api/v1/rnc/{rnc}/validar` that allows users to manually check a RNC's validity against the DGII registry, returning: rnc, nombre_contribuyente, estado (activo/inactivo/suspendido), and tipo_contribuyente.
6. THE Validador_RNC SHALL support a configurable flag at the Empresa level (validar_rnc_receptor: boolean, default true) that allows disabling RNC validation for empresas that prefer to skip this check.

### Requisito 34: Backup Automático de Datos On-Premise

**Historia de Usuario:** Como operador de plataforma ejecutando el sistema en mi servidor personal, quiero backups automáticos diarios de la base de datos y el almacenamiento de objetos, para que pueda recuperarme de pérdida de datos sin intervención manual.

#### Criterios de Aceptación

1. THE docker-compose.yml SHALL include a backup service container that executes daily automated backups of the PostgreSQL database using pg_dump at a configurable time (default: 02:00 UTC).
2. THE backup service SHALL export the PostgreSQL dump as a compressed file (.sql.gz) and store it in a dedicated backup volume or configurable backup directory on the host filesystem.
3. THE backup service SHALL retain the last 7 daily backups by default (configurable via environment variable BACKUP_RETENTION_DAYS), automatically deleting older backups.
4. THE backup service SHALL log the result of each backup operation (success with file size, or failure with error message) to stdout in JSON format compatible with the API Gateway's logging format.
5. IF the PostgreSQL backup fails, THE backup service SHALL retry once after 5 minutes. If the retry also fails, THE backup service SHALL log an ERROR with level FATAL.
6. THE API_Gateway SHALL expose a GET endpoint `/health/backup` accessible only to Super_Admin that returns the timestamp and status of the last successful backup, and a warning if no successful backup exists within the last 48 hours.
