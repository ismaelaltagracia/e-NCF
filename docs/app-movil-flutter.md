# App Móvil Flutter — e-NCF

> Especificación para desarrollar la app móvil con Flutter que consume la API REST existente.

---

## Resumen

App móvil iOS + Android que replica las funcionalidades del portal web, conectándose al mismo backend NestJS via `GET/POST /api/v1/*`. No tiene lógica de negocio propia — todo pasa por la API.

---

## Stack Técnico

| Componente | Tecnología |
|------------|-----------|
| Framework | Flutter 3.x (Dart) |
| State Management | Riverpod 2.x |
| HTTP Client | Dio |
| Almacenamiento local | SharedPreferences (tokens) + Hive (cache offline) |
| Navegación | GoRouter |
| Notificaciones | Firebase Cloud Messaging (FCM) |
| PDF Viewer | flutter_pdfview o syncfusion_flutter_pdfviewer |
| QR Scanner | mobile_scanner |
| File Picker | file_picker |
| Theming | Material 3 con colores personalizados |

---

## Diseño Visual

### Paleta de colores (consistente con el web)

```dart
// Colores principales
static const primary = Color(0xFF0F1B2D);       // Azul oscuro principal
static const primaryLight = Color(0xFF1A3A5C);   // Azul medio
static const accent = Color(0xFF64B5F6);         // Azul claro (highlight)
static const background = Color(0xFFF5F7FA);     // Fondo gris claro
static const surface = Color(0xFFFFFFFF);        // Cards blancas
static const textPrimary = Color(0xFF1F2937);    // Texto principal
static const textSecondary = Color(0xFF6B7280);  // Texto secundario
static const success = Color(0xFF059669);        // Verde éxito
static const warning = Color(0xFFD97706);        // Amarillo advertencia
static const danger = Color(0xFFDC2626);         // Rojo error
```

### Tipografía
- Font: Inter (o system default)
- Headlines: Weight 700-800
- Body: Weight 400-500
- Labels: Weight 600, size 12-13

### Componentes de diseño
- Cards con border-radius 14px, sombra sutil
- Botones con border-radius 10px, gradiente primary → primaryLight
- Inputs con border-radius 10px, borde #D1D9E6
- Bottom Navigation Bar con 5 tabs máximo
- AppBar transparente con título a la izquierda

---

## Arquitectura del Proyecto

```
lib/
├── main.dart
├── app.dart
├── core/
│   ├── constants/
│   │   ├── api_endpoints.dart
│   │   └── app_colors.dart
│   ├── network/
│   │   ├── api_client.dart          # Dio instance con interceptors
│   │   ├── auth_interceptor.dart    # Agrega Bearer token automáticamente
│   │   └── error_handler.dart       # Manejo de errores HTTP
│   ├── storage/
│   │   ├── secure_storage.dart      # Tokens (access + refresh)
│   │   └── local_cache.dart         # Cache de datos (Hive)
│   └── router/
│       └── app_router.dart          # GoRouter con guards de auth
├── features/
│   ├── auth/
│   │   ├── data/
│   │   │   └── auth_repository.dart
│   │   ├── domain/
│   │   │   └── auth_state.dart
│   │   ├── presentation/
│   │   │   ├── login_screen.dart
│   │   │   └── widgets/
│   │   └── providers/
│   │       └── auth_provider.dart
│   ├── onboarding/
│   │   └── presentation/
│   │       └── register_screen.dart
│   ├── dashboard/
│   │   ├── data/
│   │   │   └── dashboard_repository.dart
│   │   ├── presentation/
│   │   │   └── dashboard_screen.dart
│   │   └── providers/
│   │       └── dashboard_provider.dart
│   ├── facturas/
│   │   ├── data/
│   │   │   └── facturas_repository.dart
│   │   ├── presentation/
│   │   │   ├── facturas_list_screen.dart
│   │   │   ├── nueva_factura_screen.dart
│   │   │   ├── factura_detalle_screen.dart
│   │   │   └── batch_upload_screen.dart
│   │   └── providers/
│   │       └── facturas_provider.dart
│   ├── facturas_recibidas/
│   │   ├── data/
│   │   │   └── recibidas_repository.dart
│   │   ├── presentation/
│   │   │   └── recibidas_screen.dart
│   │   └── providers/
│   │       └── recibidas_provider.dart
│   ├── catalogo/
│   │   ├── data/
│   │   │   └── catalogo_repository.dart
│   │   ├── presentation/
│   │   │   └── catalogo_screen.dart
│   │   └── providers/
│   │       └── catalogo_provider.dart
│   ├── reportes/
│   │   ├── data/
│   │   │   └── reportes_repository.dart
│   │   ├── presentation/
│   │   │   └── reportes_screen.dart
│   │   └── providers/
│   │       └── reportes_provider.dart
│   ├── configuracion/
│   │   └── presentation/
│   │       └── configuracion_screen.dart
│   └── common/
│       └── widgets/
│           ├── app_button.dart
│           ├── app_card.dart
│           ├── app_input.dart
│           ├── loading_indicator.dart
│           ├── error_banner.dart
│           └── dgii_status_badge.dart
└── l10n/
    └── app_es.arb                   # Strings en español
```

