import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart' show Share;
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';

class FacturaDetalleScreen extends StatelessWidget {
  final ApiClient apiClient;
  final Map<String, dynamic> factura;

  const FacturaDetalleScreen({super.key, required this.apiClient, required this.factura});

  @override
  Widget build(BuildContext context) {
    final payload = factura['payload_json'] ?? {};
    final items = (payload['items'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    return Scaffold(
      appBar: AppBar(title: const Text('Detalle Factura')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header info
          Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _InfoRow('No. Comprobante', factura['e_ncf'] ?? '—'),
                _InfoRow('Estado', factura['estado_dgii'] ?? '—'),
                _InfoRow('Track ID', factura['track_id'] ?? 'Pendiente'),
                _InfoRow('Receptor', payload['nombre_receptor'] ?? '—'),
                _InfoRow('RNC Receptor', payload['rnc_receptor'] ?? '—'),
                _InfoRow('Total', 'RD\$ ${_fmt(payload['monto_total'])}'),
              ],
            ),
          )),
          const SizedBox(height: 16),

          // Items
          if (items.isNotEmpty) ...[
            const Text('Ítems', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            ...items.map((item) => Card(child: ListTile(
              title: Text(item['descripcion'] ?? '', style: const TextStyle(fontSize: 13)),
              subtitle: Text('${item['cantidad']}x \$${_fmt(item['precio_unitario'])} — ITBIS ${item['tasa_itbis']}%',
                style: const TextStyle(fontSize: 11)),
              trailing: Text('\$${_fmt((item['cantidad'] ?? 1) * (item['precio_unitario'] ?? 0))}',
                style: const TextStyle(fontWeight: FontWeight.w600)),
            ))),
          ],
          const SizedBox(height: 24),

          // Actions
          Row(children: [
            Expanded(child: OutlinedButton.icon(
              onPressed: () => _downloadPdf(context),
              icon: const Icon(Icons.picture_as_pdf, size: 18),
              label: const Text('PDF'),
            )),
            const SizedBox(width: 8),
            Expanded(child: OutlinedButton.icon(
              onPressed: () => _sendEmail(context),
              icon: const Icon(Icons.email_outlined, size: 18),
              label: const Text('Email'),
            )),
            const SizedBox(width: 8),
            Expanded(child: OutlinedButton.icon(
              onPressed: () => _share(context),
              icon: const Icon(Icons.share, size: 18),
              label: const Text('Compartir'),
            )),
          ]),
        ],
      ),
    );
  }

  Future<void> _downloadPdf(BuildContext context) async {
    try {
      final res = await apiClient.dio.get(ApiConfig.facturaPdf(factura['id']));
      final url = res.data['url'];
      if (url != null && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('PDF generado. Abriendo...')),
        );
        // In production, use url_launcher to open the presigned URL
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('PDF no disponible'), backgroundColor: AppColors.danger),
        );
      }
    }
  }

  Future<void> _sendEmail(BuildContext context) async {
    final emailController = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Enviar por correo'),
        content: TextField(
          controller: emailController,
          decoration: const InputDecoration(labelText: 'Email destino'),
          keyboardType: TextInputType.emailAddress,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, emailController.text),
            child: const Text('Enviar'),
          ),
        ],
      ),
    );

    if (result != null && result.isNotEmpty) {
      try {
        await apiClient.dio.post(ApiConfig.facturaEmail(factura['id']), data: {'email': result});
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Enviado a $result'), backgroundColor: AppColors.success),
          );
        }
      } catch (_) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Error al enviar'), backgroundColor: AppColors.danger),
          );
        }
      }
    }
  }

  void _share(BuildContext context) {
    final ncf = factura['e_ncf'] ?? '';
    final payload = factura['payload_json'] ?? {};
    Share.share(
      'Factura $ncf\nReceptor: ${payload['nombre_receptor']}\nTotal: RD\$ ${_fmt(payload['monto_total'])}\nVerificar: https://dgii.gov.do/ConsultaNCF',
    );
  }

  String _fmt(dynamic v) {
    if (v == null) return '0.00';
    final n = v is num ? v : double.tryParse(v.toString()) ?? 0;
    return n.toStringAsFixed(2);
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          Flexible(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13), textAlign: TextAlign.right)),
        ],
      ),
    );
  }
}
