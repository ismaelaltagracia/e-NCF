import 'package:flutter_test/flutter_test.dart';
import 'package:encf_mobile/app.dart';

void main() {
  testWidgets('App renders', (WidgetTester tester) async {
    await tester.pumpWidget(const EncfApp());
    expect(find.byType(EncfApp), findsOneWidget);
  });
}