---

## Pantallas y Funcionalidades

### 1. Login (`/login`)
- Pantalla full-screen con gradiente azul oscuro arriba, formulario abajo
- Campos: email, contraseña
- Botón "Iniciar Sesión" con gradiente
- Link a registro
- Biometría (FaceID/Fingerprint) para sesiones subsiguientes
- Manejo de errores inline

### 2. Registro (`/registro`)
- 3 pasos con stepper visual (igual que web)
- Paso 1: Datos empresa (nombre, RNC, admin, email, password)
- Paso 2: Cargar certificado .p12 (file picker + password)
- Paso 3: Confirmación con animación de éxito

### 3. Dashboard (`/dashboard`)
- Saludo con nombre de empresa
- 4 metric cards: facturas del mes, plan, certificado, ambiente DGII
- Acciones rápidas (botones): Nueva Factura, Catálogo, Recibidas, Configuración
- Pull-to-refresh

### 4. Lista de Facturas (`/facturas`)
- Lista con pull-to-refresh y paginación infinita (scroll)
- Cada item muestra: fecha, No. comprobante, receptor, monto, badge estado
- Filtros en bottom sheet: estado, tipo, fecha desde/hasta, RNC
- Tap en factura → detalle
- FAB "+" para nueva factura

### 5. Nueva Factura (`/facturas/nueva`)
- Selector de tipo de comprobante (chips)
- Buscador de cliente (autocompletado del catálogo)
- Lista de ítems (agregar desde catálogo o manual)
- Cada ítem: descripción, cantidad, precio, ITBIS
- Resumen: subtotal, ITBIS, total
- Botón "Emitir Factura" con confirmación

### 6. Detalle Factura (`/facturas/:id`)
- Info completa: NCF, Track ID, estado, fecha, receptor
- Lista de ítems con precios
- Acciones: Descargar PDF, Enviar por email, Compartir, Anular
- Badge de estado DGII con color

### 7. Carga Masiva (`/facturas/batch`)
- Botón "Descargar plantilla" (descarga .xlsx)
- File picker para subir Excel/CSV
- Pantalla de validación con resumen (válidas/errores)
- Lista de errores expandible
- Botón "Emitir" con barra de progreso
- Resultados con tabla exitosas/fallidas

### 8. Facturas Recibidas (`/recibidas`)
- Lista con badge de estado (pendiente/aprobada/rechazada)
- Botón para registrar manualmente
- Swipe actions: aprobar (verde), rechazar (rojo)
- Modal de registro con campos RNC, nombre, NCF, fecha, monto

### 9. Catálogo (`/catalogo`)
- Tabs: Clientes | Productos
- Lista searchable
- FAB para agregar nuevo
- Tap para editar
- Swipe para eliminar

### 10. Reportes Fiscales (`/reportes`)
- Selector de año y mes (picker)
- 3 cards (606, 607, 608) con cantidad de registros
- Botón "Descargar" en cada card → guarda en Downloads y ofrece compartir
- Botón "Consultar período"

### 11. Configuración (`/configuracion`)
- Secciones: Empresa, Certificado, Secuencias, Usuarios
- Carga de certificado con file picker
- Estado del certificado con vencimiento
- Toggle validación RNC

### 12. Mi Plan (`/mi-plan`)
- Plan actual con barra de uso
- Botón de upgrade
- Historial de uso mensual

---

