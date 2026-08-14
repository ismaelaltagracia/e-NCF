import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';
import 'equipo_screen.dart';

class ContadorPanelScreen extends StatefulWidget {
  final ApiClient apiClient;
  const ContadorPanelScreen({super.key, required this.apiClient});

  @override
  State<ContadorPanelScreen> createState() => _ContadorPanelScreenState();
}

class _ContadorPanelScreenState extends State<ContadorPanelScreen> {
  List<dynamic> _empresas = [];
  Map<String, dynamic>? _factura;
  List<dynamic> _planes = [];
  bool _loading = true;
  bool _isContador = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      // Check if user is a contador
      final meRes = await widget.apiClient.dio.get('/api/v1/contador/me');
      if (meRes.statusCode == 200) {
        _isContador = true;
        final results = await Future.wait([
          widget.apiClient.dio.get('/api/v1/contador/empresas'),
          widget.apiClient.dio.get('/api/v1/contador/factura-actual'),
          widget.apiClient.dio.get(ApiConfig.planes),
        ]);
        _empresas = results[0].data is List ? results[0].data : [];
        _factura = results[1].data;
        _planes = (results[2].data as List?)?.where((p) => p['activo'] == true).toList() ?? [];
      }
    } catch (_) {
      _isContador = false;
    }
    setState(() => _loading = false);
  }

  Future<void> _cambiarEmpresa(String empresaId) async {
    try {
      final res = await widget.apiClient.dio.post(
        '/api/v1/contador/cambiar-empresa',
        data: {'empresa_id': empresaId},
      );
      if (res.data['access_token'] != null) {
        await widget.apiClient.setTokens(res.data['access_token'], '');
        if (mounted) {
          Navigator.of(context).popUntil((route) => route.isFirst);
        }
      }
    } catch (_) {}
  }

  Future<void> _crearEmpresa() async {
    final result = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _CrearEmpresaSheet(planes: _planes),
    );
    if (result != null) {
      try {
        await widget.apiClient.dio.post('/api/v1/contador/empresas', data: {
          'nombre': result['nombre'],
          'rnc': result['rnc'],
          'plan_id': result['plan_id'],
        });
        _load();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Error al crear empresa'), backgroundColor: AppColors.danger),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (!_isContador) return _buildRegistroContador();

    return Scaffold(
      appBar: AppBar(title: const Text('Mis Empresas')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Stats
            _buildStats(),
            const SizedBox(height: 20),

            // Empresas
            ..._empresas.asMap().entries.map((e) => _buildEmpresaCard(e.key, e.value)),

            // Equipo button
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => Navigator.push(context, MaterialPageRoute(
                builder: (_) => EquipoScreen(apiClient: widget.apiClient, empresas: _empresas),
              )),
              icon: const Icon(Icons.group_outlined, size: 18),
              label: const Text('Gestionar equipo'),
            ),

            const SizedBox(height: 16),

            // Factura preview
            if (_factura != null && (_factura!['detalle'] as List?)?.isNotEmpty == true)
              _buildFacturaPreview(),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _crearEmpresa,
        backgroundColor: AppColors.primary,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('Agregar empresa', style: TextStyle(color: Colors.white)),
      ),
    );
  }

  Widget _buildStats() {
    return Row(
      children: [
        Expanded(child: _StatCard(
          value: '${_empresas.length}',
          label: 'Empresas',
        )),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(
          value: _factura != null ? 'RD\$ ${_fmtNum(_factura!['total'])}' : '—',
          label: 'Factura mes',
        )),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(
          value: _factura != null ? 'RD\$ ${_fmtNum(_factura!['descuento_total'])}' : '—',
          label: 'Ahorro',
          valueColor: AppColors.success,
        )),
      ],
    );
  }

  Widget _buildEmpresaCard(int idx, dynamic ce) {
    final empresa = ce['empresa'] ?? {};
    final plan = ce['plan'] ?? {};
    final precio = double.tryParse('${plan['precio']}') ?? 0;
    final tieneDescuento = idx >= 2;
    final precioFinal = tieneDescuento ? precio * 0.8 : precio;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => _cambiarEmpresa(ce['empresa_id']),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(child: Text(
                    empresa['nombre'] ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  )),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: tieneDescuento ? AppColors.success.withValues(alpha: 0.1) : Colors.grey[100],
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      tieneDescuento ? '-20%' : 'Precio base',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: tieneDescuento ? AppColors.success : AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text('RNC: ${empresa['rnc'] ?? ''}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Plan: ${plan['nombre'] ?? ''}', style: const TextStyle(fontSize: 12)),
                  Text(
                    'RD\$ ${precioFinal.toStringAsFixed(2)}/mes',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primaryLight),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFacturaPreview() {
    final detalle = (_factura!['detalle'] as List?) ?? [];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Factura del mes', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            ...detalle.map((d) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(child: Text('${d['empresa_nombre']}', style: const TextStyle(fontSize: 12))),
                  Text(
                    'RD\$ ${(d['precio_final'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            )),
            const Divider(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total', style: TextStyle(fontWeight: FontWeight.w700)),
                Text('RD\$ ${_fmtNum(_factura!['total'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRegistroContador() {
    return Scaffold(
      appBar: AppBar(title: const Text('Modo Contador')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Gestiona múltiples empresas',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
              'Registra tu perfil de contador y administra la facturación electrónica de todos tus clientes desde un solo lugar.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 14, height: 1.5),
            ),
            const SizedBox(height: 24),
            _BenefitTile(icon: Icons.discount, title: '20% de descuento', desc: 'A partir de la 3ra empresa'),
            _BenefitTile(icon: Icons.bar_chart, title: 'Reportes centralizados', desc: '606/607/608 de cada empresa'),
            _BenefitTile(icon: Icons.receipt_long, title: 'Factura consolidada', desc: 'Una sola factura mensual'),
            _BenefitTile(icon: Icons.group, title: 'Equipo controlado', desc: 'Usuarios con acceso por empresa'),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _registrarComoContador,
                child: const Text('Activar modo contador'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _registrarComoContador() async {
    final nombre = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final controller = TextEditingController();
        return AlertDialog(
          title: const Text('Nombre de tu firma'),
          content: TextField(
            controller: controller,
            decoration: const InputDecoration(hintText: 'Ej: Martínez & Asociados CPA'),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, controller.text),
              child: const Text('Activar'),
            ),
          ],
        );
      },
    );

    if (nombre != null && nombre.isNotEmpty) {
      try {
        await widget.apiClient.dio.post('/api/v1/contador/registro', data: {
          'nombre_firma': nombre,
          'email_facturacion': '', // Will use user's email
        });
        _load();
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Error al registrar'), backgroundColor: AppColors.danger),
          );
        }
      }
    }
  }

  String _fmtNum(dynamic v) {
    if (v == null) return '0.00';
    return (v is num ? v : double.tryParse('$v') ?? 0).toStringAsFixed(2);
  }
}

