import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Swagger / OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('e-NCF API Gateway')
    .setDescription(
      'API Gateway REST para facturación electrónica (e-CF) de la DGII de República Dominicana. ' +
      'Gestiona el ciclo de vida completo de comprobantes fiscales electrónicos: ' +
      'autenticación, firma digital XAdES-BES, transmisión XML, generación de PDF con QR, ' +
      'y persistencia transaccional con multi-tenencia.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access Token JWT RS256' },
      'JWT',
    )
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'API Key de 256 bits (base64)' },
      'API-Key',
    )
    .addTag('Auth', 'Autenticación OAuth 2.0 (login, refresh, logout)')
    .addTag('Onboarding', 'Registro de empresa y usuario administrador')
    .addTag('Empresa', 'Configuración de empresa (certificado, modo NCF, uso)')
    .addTag('Usuarios', 'CRUD de usuarios por empresa')
    .addTag('API Keys', 'Gestión de API keys por empresa')
    .addTag('Catálogo', 'Productos y servicios del catálogo')
    .addTag('Secuencias NCF', 'Gestión de secuencias de numeración fiscal')
    .addTag('Facturas', 'Emisión y consulta de facturas electrónicas')
    .addTag('Webhooks', 'Configuración de webhooks para eventos')
    .addTag('Auditoría', 'Registro de auditoría de acciones')
    .addTag('Health', 'Estado del sistema y dependencias')
    .addTag('Admin', 'Administración de plataforma (Super Admin)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
