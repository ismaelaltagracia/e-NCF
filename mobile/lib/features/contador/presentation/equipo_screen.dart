import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';

class EquipoScreen extends StatefulWidget {
  final ApiClient apiClient;
  final List<dynamic> empresas; // Empresas del contador para asignar

  const EquipoScreen({super.key, required this.apiClient, required this.empresas});

  @override
  State<EquipoScreen> createState() => _EquipoScreenState();
}

class _EquipoScreenState extends State<EquipoScreen> {
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
      final res = await widget.apiClient.dio.get('/api/v1/contador/usuarios');
      setState(() => _usuarios = res.data is List ? res.data : []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _agregarUsuario() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _AgregarUsuarioSheet(empresas: widget.empresas),
    );

    if (result != null) {
      try {
        await widget.apiClient.dio.post('/api/v1/contador/usuarios', data: result);
        _load();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Usuario agregado'), backgroundColor: AppColors.success),
          );
        }
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Error al agregar usuario'), backgroundColor: AppColors.danger),
          );
        }
      }
    }
  }

  Future<void> _eliminarUsuario(String usuarioId, String nombre) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Desactivar usuario'),
        content: Text('¿Desactivar a $nombre? Ya no podrá acceder a las empresas asignadas.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Desactivar'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await widget.apiClient.dio.delete('/api/v1/contador/usuarios/$usuarioId');
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mi Equipo')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _usuarios.isEmpty
              ? _buildEmpty()
              : _buildList(),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _agregarUsuario,
        backgroundColor: AppColors.primary,
        icon: const Icon(Icons.person_add, color: Colors.white),
        label: const Text('Agregar', style: TextStyle(color: Colors.white)),
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.group_outlined, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          const Text('Sin usuarios en el equipo', style: TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 8),
          const Text(
            'Agrega asistentes y asígnales\nlas empresas que pueden gestionar.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _usuarios.length,
        itemBuilder: (ctx, i) {
          final u = _usuarios[i];
          final empresas = (u['empresas'] as List?)?.join(', ') ?? '';
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: AppColors.primaryLight,
                child: Text(
                  (u['nombre'] ?? 'U')[0].toUpperCase(),
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                ),
              ),
              title: Text(u['nombre'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(u['email'] ?? '', style: const TextStyle(fontSize: 11)),
                  const SizedBox(height: 2),
                  Row(children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppColors.accent.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(u['rol'] ?? '', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(
                      empresas,
                      style: const TextStyle(fontSize: 10, color: AppColors.textSecondary),
                      overflow: TextOverflow.ellipsis,
                    )),
                  ]),
                ],
              ),
              trailing: IconButton(
                icon: const Icon(Icons.remove_circle_outline, color: AppColors.danger, size: 20),
                onPressed: () => _eliminarUsuario(u['usuario_id'] ?? '', u['nombre'] ?? ''),
              ),
              isThreeLine: true,
            ),
          );
        },
      ),
    );
  }
}

// ─── Bottom sheet para agregar usuario ───

class _AgregarUsuarioSheet extends StatefulWidget {
  final List<dynamic> empresas;
  const _AgregarUsuarioSheet({required this.empresas});

  @override
  State<_AgregarUsuarioSheet> createState() => _AgregarUsuarioSheetState();
}

class _AgregarUsuarioSheetState extends State<_AgregarUsuarioSheet> {
  final _usuarioId = TextEditingController();
  String _rol = 'facturador';
  final Set<String> _selectedEmpresas = {};

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Agregar usuario al equipo', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),

            TextField(
              controller: _usuarioId,
              decoration: const InputDecoration(
                labelText: 'ID del usuario',
                hintText: 'UUID del usuario registrado',
                helperText: 'El usuario debe estar registrado en el sistema',
              ),
            ),
            const SizedBox(height: 16),

            DropdownButtonFormField<String>(
              initialValue: _rol,
              decoration: const InputDecoration(labelText: 'Rol'),
              items: const [
                DropdownMenuItem(value: 'admin', child: Text('Admin')),
                DropdownMenuItem(value: 'facturador', child: Text('Facturador')),
                DropdownMenuItem(value: 'lector', child: Text('Solo lectura')),
              ],
              onChanged: (v) => _rol = v ?? 'facturador',
            ),
            const SizedBox(height: 16),

            const Text('Empresas asignadas:', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),

            ...widget.empresas.map((ce) {
              final empresa = ce['empresa'] ?? {};
              final empresaId = ce['empresa_id'] ?? '';
              final nombre = empresa['nombre'] ?? '';
              return CheckboxListTile(
                value: _selectedEmpresas.contains(empresaId),
                onChanged: (v) {
                  setState(() {
                    if (v == true) {
                      _selectedEmpresas.add(empresaId);
                    } else {
                      _selectedEmpresas.remove(empresaId);
                    }
                  });
                },
                title: Text(nombre, style: const TextStyle(fontSize: 13)),
                controlAffinity: ListTileControlAffinity.leading,
                dense: true,
              );
            }),

            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _selectedEmpresas.isEmpty || _usuarioId.text.isEmpty
                  ? null
                  : () {
                      Navigator.pop(context, {
                        'usuario_id': _usuarioId.text.trim(),
                        'rol': _rol,
                        'empresa_ids': _selectedEmpresas.toList(),
                      });
                    },
              child: Text('Agregar a ${_selectedEmpresas.length} empresa(s)'),
            ),
          ],
        ),
      ),
    );
  }
}
