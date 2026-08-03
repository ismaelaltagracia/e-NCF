import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

/// Servicio de cache offline usando Hive.
/// Almacena: catálogo, últimas facturas, datos de dashboard.
/// Detecta conectividad y usa cache cuando no hay internet.
class OfflineCache {
  static const _boxName = 'encf_cache';
  late Box _box;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    await Hive.initFlutter();
    _box = await Hive.openBox(_boxName);
    _initialized = true;
  }

  /// Guarda datos en cache con una key.
  Future<void> put(String key, dynamic data) async {
    await init();
    final json = jsonEncode(data);
    await _box.put(key, json);
    await _box.put('${key}_ts', DateTime.now().millisecondsSinceEpoch);
  }

  /// Obtiene datos del cache. Retorna null si no existe.
  Future<dynamic> get(String key) async {
    await init();
    final json = _box.get(key);
    if (json == null) return null;
    return jsonDecode(json as String);
  }

  /// Obtiene timestamp de la última actualización.
  Future<DateTime?> getLastUpdated(String key) async {
    await init();
    final ts = _box.get('${key}_ts');
    if (ts == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(ts as int);
  }

  /// Verifica si hay datos frescos (menos de maxAge).
  Future<bool> isFresh(String key, Duration maxAge) async {
    final lastUpdated = await getLastUpdated(key);
    if (lastUpdated == null) return false;
    return DateTime.now().difference(lastUpdated) < maxAge;
  }

  /// Limpia todo el cache.
  Future<void> clear() async {
    await init();
    await _box.clear();
  }

  /// Verifica si hay conexión a internet.
  static Future<bool> hasConnectivity() async {
    final result = await Connectivity().checkConnectivity();
    return !result.contains(ConnectivityResult.none);
  }
}

/// Keys para el cache
class CacheKeys {
  static const catalogo = 'catalogo';
  static const dashboard = 'dashboard';
  static const facturas = 'facturas_recientes';
  static const secuencias = 'secuencias';
  static const empresaInfo = 'empresa_info';
}
