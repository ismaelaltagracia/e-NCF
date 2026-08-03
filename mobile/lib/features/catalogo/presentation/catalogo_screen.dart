import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';

class CatalogoScreen extends StatefulWidget {
  final ApiClient apiClient;
  const CatalogoScreen({super.key, required this.apiClient});

  @override
  State<CatalogoScreen> createState() => _CatalogoScreenState();
}

class _CatalogoScreenState extends State<CatalogoScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<dynamic> _items = [];
  bool _loading = true;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() => setState(() {}));
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await widget.apiClient.dio.get(ApiConfig.catalogo);
      setState(() => _items = res.data is List ? res.data : []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  List<dynamic> get _filteredItems {
    final tipo = _tabController.index == 0 ? 'producto' : 'servicio';
    return _items.where((i) {
      final matchTipo = i['tipo'] == tipo;
      final matchSearch = _search.isEmpty ||
          (i['nombre'] ?? '').toLowerCase().contains(_search.toLowerCase());
      return matchTipo && matchSearch;
    }).toList();
  }

  Future<void> _addItem() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _ItemForm(
        tipo: _tabController.index == 0 ? 'producto' : 'servicio',
      ),
    );
    if (result != null) {
      await widget.apiClient.dio.post(ApiConfig.catalogo, data: result);
      _load();
    }
  }

  Future<void> _deleteItem(String id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Eliminar?'),
        content: const Text('Esta acción no se puede deshacer.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirm == true) {
      await widget.apiClient.dio.delete('${ApiConfig.catalogo}/$id');
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Catálogo'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Productos'),
            Tab(text: 'Servicios'),
          ],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Buscar...',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _search = v),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _filteredItems.isEmpty
                    ? const Center(child: Text('Sin resultados',
                        style: TextStyle(color: AppColors.textSecondary)))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          itemCount: _filteredItems.length,
                          itemBuilder: (ctx, i) {
                            final item = _filteredItems[i];
                            return Dismissible(
                              key: Key(item['id']),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                color: AppColors.danger,
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 16),
                                child: const Icon(Icons.delete,
                                    color: Colors.white),
                              ),
                              onDismissed: (_) => _deleteItem(item['id']),
                              child: ListTile(
                                title: Text(item['nombre'] ?? '',
                                    style: const TextStyle(fontSize: 14,
                                        fontWeight: FontWeight.w600)),
                                subtitle: Text(
                                  item['descripcion'] ?? '',
                                  style: const TextStyle(fontSize: 12),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                trailing: Text(
                                  'RD\$ ${item['precio']?.toStringAsFixed(2) ?? '0.00'}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _addItem,
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }
}

class _ItemForm extends StatefulWidget {
  final String tipo;
  const _ItemForm({required this.tipo});

  @override
  State<_ItemForm> createState() => _ItemFormState();
}

class _ItemFormState extends State<_ItemForm> {
  final _nombre = TextEditingController();
  final _descripcion = TextEditingController();
  final _precio = TextEditingController();
  int _tasaItbis = 18;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
          16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Nuevo ${widget.tipo}',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nombre,
            decoration: const InputDecoration(labelText: 'Nombre'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descripcion,
            decoration: const InputDecoration(labelText: 'Descripción'),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: TextField(
              controller: _precio,
              decoration: const InputDecoration(labelText: 'Precio'),
              keyboardType: TextInputType.number,
            )),
            const SizedBox(width: 12),
            SizedBox(
              width: 100,
              child: DropdownButtonFormField<int>(
                initialValue: _tasaItbis,
                decoration: const InputDecoration(labelText: 'ITBIS'),
                items: const [
                  DropdownMenuItem(value: 0, child: Text('0%')),
                  DropdownMenuItem(value: 16, child: Text('16%')),
                  DropdownMenuItem(value: 18, child: Text('18%')),
                ],
                onChanged: (v) => _tasaItbis = v!,
              ),
            ),
          ]),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: () {
              if (_nombre.text.isEmpty) return;
              Navigator.pop(context, {
                'nombre': _nombre.text,
                'descripcion': _descripcion.text,
                'precio': double.tryParse(_precio.text) ?? 0,
                'tasa_itbis': _tasaItbis,
                'tipo': widget.tipo,
              });
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }
}
