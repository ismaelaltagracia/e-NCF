class ApiConfig {
  static const String baseUrl = 'http://127.0.0.1:3000';

  // Auth
  static const String login = '/api/v1/auth/login';
  static const String logout = '/api/v1/auth/logout';

  // Dashboard
  static const String empresaUso = '/api/v1/empresas/me/uso';
  static const String empresaCertificado = '/api/v1/empresas/me/certificado-estado';
  static const String empresaPermisos = '/api/v1/empresas/me/permisos';

  // Facturas
  static const String facturas = '/api/v1/facturas';
  static String facturaPdf(String id) => '/api/v1/facturas/$id/pdf';
  static String facturaEmail(String id) => '/api/v1/facturas/$id/enviar-email';
  static String facturaAnular(String id) => '/api/v1/facturas/$id/anular';
  static const String facturaBatchValidar = '/api/v1/facturas/batch/validar';
  static const String facturaBatchEmitir = '/api/v1/facturas/batch/emitir';
  static const String facturaBatchPlantilla = '/api/v1/facturas/batch/plantilla';

  // Facturas recibidas
  static const String facturasRecibidas = '/api/v1/facturas-recibidas';
  static String aprobarRecibida(String id) => '/api/v1/facturas-recibidas/$id/aprobar';
  static String rechazarRecibida(String id) => '/api/v1/facturas-recibidas/$id/rechazar';

  // Catálogo
  static const String catalogo = '/api/v1/catalogo';

  // Reportes
  static const String reportesResumen = '/api/v1/reportes/resumen';
  static String reporte(String formato) => '/api/v1/reportes/$formato';

  // DGII Status
  static const String dgiiEstado = '/api/v1/dgii/estado-conexion';

  // Configuración
  static const String empresaMe = '/api/v1/empresas/me';
  static const String secuencias = '/api/v1/secuencias-ncf';
  static const String usuarios = '/api/v1/usuarios';
  static const String planes = '/api/v1/planes';
}
