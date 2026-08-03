import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';

class RegisterScreen extends StatefulWidget {
  final ApiClient apiClient;
  final VoidCallback onRegistroCompleto;

  const RegisterScreen({
    super.key,
    required this.apiClient,
    required this.onRegistroCompleto,
  });

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  int _step = 0; // 0: datos, 1: certificado, 2: listo
  String? _accessToken;

  // Step 1 fields
  final _empresaNombre = TextEditingController();
  final _rnc = TextEditingController();
  final _adminNombre = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();
  bool _submitting = false;
  String? _error;

  Future<void> _registrar() async {
    if (_password.text != _confirmPassword.text) {
      setState(() => _error = 'Las contraseñas no coinciden');
      return;
    }
    setState(() { _submitting = true; _error = null; });

    try {
      // Register
      await widget.apiClient.dio.post('/api/v1/onboarding/registro', data: {
        'empresa_nombre': _empresaNombre.text.trim(),
        'rnc': _rnc.text.trim(),
        'admin_nombre': _adminNombre.text.trim(),
        'email': _email.text.trim(),
        'password': _password.text,
        'confirm_password': _confirmPassword.text,
      });

      // Auto-login
      final loginRes = await widget.apiClient.dio.post(ApiConfig.login, data: {
        'email': _email.text.trim(),
        'password': _password.text,
      });

      _accessToken = loginRes.data['access_token'];
      await widget.apiClient.setTokens(
        loginRes.data['access_token'],
        loginRes.data['refresh_token'],
      );

      setState(() => _step = 1);
    } catch (e) {
      setState(() => _error = 'Error al registrar. Verifique los datos.');
    } finally {
      setState(() => _submitting = false);
    }
  }

  void _skipCertificado() {
    setState(() => _step = 2);
  }

  void _completar() {
    widget.onRegistroCompleto();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.gradientPrimary),
        child: SafeArea(
          child: Column(
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back, color: Colors.white),
                      onPressed: () => Navigator.pop(context),
                    ),
                    const Expanded(
                      child: Text('Registro', textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(width: 48),
                  ],
                ),
              ),

              // Step indicator
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Row(
                  children: List.generate(3, (i) => Expanded(
                    child: Container(
                      height: 4,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        color: i <= _step ? AppColors.accent : Colors.white24,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  )),
                ),
              ),
              const SizedBox(height: 16),

              // Content
              Expanded(
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(24),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                  ),
                  child: SingleChildScrollView(
                    child: _step == 0
                        ? _buildDatosForm()
                        : _step == 1
                            ? _buildCertificadoStep()
                            : _buildConfirmacion(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDatosForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Datos de la empresa', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        const Text('Complete la información para registrar su empresa.',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
        const SizedBox(height: 20),

        if (_error != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.danger.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
          ),
          const SizedBox(height: 12),
        ],

        TextField(controller: _empresaNombre, decoration: const InputDecoration(labelText: 'Nombre de empresa')),
        const SizedBox(height: 12),
        TextField(controller: _rnc, decoration: const InputDecoration(labelText: 'RNC (9 u 11 dígitos)'), keyboardType: TextInputType.number, maxLength: 11),
        const SizedBox(height: 12),
        TextField(controller: _adminNombre, decoration: const InputDecoration(labelText: 'Nombre del administrador')),
        const SizedBox(height: 12),
        TextField(controller: _email, decoration: const InputDecoration(labelText: 'Correo electrónico'), keyboardType: TextInputType.emailAddress),
        const SizedBox(height: 12),
        TextField(controller: _password, decoration: const InputDecoration(labelText: 'Contraseña'), obscureText: true),
        const SizedBox(height: 12),
        TextField(controller: _confirmPassword, decoration: const InputDecoration(labelText: 'Confirmar contraseña'), obscureText: true),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: _submitting ? null : _registrar,
          child: _submitting
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Registrar empresa'),
        ),
      ],
    );
  }

  Widget _buildCertificadoStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Certificado Digital', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        const Text('Cargue su certificado .p12 para poder firmar facturas.',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
        const SizedBox(height: 32),
        const Icon(Icons.upload_file, size: 64, color: AppColors.primaryLight),
        const SizedBox(height: 16),
        const Text(
          'Por el momento, cargue el certificado desde el portal web para mayor seguridad.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: _skipCertificado,
          child: const Text('Continuar sin certificado'),
        ),
        const SizedBox(height: 12),
        TextButton(
          onPressed: _skipCertificado,
          child: const Text('Lo haré después desde el portal web'),
        ),
      ],
    );
  }

  Widget _buildConfirmacion() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const SizedBox(height: 32),
        Container(
          width: 72, height: 72,
          decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
          child: const Icon(Icons.check, color: Colors.white, size: 40),
        ),
        const SizedBox(height: 24),
        const Text('¡Registro completado!', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        const Text(
          'Su empresa ha sido registrada exitosamente. Ya puede comenzar a facturar.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
        ),
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: _completar,
          child: const Text('Ir al inicio'),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _empresaNombre.dispose();
    _rnc.dispose();
    _adminNombre.dispose();
    _email.dispose();
    _password.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }
}
