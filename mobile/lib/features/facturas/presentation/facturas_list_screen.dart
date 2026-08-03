import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';
import 'nueva_factura_screen.dart';
import 'factura_detalle_screen.dart';

class FacturasListScreen extends StatefulWidget {
  final ApiClient apiClient;
  const FacturasListScreen({super.key, required this.apiClient});

  @override
  State<FacturasListScreen> createState() => _FacturasListScreenState();
}

class _FacturasListScreenState extends State<FacturasListScreen> {
  List<dynamic> _facturas = [];
  bool _loading = true;
  int _page = 1;
  int _total = 0;
  final int _limit = 20;

  @override
  void initState() {
    super.initState();
    _loadFacturas();
  }

  Future<void> _loadFacturas({bool refresh = false}) async {
    if (refresh) _page = 1;
    setState(() => _loading = true);
    try {
      final res = await widget.apiClient.dio.get(
        ApiConfig.facturas,
        queryParameters: {'page': _page, 'limit': _limit},
      );
      setState(() {
        _facturas = res.data['data'] ?? [];
        _total = res.data['total'] ?? 0;
      });
    } catch (_) {}
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _facturas.isEmpty
              ? _buildEmpty()
              : _buildList(),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await Navigator.push(context, MaterialPageRoute(
            builder: (_) => NuevaFacturaScreen(apiClient: widget.apiClient),
          ));
          _loadFacturas(refresh: true);
        },
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.receipt_long, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          const Text('No hay facturas emitidas',
              style: TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => NuevaFacturaScreen(apiClient: widget.apiClient),
            )),
            icon: const Icon(Icons.add),
            label: const Text('Crear primera factura'),
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    return RefreshIndicator(
      onRefresh: () => _loadFacturas(refresh: true),
      child: ListView.builder(
        itemCount: _facturas.length + 1,
        itemBuilder: (ctx, i) {
          if (i == _facturas.length) return _buildPagination();
          final f = _facturas[i];
          return _FacturaItem(
            factura: f,
            onTap: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => FacturaDetalleScreen(
                apiClient: widget.apiClient,
                factura: f,
              ),
            )),
          );
        },
      ),
    );
  }

  Widget _buildPagination() {
    final totalPages = (_total / _limit).ceil();
    if (totalPages <= 1) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          TextButton(
            onPressed: _page > 1 ? () { _page--; _loadFacturas(); } : null,
            child: const Text('← Anterior'),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('$_page / $totalPages',
                style: const TextStyle(fontSize: 13)),
          ),
          TextButton(
            onPressed: _page < totalPages ? () { _page++; _loadFacturas(); } : null,
            child: const Text('Siguiente →'),
          ),
        ],
      ),
    );
  }
}

class _FacturaItem extends StatelessWidget {
  final Map<String, dynamic> factura;
  final VoidCallback onTap;

  const _FacturaItem({required this.factura, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final payload = factura['payload_json'] ?? {};
    final estado = factura['estado_dgii'] ?? '';

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
        onTap: onTap,
        title: Text(
          factura['e_ncf'] ?? 'Sin comprobante',
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        subtitle: Text(
          payload['nombre_receptor'] ?? payload['rnc_receptor'] ?? '',
          style: const TextStyle(fontSize: 12),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              'RD\$ ${_formatMoney(payload['monto_total'])}',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
            ),
            const SizedBox(height: 4),
            _EstadoBadge(estado: estado),
          ],
        ),
      ),
    );
  }

  String _formatMoney(dynamic value) {
    if (value == null) return '0.00';
    final num n = value is num ? value : double.tryParse(value.toString()) ?? 0;
    return n.toStringAsFixed(2);
  }
}

class _EstadoBadge extends StatelessWidget {
  final String estado;
  const _EstadoBadge({required this.estado});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (estado) {
      case 'aprobado': color = AppColors.success; break;
      case 'aceptado': color = Colors.blue; break;
      case 'rechazado': case 'fallido': color = AppColors.danger; break;
      case 'anulado': color = Colors.grey; break;
      default: color = AppColors.warning;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(estado, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600)),
    );
  }
}
