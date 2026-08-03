import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../scanner/presentation/qr_scanner_screen.dart';

class RecibidasScreen extends StatefulWidget {
  final ApiClient apiClient;
  const RecibidasScreen({super.key, required this.apiClient});

  @override
  State<RecibidasScreen> createState() => _RecibidasScreenState();
}

class _RecibidasScreenState extends State<RecibidasScreen> {
  List<dynamic> _facturas = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await widget.apiClient.dio.get(ApiConfig.facturasRecibidas);
      setState(() => _facturas = res.data is List ? res.data : []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _aprobar(String id) async {
    await widget.apiClient.dio.post(ApiConfig.aprobarRecibida(id));
    _load();
  }

  Future<void> _rechazar(String id) async {
    final motivo = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final controller = TextEditingController();
        return AlertDialog(
          title: const Text('Motivo del rechazo'),
          content: TextField(controller: controller, maxLines: 3,
            decoration: const InputDecoration(hintText: 'Escriba el motivo...')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, controller.text),
              child: const Text('Rechazar'),
            ),
          ],
        );
      },
    );
    if (motivo != null && motivo.isNotEmpty) {
      await widget.apiClient.dio.post(ApiConfig.rechazarRecibida(id), data: {'motivo': motivo});
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return Scaffold(
      body: _facturas.isEmpty
          ? const Center(child: Text('No hay facturas recibidas',
              style: TextStyle(color: AppColors.textSecondary)))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                itemCount: _facturas.length,
                itemBuilder: (ctx, i) {
                  final f = _facturas[i];
                  final estado = f['estado_aprobacion'] ?? 'pendiente';
                  return Card(
                    margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: ListTile(
                      title: Text(f['nombre_emisor'] ?? '', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      subtitle: Text('${f['e_ncf']} — RD\$ ${f['monto_total']}', style: const TextStyle(fontSize: 12)),
                      trailing: estado == 'pendiente'
                          ? Row(mainAxisSize: MainAxisSize.min, children: [
                              IconButton(
                                icon: const Icon(Icons.check_circle, color: AppColors.success),
                                onPressed: () => _aprobar(f['id']),
                                tooltip: 'Aprobar',
                              ),
                              IconButton(
                                icon: const Icon(Icons.cancel, color: AppColors.danger),
                                onPressed: () => _rechazar(f['id']),
                                tooltip: 'Rechazar',
                              ),
                            ])
                          : Text(estado, style: TextStyle(
                              fontSize: 11,
                              color: estado == 'aprobada' ? AppColors.success : AppColors.danger,
                              fontWeight: FontWeight.w600,
                            )),
                    ),
                  );
                },
              ),
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _scanQr,
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.qr_code_scanner, color: Colors.white),
        tooltip: 'Escanear comprobante',
      ),
    );
  }

  Future<void> _scanQr() async {
    final result = await Navigator.push<Map<String, String>>(
      context,
      MaterialPageRoute(builder: (_) => const QrScannerScreen()),
    );

    if (result != null && mounted) {
      // Pre-fill and register the received invoice
      try {
        await widget.apiClient.dio.post(ApiConfig.facturasRecibidas, data: {
          'rnc_emisor': result['rnc_emisor'],
          'nombre_emisor': '',
          'e_ncf': result['e_ncf'],
          'fecha_emision': DateTime.now().toIso8601String().substring(0, 10),
          'monto_total': double.tryParse(result['monto_total'] ?? '0') ?? 0,
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Factura registrada desde QR'), backgroundColor: AppColors.success),
        );
        _load();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al registrar. Complete datos manualmente.'), backgroundColor: AppColors.warning),
        );
      }
    }
  }
}
