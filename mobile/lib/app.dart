import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';
import 'core/network/api_client.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/dashboard/presentation/dashboard_screen.dart';
import 'features/facturas/presentation/facturas_list_screen.dart';
import 'features/recibidas/presentation/recibidas_screen.dart';
import 'features/reportes/presentation/reportes_screen.dart';
import 'features/catalogo/presentation/catalogo_screen.dart';
import 'features/configuracion/presentation/configuracion_screen.dart';

class EncfApp extends StatefulWidget {
  const EncfApp({super.key});

  @override
  State<EncfApp> createState() => _EncfAppState();
}

class _EncfAppState extends State<EncfApp> {
  final _apiClient = ApiClient();
  bool _authenticated = false;
  bool _checking = true;
  int _currentTab = 0;

  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final isAuth = await _apiClient.isAuthenticated();
    setState(() {
      _authenticated = isAuth;
      _checking = false;
    });
  }

  void _onLoginSuccess() {
    setState(() => _authenticated = true);
  }

  Future<void> _logout() async {
    await _apiClient.clearTokens();
    setState(() {
      _authenticated = false;
      _currentTab = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'e-NCF',
      theme: AppTheme.light,
      debugShowCheckedModeBanner: false,
      home: _checking
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : _authenticated
              ? _buildMainApp()
              : LoginScreen(
                  apiClient: _apiClient,
                  onLoginSuccess: _onLoginSuccess,
                ),
    );
  }

  Widget _buildMainApp() {
    final screens = [
      DashboardScreen(apiClient: _apiClient),
      FacturasListScreen(apiClient: _apiClient),
      RecibidasScreen(apiClient: _apiClient),
      ReportesScreen(apiClient: _apiClient),
      _MoreScreen(onLogout: _logout, apiClient: _apiClient),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(_getTitle()),
      ),
      body: screens[_currentTab],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentTab,
        onTap: (i) => setState(() => _currentTab = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home), label: 'Inicio'),
          BottomNavigationBarItem(icon: Icon(Icons.receipt_long_outlined), activeIcon: Icon(Icons.receipt_long), label: 'Facturas'),
          BottomNavigationBarItem(icon: Icon(Icons.inbox_outlined), activeIcon: Icon(Icons.inbox), label: 'Recibidas'),
          BottomNavigationBarItem(icon: Icon(Icons.bar_chart_outlined), activeIcon: Icon(Icons.bar_chart), label: 'Reportes'),
          BottomNavigationBarItem(icon: Icon(Icons.more_horiz), activeIcon: Icon(Icons.more_horiz), label: 'Más'),
        ],
      ),
    );
  }

  String _getTitle() {
    switch (_currentTab) {
      case 0: return 'Inicio';
      case 1: return 'Facturas';
      case 2: return 'Recibidas';
      case 3: return 'Reportes';
      case 4: return 'Configuración';
      default: return 'e-NCF';
    }
  }
}

class _MoreScreen extends StatelessWidget {
  final VoidCallback onLogout;
  final ApiClient apiClient;
  const _MoreScreen({required this.onLogout, required this.apiClient});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ListTile(
          leading: const Icon(Icons.inventory_2_outlined),
          title: const Text('Catálogo'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.push(context, MaterialPageRoute(
            builder: (_) => CatalogoScreen(apiClient: apiClient),
          )),
        ),
        ListTile(
          leading: const Icon(Icons.settings_outlined),
          title: const Text('Configuración'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.push(context, MaterialPageRoute(
            builder: (_) => ConfiguracionScreen(apiClient: apiClient),
          )),
        ),
        ListTile(
          leading: const Icon(Icons.card_membership_outlined),
          title: const Text('Mi Plan'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () {},
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout, color: Colors.red),
          title: const Text('Cerrar Sesión', style: TextStyle(color: Colors.red)),
          onTap: onLogout,
        ),
      ],
    );
  }
}