## Navegación

```
BottomNavigationBar:
├── 🏠 Inicio (Dashboard)
├── 🧾 Facturas (Lista + Nueva + Detalle)
├── 📥 Recibidas
├── 📊 Reportes
└── ⚙️ Más (Catálogo, Config, Mi Plan, Cerrar Sesión)
```

---

## API Client (Dio)

```dart
// core/network/api_client.dart
class ApiClient {
  late final Dio _dio;
  
  ApiClient(String baseUrl) {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: Duration(seconds: 15),
      receiveTimeout: Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));
    
    _dio.interceptors.addAll([
      AuthInterceptor(),    // Agrega Bearer token
      LogInterceptor(),     // Debug logging
      ErrorInterceptor(),   // Manejo global de errores
    ]);
  }
}
```

### Auth Interceptor
```dart
class AuthInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = SecureStorage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      // Clear session y redirigir a login
      SecureStorage.clear();
      AppRouter.go('/login');
    }
    handler.next(err);
  }
}
```

---

## Endpoints a consumir

| Pantalla | Endpoint(s) |
|----------|-------------|
| Login | `POST /api/v1/auth/login` |
| Registro | `POST /api/v1/onboarding/registro`, `POST /api/v1/empresas/me/certificado` |
| Dashboard | `GET /api/v1/empresas/me/uso`, `GET /api/v1/empresas/me/certificado-estado`, `GET /api/v1/empresas/me/permisos` |
| Facturas lista | `GET /api/v1/facturas?page=&limit=&estado_dgii=` |
| Nueva factura | `POST /api/v1/facturas` |
| Detalle factura | `GET /api/v1/facturas/:id` |
| PDF factura | `GET /api/v1/facturas/:id/pdf` |
| Email factura | `POST /api/v1/facturas/:id/enviar-email` |
| Anular | `POST /api/v1/facturas/:id/anular` |
| Batch validar | `POST /api/v1/facturas/batch/validar` (multipart) |
| Batch emitir | `POST /api/v1/facturas/batch/emitir` (multipart) |
| Batch plantilla | `GET /api/v1/facturas/batch/plantilla` |
| Recibidas | `GET /api/v1/facturas-recibidas` |
| Registrar recibida | `POST /api/v1/facturas-recibidas` |
| Aprobar | `POST /api/v1/facturas-recibidas/:id/aprobar` |
| Rechazar | `POST /api/v1/facturas-recibidas/:id/rechazar` |
| Catálogo | `GET/POST/PATCH/DELETE /api/v1/catalogo` |
| Reportes resumen | `GET /api/v1/reportes/resumen?anio=&mes=` |
| Descargar 606 | `GET /api/v1/reportes/606?anio=&mes=` |
| Descargar 607 | `GET /api/v1/reportes/607?anio=&mes=` |
| Descargar 608 | `GET /api/v1/reportes/608?anio=&mes=` |
| Estado DGII | `GET /api/v1/dgii/estado-conexion` |
| Secuencias | `GET/POST/PATCH /api/v1/secuencias-ncf` |
| Usuarios | `GET/POST/PATCH /api/v1/usuarios` |
| Configuración empresa | `GET/PATCH /api/v1/empresas/me` |
| Certificado | `POST /api/v1/empresas/me/certificado` |
| Planes | `GET /api/v1/planes` |

---

## Features Móvil-Específicas

### Push Notifications (FCM)
- Factura aprobada/rechazada por DGII
- Certificado próximo a vencer (30, 15, 7 días)
- 80% del límite de facturas alcanzado
- Se necesita backend endpoint: `POST /api/v1/dispositivos/registrar` (guardar FCM token)

### Biometría
- Guardar sesión con biometría (local_auth package)
- Al reabrir la app, pide huella/face en vez de password
- El access_token se almacena en secure storage (FlutterSecureStorage)

### Modo Offline (parcial)
- Cache de catálogo (clientes/productos) en Hive
- Ver lista de facturas offline (últimas 50)
- Crear factura offline → se encola y transmite cuando haya conexión
- Indicador de "pendiente de sincronización"

### Compartir
- Compartir PDF de factura vía WhatsApp, email, etc. (share_plus)
- Compartir archivo de reportes (606/607/608)

### Scanner QR
- Escanear código de NCF físico con cámara para registro de compras
- Parsear datos del QR y pre-llenar formulario de factura recibida

