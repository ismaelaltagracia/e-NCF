import { CreateFacturaSchema, RncSchema, FacturaItemSchema } from './factura.schemas';

describe('Factura Schemas', () => {
  /**
   * Helper para construir un payload válido de factura.
   */
  function validPayload(overrides: Record<string, unknown> = {}) {
    const items = [
      {
        descripcion: 'Servicio de consultoría',
        cantidad: 2,
        precio_unitario: 1000,
        tasa_itbis: 18,
      },
      {
        descripcion: 'Licencia software',
        cantidad: 1,
        precio_unitario: 500,
        tasa_itbis: 18,
      },
    ];

    // subtotal = 2*1000 + 1*500 = 2500
    // itbis = 2*1000*0.18 + 1*500*0.18 = 360 + 90 = 450
    // total = 2500 + 450 = 2950
    return {
      rnc_emisor: '123456789',
      rnc_receptor: '12345678901',
      items,
      subtotal: 2500,
      monto_itbis: 450,
      monto_total: 2950,
      tipo_comprobante: 'E31',
      ...overrides,
    };
  }

  describe('CreateFacturaSchema - payload válido', () => {
    it('debe aceptar un payload completo y válido', () => {
      const result = CreateFacturaSchema.safeParse(validPayload());
      expect(result.success).toBe(true);
    });

    it('debe aceptar payload sin e_ncf (campo opcional)', () => {
      const payload = validPayload();
      delete (payload as Record<string, unknown>).e_ncf;
      const result = CreateFacturaSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('debe aceptar payload con e_ncf válido', () => {
      const result = CreateFacturaSchema.safeParse(
        validPayload({ e_ncf: 'E310000000001' }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('RncSchema - validación de formato RNC', () => {
    it('debe aceptar RNC de 9 dígitos', () => {
      const result = RncSchema.safeParse('123456789');
      expect(result.success).toBe(true);
    });

    it('debe aceptar RNC de 11 dígitos', () => {
      const result = RncSchema.safeParse('12345678901');
      expect(result.success).toBe(true);
    });

    it('debe rechazar RNC con longitud incorrecta (8 dígitos)', () => {
      const result = RncSchema.safeParse('12345678');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('9 u 11');
      }
    });

    it('debe rechazar RNC con longitud incorrecta (10 dígitos)', () => {
      const result = RncSchema.safeParse('1234567890');
      expect(result.success).toBe(false);
    });

    it('debe rechazar RNC con caracteres no numéricos', () => {
      const result = RncSchema.safeParse('12345678A');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('dígitos numéricos');
      }
    });

    it('debe rechazar RNC con espacios', () => {
      const result = RncSchema.safeParse('123 45678');
      expect(result.success).toBe(false);
    });

    it('debe rechazar RNC con guiones', () => {
      const result = RncSchema.safeParse('123-456-789');
      expect(result.success).toBe(false);
    });
  });

  describe('CreateFacturaSchema - items vacíos', () => {
    it('debe rechazar un arreglo de items vacío', () => {
      const result = CreateFacturaSchema.safeParse(
        validPayload({ items: [], subtotal: 0, monto_itbis: 0, monto_total: 0 }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const itemsError = result.error.issues.find(
          (i) => i.path.join('.') === 'items',
        );
        expect(itemsError).toBeDefined();
        expect(itemsError!.message).toContain('al menos 1');
      }
    });
  });

  describe('FacturaItemSchema - validación de ítems', () => {
    it('debe rechazar ítem con cantidad <= 0', () => {
      const result = FacturaItemSchema.safeParse({
        descripcion: 'Producto A',
        cantidad: 0,
        precio_unitario: 100,
        tasa_itbis: 18,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('mayor a 0');
      }
    });

    it('debe rechazar ítem con cantidad negativa', () => {
      const result = FacturaItemSchema.safeParse({
        descripcion: 'Producto A',
        cantidad: -1,
        precio_unitario: 100,
        tasa_itbis: 18,
      });
      expect(result.success).toBe(false);
    });

    it('debe aceptar ítem con precio_unitario = 0', () => {
      const result = FacturaItemSchema.safeParse({
        descripcion: 'Cortesía',
        cantidad: 1,
        precio_unitario: 0,
        tasa_itbis: 0,
      });
      expect(result.success).toBe(true);
    });

    it('debe rechazar ítem con precio_unitario negativo', () => {
      const result = FacturaItemSchema.safeParse({
        descripcion: 'Producto A',
        cantidad: 1,
        precio_unitario: -50,
        tasa_itbis: 18,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('negativo');
      }
    });

    it('debe rechazar ítem con tasa_itbis inválida (15)', () => {
      const result = FacturaItemSchema.safeParse({
        descripcion: 'Producto A',
        cantidad: 1,
        precio_unitario: 100,
        tasa_itbis: 15,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('0, 16 o 18');
      }
    });

    it('debe aceptar tasa_itbis = 0', () => {
      const result = FacturaItemSchema.safeParse({
        descripcion: 'Producto exento',
        cantidad: 1,
        precio_unitario: 100,
        tasa_itbis: 0,
      });
      expect(result.success).toBe(true);
    });

    it('debe aceptar tasa_itbis = 16', () => {
      const result = FacturaItemSchema.safeParse({
        descripcion: 'Producto',
        cantidad: 1,
        precio_unitario: 100,
        tasa_itbis: 16,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CreateFacturaSchema - aritmética de montos', () => {
    it('debe rechazar cuando monto_total difiere de subtotal + monto_itbis más allá de 0.01', () => {
      const result = CreateFacturaSchema.safeParse(
        validPayload({ monto_total: 3000 }), // esperado 2950
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const totalError = result.error.issues.find(
          (i) => i.path.join('.') === 'monto_total',
        );
        expect(totalError).toBeDefined();
        expect(totalError!.message).toContain('no coincide');
      }
    });

    it('debe rechazar cuando subtotal no coincide con suma de ítems', () => {
      const result = CreateFacturaSchema.safeParse(
        validPayload({ subtotal: 9999, monto_total: 9999 + 450 }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const subtotalError = result.error.issues.find(
          (i) => i.path.join('.') === 'subtotal',
        );
        expect(subtotalError).toBeDefined();
      }
    });

    it('debe rechazar cuando monto_itbis no coincide con ITBIS calculado', () => {
      const result = CreateFacturaSchema.safeParse(
        validPayload({ monto_itbis: 999, monto_total: 2500 + 999 }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const itbisError = result.error.issues.find(
          (i) => i.path.join('.') === 'monto_itbis',
        );
        expect(itbisError).toBeDefined();
      }
    });

    it('debe aceptar cuando la diferencia aritmética está dentro de tolerancia 0.01', () => {
      // subtotal real = 2500, ponemos 2500.005 (well within 0.01 tolerance even with float imprecision)
      const result = CreateFacturaSchema.safeParse(
        validPayload({ subtotal: 2500.005, monto_total: 2950.005 }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('CreateFacturaSchema - e_ncf', () => {
    it('debe rechazar e_ncf con formato inválido (sin letra inicial)', () => {
      const result = CreateFacturaSchema.safeParse(
        validPayload({ e_ncf: '310000000001' }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const encfError = result.error.issues.find(
          (i) => i.path.includes('e_ncf'),
        );
        expect(encfError).toBeDefined();
        expect(encfError!.message).toContain('formato válido');
      }
    });

    it('debe rechazar e_ncf con longitud incorrecta', () => {
      const result = CreateFacturaSchema.safeParse(
        validPayload({ e_ncf: 'E31000' }),
      );
      expect(result.success).toBe(false);
    });

    it('debe rechazar e_ncf con letras minúsculas al inicio', () => {
      const result = CreateFacturaSchema.safeParse(
        validPayload({ e_ncf: 'e310000000001' }),
      );
      expect(result.success).toBe(false);
    });

    it('debe aceptar e_ncf ausente (opcional)', () => {
      const result = CreateFacturaSchema.safeParse(validPayload());
      expect(result.success).toBe(true);
    });
  });

  describe('CreateFacturaSchema - múltiples errores simultáneos', () => {
    it('debe retornar múltiples errores cuando varios campos son inválidos', () => {
      const result = CreateFacturaSchema.safeParse({
        rnc_emisor: 'ABC',
        rnc_receptor: '123',
        items: [],
        subtotal: -1,
        monto_itbis: -1,
        monto_total: -1,
        tipo_comprobante: 'INVALIDO',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        // Debe tener errores en múltiples campos
        expect(result.error.issues.length).toBeGreaterThan(2);

        const paths = result.error.issues.map((i) => i.path.join('.'));
        // Verificar que hay errores en diferentes campos
        expect(paths.some((p) => p.includes('rnc_emisor'))).toBe(true);
        expect(paths.some((p) => p.includes('rnc_receptor'))).toBe(true);
        expect(paths.some((p) => p === 'items')).toBe(true);
      }
    });
  });
});
