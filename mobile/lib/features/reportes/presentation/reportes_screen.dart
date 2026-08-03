import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';

class ReportesScreen extends StatefulWidget {
  final ApiClient apiClient;
  const ReportesScreen({super.key, required this.apiClient});

  @override
  State<ReportesScreen> createState() => _ReportesScreenState();
}

class _ReportesScreenState extends State<ReportesScreen> {
  int _anio = DateTime.now().year;
  int _mes = DateTime.now().month;
  Map<String, dynamic>? _resumen;
  bool _loading = false;

  final _meses = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
  ];

  Future<void> _consultar() async {
    setState(() => _loading = true);
    try {
      final res = await widget.apiClient.dio.get(
        ApiConfig.reportesResumen,
        queryParameters: {'anio': _anio, 'mes': _mes},
      );
      setState(() => _resumen = res.data);
    } catch (_) {}
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Period selection
        Row(children: [
          Expanded(child: DropdownButtonFormField<int>(
            value: _anio,
            decoration: const InputDecoration(labelText: 'Año'),
            items: List.generate(5, (i) => DateTime.now().year - i)
                .map((y) => DropdownMenuItem(value: y, child: Text('$y')))
                .toList(),
            onChanged: (v) => setState(() => _anio = v!),
          )),
          const SizedBox(width: 12),
          Expanded(child: DropdownButtonFormField<int>(
            value: _mes,
            decoration: const InputDecoration(labelText: 'Mes'),
            items: _meses.asMap().entries.map((e) =>
              DropdownMenuItem(value: e.key + 1, child: Text(e.value)),
            ).toList(),
            onChanged: (v) => setState(() => _mes = v!),
          )),
        ]),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: _loading ? null : _consultar,
          child: Text(_loading ? 'Consultando...' : 'Consultar período'),
        ),
        const SizedBox(height: 24),

        if (_resumen != null) ...[
          _ReporteCard(
            titulo: '606 — Compras',
            registros: _resumen!['formato_606']?['registros'] ?? 0,
            icon: Icons.download,
          ),
          const SizedBox(height: 12),
          _ReporteCard(
            titulo: '607 — Ventas',
            registros: _resumen!['formato_607']?['registros'] ?? 0,
            icon: Icons.upload,
          ),
          const SizedBox(height: 12),
          _ReporteCard(
            titulo: '608 — Anulados',
            registros: _resumen!['formato_608']?['registros'] ?? 0,
            icon: Icons.cancel_outlined,
          ),
        ],
      ],
    );
  }
}

class _ReporteCard extends StatelessWidget {
  final String titulo;
  final int registros;
  final IconData icon;

  const _ReporteCard({
    required this.titulo,
    required this.registros,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: AppColors.primaryLight),
        title: Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('$registros registros'),
        trailing: const Icon(Icons.file_download_outlined),
      ),
    );
  }
}