---

## Configuración del Proyecto

### pubspec.yaml (dependencias principales)
```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.0
  dio: ^5.4.0
  go_router: ^14.0.0
  flutter_secure_storage: ^9.0.0
  hive_flutter: ^1.1.0
  firebase_core: ^3.0.0
  firebase_messaging: ^15.0.0
  local_auth: ^2.2.0
  file_picker: ^8.0.0
  share_plus: ^9.0.0
  mobile_scanner: ^5.0.0
  flutter_pdfview: ^1.3.0
  intl: ^0.19.0
  shimmer: ^3.0.0
  cached_network_image: ^3.3.0
  flutter_svg: ^2.0.0
  
dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0
  build_runner: ^2.4.0
  riverpod_generator: ^2.4.0
```

### Ambientes
```dart
// lib/core/constants/api_endpoints.dart
enum Environment { development, staging, production }

class ApiConfig {
  static const Map<Environment, String> baseUrls = {
    Environment.development: 'http://localhost:3000',
    Environment.staging: 'https://staging.tudominio.com',
    Environment.production: 'https://api.tudominio.com',
  };
}
```

---

## Fases de Desarrollo

### Fase 1 — MVP (3-4 semanas)
- [ ] Setup proyecto Flutter + arquitectura
- [ ] Login + logout + manejo de sesión
- [ ] Dashboard con métricas
- [ ] Lista de facturas con paginación
- [ ] Crear factura (formulario completo)
- [ ] Detalle + descargar PDF + enviar email
- [ ] Bottom navigation

### Fase 2 — Funcionalidad completa (2-3 semanas)
- [ ] Registro/onboarding (3 pasos)
- [ ] Catálogo (CRUD clientes y productos)
- [ ] Facturas recibidas (listar, registrar, aprobar/rechazar)
- [ ] Reportes 606/607/608 (consultar + descargar)
- [ ] Carga masiva (upload, validar, emitir)
- [ ] Configuración empresa + certificado

### Fase 3 — Features móvil (2 semanas)
- [ ] Push notifications (FCM)
- [ ] Biometría (login con huella/face)
- [ ] Compartir PDF vía WhatsApp/email
- [ ] Scanner QR para compras
- [ ] Indicador DGII contingencia
- [ ] Cache offline básico

### Fase 4 — Polish (1 semana)
- [ ] Animaciones y transiciones
- [ ] Skeleton loading (shimmer)
- [ ] Error handling UX (retry, empty states)
- [ ] Pruebas en dispositivos reales
- [ ] App Store / Play Store submission

---

## Requerimientos de Backend Adicionales

Para soportar la app móvil completamente, agregar al backend:

| Endpoint | Para qué |
|----------|----------|
| `POST /api/v1/dispositivos/registrar` | Guardar FCM token para push notifications |
| `DELETE /api/v1/dispositivos/:token` | Desregistrar dispositivo al cerrar sesión |
| `POST /api/v1/auth/refresh` | Refresh token (si no existe ya) |

---

## Testing

- Unit tests: Repositories + Providers (mockear Dio)
- Widget tests: Pantallas principales con data mockeada
- Integration tests: Flujo login → crear factura → ver en lista
- Dispositivos target: iPhone 13+, Samsung Galaxy S21+, Pixel 6+

---

## Publicación

### iOS (App Store)
- Apple Developer Account ($99/año)
- Bundle ID: `com.encf.app`
- Categoría: Business / Finance
- Screenshots: 6.7" (iPhone 15 Pro Max) + 12.9" (iPad Pro)

### Android (Play Store)
- Google Play Console ($25 una vez)
- Package: `com.encf.app`
- Target SDK: 34 (Android 14)
- Screenshots: Phone + Tablet (7")

---

## Estimación Total

| Fase | Duración | Resultado |
|------|----------|-----------|
| Fase 1 (MVP) | 3-4 semanas | App funcional: login, facturas, dashboard |
| Fase 2 (Completa) | 2-3 semanas | Todas las funciones del web |
| Fase 3 (Móvil) | 2 semanas | Push, biometría, QR, offline |
| Fase 4 (Polish) | 1 semana | Publicación en stores |
| **Total** | **8-10 semanas** | App completa en iOS + Android |
