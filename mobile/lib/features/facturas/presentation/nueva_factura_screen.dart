import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';

class NuevaFacturaScreen extends StatefulWidget {
  final ApiClient apiClient;
  const NuevaFacturaScreen({super.key, required this.apiClient});

  @override
  State<NuevaFacturaScreen> createState() => _NuevaFacturaScreenState();
}

class _NuevaFacturaScreenState extends State<NuevaFacturaScreen> {
  String _tipoComprobante = 'E31';
  final _rncController = TextEditingController();
  final _nombreController = TextEditingController();
  final List<_LineItem> _items = [_LineItem()];
  bool _submitting = false;
  String? _error;

  final _tipos = [
    ('E31', 'Factura de Crédito Fiscal'),
    ('E32', 'Factura de Consumo'),
    ('E33', 'Nota de Débito'),
    ('E34', 'Nota de Crédito'),
    ('E41', 'Compras'),
    ('E43', 'Gastos Menores'),
    ('E44', 'Regímenes Especiales'),
    ('E45', 'Gubernamental'),
    ('E46', 'Exportaciones'),
  ];

  double get _subtotal => _items.fold(0, (s, i) => s + i.cantidad * i.precio);
  double get _itbis => _items.fold(0, (s, i) => s + i.cantidad * i.precio * (i.tasaItbis / 100));
  double get _total => _subtotal + _itbis;

  Future<void> _submit() async {
    if (_rncController.text.isEmpty || _items.every((i) => i.descripcion.isEmpty)) {
      setState(() => _error = 'Complete al menos RNC receptor y un ítem');
      return;
    }

    setState(() { _submitting = true; _error = null; });

    try {
      final res = await widget.apiClient.dio.post(ApiConfig.facturas, data: {
        'rnc_receptor': _rncController.text.trim(),
        'nombre_receptor': _nombreController.text.trim(),
        'tipo_comprobante': _tipoComprobante,
        'items': _items.where((i) => i.descripcion.isNotEmpty).map((i) => {
          'descripcion': i.descripcion,
          'cantidad': i.cantidad,
          'precio_unitario': i.precio,
          'tasa_itbis': i.tasaItbis,
        }).toList(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Factura emitida: ${res.data['e_ncf']}'),
          backgroundColor: AppColors.success,
        ));
        Navigator.pop(context);
      }
    } catch (e) {
      setState(() => _error = 'Error al emitir factura');
    } finally {
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nueva Factura')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Tipo
            DropdownButtonFormField<String>(
              value: _tipoComprobante,
              decoration: const InputDecoration(labelText: 'Tipo de comprobante'),
              items: _tipos.map((t) => DropdownMenuItem(
                value: t.$1, child: Text(t.$2, style: const TextStyle(fontSize: 14)),
              )).toList(),
              onChanged: (v) => setState(() => _tipoComprobante = v!),
            ),
            const SizedBox(height: 16),

            // Receptor
            TextField(
              controller: _rncController,
              decoration: const InputDecoration(labelText: 'RNC Receptor'),
              keyboardType: TextInputType.number,
              maxLength: 11,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _nombreController,
              decoration: const InputDecoration(labelText: 'Nombre receptor (opcional)'),
            ),
            const SizedBox(height: 24),

            // Items
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Ítems', style: TextStyle(fontWeight: FontWeight.w700)),
                TextButton.icon(
                  onPressed: () => setState(() => _items.add(_LineItem())),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Agregar'),
                ),
              ],
            ),
            ..._items.asMap().entries.map((e) => _buildItemCard(e.key, e.value)),

            const SizedBox(height: 16),

            // Totals
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(children: [
                  _TotalRow(label: 'Subtotal', value: _subtotal),
                  _TotalRow(label: 'ITBIS', value: _itbis),
                  const Divider(),
                  _TotalRow(label: 'TOTAL', value: _total, bold: true),
                ]),
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
            ],

            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(height: 20, width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Emitir Factura'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildItemCard(int idx, _LineItem item) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(children: [
          TextField(
            decoration: const InputDecoration(labelText: 'Descripción', isDense: true),
            onChanged: (v) => setState(() => item.descripcion = v),
          ),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(
              decoration: const InputDecoration(labelText: 'Cant.', isDense: true),
              keyboardType: TextInputType.number,
              onChanged: (v) => setState(() => item.cantidad = double.tryParse(v) ?? 1),
            )),
            const SizedBox(width: 8),
            Expanded(child: TextField(
              decoration: const InputDecoration(labelText: 'Precio', isDense: true),
              keyboardType: TextInputType.number,
              onChanged: (v) => setState(() => item.precio = double.tryParse(v) ?? 0),
            )),
            const SizedBox(width: 8),
            SizedBox(width: 70, child: DropdownButtonFormField<int>(
              value: item.tasaItbis,
              decoration: const InputDecoration(labelText: 'ITBIS', isDense: true),
              items: const [
                DropdownMenuItem(value: 0, child: Text('0%')),
                DropdownMenuItem(value: 16, child: Text('16%')),
                DropdownMenuItem(value: 18, child: Text('18%')),
              ],
              onChanged: (v) => setState(() => item.tasaItbis = v!),
            )),
          ]),
          if (_items.length > 1)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => setState(() => _items.removeAt(idx)),
                child: const Text('Eliminar', style: TextStyle(color: AppColors.danger, fontSize: 12)),
              ),
            ),
        ]),
      ),
    );
  }

  @override
  void dispose() {
    _rncController.dispose();
    _nombreController.dispose();
    super.dispose();
  }
}

class _LineItem {
  String descripcion = '';
  double cantidad = 1;
  double precio = 0;
  int tasaItbis = 18;
}

class _TotalRow extends StatelessWidget {
  final String label;
  final double value;
  final bool bold;
  const _TotalRow({required this.label, required this.value, this.bold = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w400)),
          Text('RD\$ ${value.toStringAsFixed(2)}',
            style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
        ],
      ),
    );
  }
}