class _StatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color? valueColor;
  const _StatCard({required this.value, required this.label, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: valueColor ?? AppColors.textPrimary)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _BenefitTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String desc;
  const _BenefitTile({required this.icon, required this.title, required this.desc});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primaryLight.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: AppColors.primaryLight),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              Text(desc, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }
}

class _CrearEmpresaSheet extends StatefulWidget {
  final List<dynamic> planes;
  const _CrearEmpresaSheet({required this.planes});

  @override
  State<_CrearEmpresaSheet> createState() => _CrearEmpresaSheetState();
}

class _CrearEmpresaSheetState extends State<_CrearEmpresaSheet> {
  final _nombre = TextEditingController();
  final _rnc = TextEditingController();
  String? _planId;

  @override
  void initState() {
    super.initState();
    if (widget.planes.isNotEmpty) _planId = widget.planes[0]['id'];
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Agregar empresa', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          TextField(controller: _nombre, decoration: const InputDecoration(labelText: 'Nombre de la empresa')),
          const SizedBox(height: 12),
          TextField(controller: _rnc, decoration: const InputDecoration(labelText: 'RNC'), keyboardType: TextInputType.number, maxLength: 11),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _planId,
            decoration: const InputDecoration(labelText: 'Plan'),
            items: widget.planes.map((p) => DropdownMenuItem<String>(
              value: p['id'] as String,
              child: Text('${p['nombre']} — RD\$ ${p['precio']}', style: const TextStyle(fontSize: 13)),
            )).toList(),
            onChanged: (v) => _planId = v,
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: () {
              if (_nombre.text.isNotEmpty && _rnc.text.isNotEmpty && _planId != null) {
                Navigator.pop(context, {'nombre': _nombre.text, 'rnc': _rnc.text, 'plan_id': _planId!});
              }
            },
            child: const Text('Crear empresa'),
          ),
        ],
      ),
    );
  }
}
