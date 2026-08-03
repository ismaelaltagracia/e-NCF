import 'package:flutter/material.dart';

class AppColors {
  static const primary = Color(0xFF0F1B2D);
  static const primaryLight = Color(0xFF1A3A5C);
  static const accent = Color(0xFF64B5F6);
  static const background = Color(0xFFF5F7FA);
  static const surface = Color(0xFFFFFFFF);
  static const textPrimary = Color(0xFF1F2937);
  static const textSecondary = Color(0xFF6B7280);
  static const border = Color(0xFFD1D9E6);
  static const success = Color(0xFF059669);
  static const warning = Color(0xFFD97706);
  static const danger = Color(0xFFDC2626);

  static const gradientPrimary = LinearGradient(
    colors: [primary, primaryLight],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}
