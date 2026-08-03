import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';

class DashboardScreen extends StatefulWidget {
  final ApiClient apiClient;

  const DashboardScreen({super.key, required this.apiClient});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _uso;
  Map<String, dynamic>? _cert;
  Map<String, dynamic>? _permisos;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        widget.apiClient.dio.get(ApiConfig.empresaUso),
        widget.apiClient.dio.get(ApiConfig.empresaCertificado),
        widget.apiClient.dio.get(ApiConfig.empresaPermisos),
      ]);
      setState(() {
        _uso = results[0].data;
        _cert = results[1].data;
        _permisos = results[2].data;
      });
    } catch (_) {}
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Greeting
          const Text(
            'Bienvenido',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          const Text(
            'Resumen de tu cuenta',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
          ),
          const SizedBox(height: 20),

          // Quick actions
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _QuickAction(label: 'Nueva Factura', icon: Icons.add, onTap: () {}),
                _QuickAction(label: 'Catálogo', icon: Icons.inventory_2_outlined, onTap: () {}),
                _QuickAction(label: 'Recibidas', icon: Icons.inbox_outlined, onTap: () {}),
                _QuickAction(label: 'Reportes', icon: Icons.bar_chart, onTap: () {}),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Metrics
          _MetricCard(
            icon: Icons.receipt_long,
            label: 'Facturas este mes',
            value: _uso != null
                ? '${_uso!['facturas_mes'] ?? 0} / ${_uso!['facturas_limite'] ?? 0}'
                : '—',
            progress: _uso != null && _uso!['facturas_limite'] != null && (_uso!['facturas_limite'] as num) > 0
                ? (_uso!['facturas_mes'] as num? ?? 0) / (_uso!['facturas_limite'] as num)
                : null,
          ),
          const SizedBox(height: 12),
          _MetricCard(
            icon: Icons.card_membership,
            label: 'Plan actual',
            value: _uso?['plan_nombre'] ?? '—',
          ),
          const SizedBox(height: 12),
          _MetricCard(
            icon: Icons.verified_user,
            label: 'Certificado digital',
            value: _getCertLabel(),
            valueColor: _getCertColor(),
          ),
          const SizedBox(height: 12),
          _MetricCard(
            icon: Icons.cloud,
            label: 'Ambiente DGII',
            value: _permisos?['ambiente'] == 'produccion'
                ? '🟢 Producción'
                : '🟡 Pruebas',
          ),
        ],
      ),
    );
  }

  String _getCertLabel() {
    final estado = _cert?['estado'] ?? '';
    switch (estado) {
      case 'activo': return 'Activo';
      case 'por_vencer': return 'Por vencer';
      case 'vencido': return 'Vencido';
      case 'sin_certificado': return 'Sin certificado';
      default: return '—';
    }
  }

  Color _getCertColor() {
    final estado = _cert?['estado'] ?? '';
    switch (estado) {
      case 'activo': return AppColors.success;
      case 'por_vencer': return AppColors.warning;
      case 'vencido': return AppColors.danger;
      default: return AppColors.textSecondary;
    }
  }
}

class _QuickAction extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const _QuickAction({required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 16),
        label: Text(label, style: const TextStyle(fontSize: 12)),
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final double? progress;
  final Color? valueColor;

  const _MetricCard({
    required this.icon,
    required this.label,
    required this.value,
    this.progress,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, size: 28, color: AppColors.primaryLight),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary, fontWeight: FontWeight.w500,
                  )),
                  const SizedBox(height: 4),
                  Text(value, style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w700,
                    color: valueColor ?? AppColors.textPrimary,
                  )),
                  if (progress != null) ...[
                    const SizedBox(height: 8),
                    LinearProgressIndicator(
                      value: progress!.clamp(0.0, 1.0),
                      backgroundColor: AppColors.border,
                      color: AppColors.primaryLight,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
