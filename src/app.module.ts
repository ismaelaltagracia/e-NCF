import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { SpaFallbackMiddleware } from './common/middleware/spa-fallback.middleware.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { EmpresasModule } from './modules/empresas/empresas.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ApiKeysModule } from './modules/api-keys/api-keys.module.js';
import { CatalogoModule } from './modules/catalogo/catalogo.module.js';
import { SecuenciasNcfModule } from './modules/secuencias-ncf/secuencias-ncf.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { RetryQueueModule } from './infrastructure/queue/retry-queue.module.js';
import { PlanesModule } from './modules/planes/planes.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { DgiiModule } from './dgii/dgii.module.js';
import { FacturasModule } from './modules/facturas/facturas.module.js';
import { FacturasRecibidasModule } from './modules/facturas-recibidas/facturas-recibidas.module.js';
import { CertificacionModule } from './modules/certificacion/certificacion.module.js';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { ReportesModule } from './modules/reportes/reportes.module.js';
import { DispositivosModule } from './modules/dispositivos/dispositivos.module.js';
import { ContadorModule } from './modules/contador/contador.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    RedisModule,
    RetryQueueModule,
    AuthModule,
    OnboardingModule,
    EmpresasModule,
    UsersModule,
    ApiKeysModule,
    CatalogoModule,
    SecuenciasNcfModule,
    PlanesModule,
    AdminModule,
    DgiiModule,
    FacturasModule,
    FacturasRecibidasModule,
    CertificacionModule,
    AuditoriaModule,
    WebhooksModule,
    ReportesModule,
    DispositivosModule,
    ContadorModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Filtro de excepciones global: da forma uniforme a los errores y oculta
    // stack traces al cliente.
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // Interceptores globales. CorrelationId primero para que el logging incluya el id.
    { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SpaFallbackMiddleware).forRoutes('app', 'app/*path');
  }
}
