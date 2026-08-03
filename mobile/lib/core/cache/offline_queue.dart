import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';

/// Cola de operaciones pendientes para modo offline.
/// Las facturas creadas sin conexión se almacenan aquí
/// y se sincronizan cuando vuelve la conexión.
class OfflineQueue {
  static const _boxName = 'encf_offline_queue';
  late Box _box;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    await Hive.initFlutter();
    _box = await Hive.openBox(_boxName);
    _initialized = true;
  }

  /// Encola una factura para enviar cuando haya conexión.
  Future<void> enqueueFactura(Map<String, dynamic> facturaData) async {
    await init();
    final id = DateTime.now().millisecondsSinceEpoch.toString();
    await _box.put(id, jsonEncode({
      'type': 'crear_factura',
      'data': facturaData,
      'queued_at': DateTime.now().toIso8601String(),
      'attempts': 0,
    }));
  }

  /// Retorna todas las operaciones pendientes.
  Future<List<Map<String, dynamic>>> getPending() async {
    await init();
    final items = <Map<String, dynamic>>[];
    for (final key in _box.keys) {
      final json = _box.get(key);
      if (json != null) {
        final data = jsonDecode(json as String) as Map<String, dynamic>;
        data['queue_id'] = key;
        items.add(data);
      }
    }
    return items;
  }

  /// Cantidad de operaciones pendientes.
  Future<int> get count async {
    await init();
    return _box.length;
  }

  /// Elimina una operación de la cola (fue procesada).
  Future<void> remove(String queueId) async {
    await init();
    await _box.delete(queueId);
  }

  /// Limpia toda la cola.
  Future<void> clear() async {
    await init();
    await _box.clear();
  }
}
