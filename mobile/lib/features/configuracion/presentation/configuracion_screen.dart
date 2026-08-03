import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';

class ConfiguracionScreen extends StatefulWidget {
  final ApiClient apiClient;
  const ConfiguracionScreen({super.key, required this.apiClient});

  @override
  State<ConfiguracionScreen> createState() => _ConfiguracionScreenState();
}

class _ConfiguracionScreenState extends State<ConfiguracionScreen> {
  Map<String, dynamic>? _empresa;
  Map<String, dynamic>? _certEstado;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        widget.apiClient.dio.get(ApiConfig.empresaMe),
        widget.apiClient.dio.get(ApiConfig.empresaCertificado),
      ]);
      setState(() {
        _empresa = results[0].data;
        _certEstado = results[1].data;
      });
    } catch (_) {}
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return Scaffold(
      appBar: AppBar(title: const Text('Configuración')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Empresa
            _SectionHeader(title: 'Empresa'),
            Card(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _InfoRow('Nombre', _empresa?['nombre'] ?? '—'),
                  _InfoRow('RNC', _empresa?['rnc'] ?? '—'),
                  _InfoRow('Ambiente', _empresa?['ambiente_dgii'] ?? '—'),
                  _InfoRow('Estado', _empresa?['estado'] ?? '—'),
                ],
              ),
            )),
            const SizedBox(height: 24),

            // Certificado
            _SectionHeader(title: 'Certificado Digital'),
            Card(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _CertBadge(estado: _certEstado?['estado'] ?? 'sin_certificado'),
                  if (_certEstado?['vence_en'] != null) ...[
                    const SizedBox(height: 8),
                    _InfoRow('Vence', _certEstado!['vence_en'].toString().substring(0, 10)),
                  ],
                  if (_certEstado?['dias_restantes'] != null) ...[
                    const SizedBox(height: 4),
                    _InfoRow('Días restantes', '${_certEstado!['dias_restantes']}'),
                  ],
                ],
              ),
            )),
            const SizedBox(height: 24),

            // Links
            _SectionHeader(title: 'Accesos rápidos'),
            ListTile(
              leading: const Icon(Icons.numbers),
              title: const Text('Secuencias de comprobantes'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(
                builder: (_) => _SecuenciasScreen(apiClient: widget.apiClient),
              )),
            ),
            ListTile(
              leading: const Icon(Icons.people_outline),
              title: const Text('Usuarios'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(
                builder: (_) => _UsuariosScreen(apiClient: widget.apiClient),
              )),
            ),
            ListTile(
              leading: const Icon(Icons.card_membership),
              title: const Text('Mi Plan'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {},
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title, style: const TextStyle(
        fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textSecondary,
      )),
    );
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
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        ],
      ),
    );
  }
}

class _CertBadge extends StatelessWidget {
  final String estado;
  const _CertBadge({required this.estado});

  @override
  Widget build(BuildContext context) {
    Color color;
    String label;
    switch (estado) {
      case 'activo': color = AppColors.success; label = '✅ Activo'; break;
      case 'por_vencer': color = AppColors.warning; label = '⚠️ Por vencer'; break;
      case 'vencido': color = AppColors.danger; label = '❌ Vencido'; break;
      default: color = AppColors.textSecondary; label = '⚠️ Sin certificado';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 13)),
    );
  }
}

// ─── Secuencias Screen ───

class _SecuenciasScreen extends StatefulWidget {
  final ApiClient apiClient;
  const _SecuenciasScreen({required this.apiClient});

  @override
  State<_SecuenciasScreen> createState() => _SecuenciasScreenState();
}

class _SecuenciasScreenState extends State<_SecuenciasScreen> {
  List<dynamic> _secuencias = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await widget.apiClient.dio.get(ApiConfig.secuencias);
      setState(() => _secuencias = res.data is List ? res.data : []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Secuencias de Comprobantes')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _secuencias.length,
              itemBuilder: (ctx, i) {
                final s = _secuencias[i];
                final actual = s['numero_actual'] ?? 0;
                final fin = s['numero_fin'] ?? 1;
                final progress = actual / fin;
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(s['tipo_comprobante'] ?? '',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Prefijo: ${s['prefijo']} | Actual: $actual / $fin',
                            style: const TextStyle(fontSize: 12)),
                        const SizedBox(height: 4),
                        LinearProgressIndicator(
                          value: progress.clamp(0.0, 1.0),
                          backgroundColor: AppColors.border,
                        ),
                      ],
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: s['activo'] == true
                            ? AppColors.success.withValues(alpha: 0.1)
                            : AppColors.danger.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        s['activo'] == true ? 'Activa' : 'Inactiva',
                        style: TextStyle(
                          fontSize: 11,
                          color: s['activo'] == true ? AppColors.success : AppColors.danger,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}

// ─── Usuarios Screen ───

class _UsuariosScreen extends StatefulWidget {
  final ApiClient apiClient;
  const _UsuariosScreen({required this.apiClient});

  @override
  State<_UsuariosScreen> createState() => _UsuariosScreenState();
}

class _UsuariosScreenState extends State<_UsuariosScreen> {
  List<dynamic> _usuarios = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await widget.apiClient.dio.get(ApiConfig.usuarios);
      setState(() => _usuarios = res.data is List ? res.data : []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Usuarios')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _usuarios.length,
              itemBuilder: (ctx, i) {
                final u = _usuarios[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: AppColors.primaryLight,
                      child: Text(
                        (u['nombre'] ?? 'U')[0].toUpperCase(),
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                    title: Text(u['nombre'] ?? '',
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    subtitle: Text(u['email'] ?? '', style: const TextStyle(fontSize: 12)),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.accent.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(u['rol'] ?? '', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
