# CONTEXTO DE PROYECTO: API Gateway REST para Facturación Electrónica (DGII - República Dominicana)

## 1. Descripción del Proyecto
El objetivo es construir un API Gateway en modo REST que actúe como middleware entre los sistemas de facturación de las PYMES (clientes) y los servidores oficiales de la Dirección General de Impuestos Internos (DGII) de la República Dominicana.
El API Gateway debe recibir solicitudes de facturación en formato JSON, convertirlas a esquemas XML válidos según el estándar e-CF de la DGII, firmar digitalmente el documento bajo el estándar criptográfico XAdES-BES utilizando el certificado digital PKCS#12 (.p12/.pfx) del cliente, y transmitirlo de forma segura mediante protocolo SOAP a la DGII.

## 2. Stack Tecnológico & Arquitectura AWS
- **Lenguaje/Entorno:** Node.js con TypeScript (Framework NestJS o Express).
- **Base de Datos:** Amazon RDS para PostgreSQL (utilizando tipos JSONB para payloads e-CF).
- **Caché y Mensajería:** Amazon ElastiCache para Redis (para almacenamiento del token Semilla y cola de reintentos asíncronos).
- **Almacenamiento de Archivos:** Amazon S3 (para guardar los archivos XML firmados y los PDF autogenerados).
- **Seguridad de Llaves:** AWS Secrets Manager (para la clave simétrica de encriptación AES-256) y encriptación a nivel de columna con pgcrypto en PostgreSQL para almacenar los certificados .p12 de forma segura.

## 3. Dependencias Clave de Node.js a utilizar
Por favor, utiliza las siguientes librerías de NPM para el desarrollo:
- `xadesjs`: Para manejar la firma criptográfica XML en formato XAdES-BES.
- `xml2js` / `fast-xml-parser`: Para la conversión bidireccional entre JSON y XML.
- `node-forge` / `pkcs12`: Para parsear y extraer claves privadas del archivo de certificado .p12.
- `axios` o `strong-soap`: Para consumir los Web Services SOAP de la DGII.
- `pg` / `typeorm`: Para interactuar con PostgreSQL.
- `@aws-sdk/client-s3`: Para subir los XML y representaciones impresas a AWS S3.
- `pdfkit` o `puppeteer-core`: Para generar el PDF de la representación impresa con el código QR requerido por ley.

## 4. Funcionalidades y Flujos Críticos a Programar

### A. Módulo de Autenticación con la DGII (Handshake de Seguridad)
Para poder enviar cualquier factura, se debe obtener un Token de Acceso Temporal (Bearer Token) mediante estos pasos secuenciales:
1. Llamar al servicio SOAP de la DGII para solicitar una "Semilla" (XML temporal).
2. Firmar digitalmente esa semilla con el certificado del cliente (.p12) bajo firma XML tradicional.
3. Enviar la semilla firmada de vuelta al Web Service de la DGII.
4. Recibir y almacenar el Token de Acceso resultante en Redis con su tiempo de expiración (TTL de 1 hora).

### B. Módulo de Firma y Transmisión (e-CF)
Endpoint principal: `POST /api/v1/facturas`
1. Recibe un JSON que contiene los datos comerciales de la factura dominicana (RNC emisor, RNC receptor, montos, ITBIS detallado, etc.).
2. Valida la estructura del JSON.
3. Convierte el JSON a un XML estructurado que cumpla exactamente con el esquema XSD de la DGII para e-CF.
4. Recupera el certificado .p12 del cliente desde PostgreSQL, lo desencripta y firma el XML con formato **XAdES-BES** (usando `xadesjs`).
5. Consume el API REST o SOAP transaccional de la DGII enviando el XML firmado.
6. Retorna el `trackId` (código de recepción de la DGII) y almacena el registro transaccional en PostgreSQL.

### C. Módulo de Representación Impresa (PDF)
1. Con los datos de la factura aprobada, genera un código QR que contenga la URL oficial de consulta de la DGII, el RNC emisor, el RNC receptor, el número de e-NCF y el monto total.
2. Genera un archivo PDF estructurado (formato ticket o factura completa) que incluya el código QR generado.
3. Sube el PDF a un bucket privado de Amazon S3 y expón una URL firmada temporalmente para que el cliente la descargue.

### D. Base de Datos - Esquema de Tablas a Generar (PostgreSQL)
Necesito las migraciones o modelos para:
- `clientes`: `id` (UUID), `rnc` (varchar), `nombre` (varchar), `certificado_encriptado` (text), `salt_encriptacion` (varchar), `estado` (enum: 'activo', 'certificacion', 'inactivo').
- `facturas_electronicas`: `id` (UUID), `cliente_id` (UUID), `e_ncf` (varchar), `track_id` (varchar), `estado_dgii` (varchar), `payload_json` (jsonb), `xml_s3_url` (varchar), `pdf_s3_url` (varchar), `created_at` (timestamp).

---

## 5. Instrucciones para la Generación de Código
1. Comienza estructurando la arquitectura de carpetas del proyecto siguiendo las mejores prácticas (arquitectura limpia o basada en módulos).
2. Genera primero el archivo `package.json` con las dependencias mencionadas y la configuración de TypeScript.
3. Desarrolla el módulo de criptografía e integración de firma digital (`xades-signature.service.ts`) que es el núcleo técnico del sistema.