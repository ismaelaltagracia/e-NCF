import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';

/// Pantalla de escáner QR para registrar compras.
/// En simulador muestra placeholder. En dispositivo físico usa la cámara.
class QrScannerScreen extends StatelessWidget {
  const QrScannerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Escanear comprobante')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.qr_code_scanner, size: 64, color: AppColors.primaryLight),
            const SizedBox(height: 16),
            const Text('Scanner QR', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            const Text('Disponible en dispositivo físico',
                style: TextStyle(color: AppColors.textSecondary)),
            const SizedBox(height: 24),
            OutlinedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Volver'),
            ),
          ],
        ),
      ),
    );
  }
}
