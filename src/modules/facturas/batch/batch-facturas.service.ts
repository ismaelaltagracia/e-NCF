import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { FacturasService } from '../facturas.service.js';
import type { RequestContext } from '../../../common/interfaces/request-context.interface.js';

/**
 * Columnas requeridas en el archivo de carga masiva.
 * - factura: identificador de agrupamiento (qué filas pertenecen a la misma factura)
 * - tipo_comprobante: opcional, default E31
 */
const REQUIRED_COLUMNS = [
  'factura',
  'rnc_receptor',
  'nombre_receptor',
  'descripcion',
  'cantidad',
  'precio_unitario',
  'tasa_itbis',
];

const VALID_TIPOS = ['E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45', 'E46'];
const DEFAULT_TIPO = 'E31';

export interface BatchRowValidation {
  fila: number;
  valido: boolean;
  errores: string[];
  datos?: {
    factura: string;
    rnc_receptor: string;
    nombre_receptor: string;
    tipo_comprobante: string;
    e_ncf: string;
    descuento: number;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    tasa_itbis: number;
  };
}

export interface BatchValidationResult {
  total_filas: number;
  filas_validas: number;
  filas_con_errores: number;
  facturas_detectadas: number;
  columnas_detectadas: string[];
  columnas_faltantes: string[];
  estructura_valida: boolean;
  detalle: BatchRowValidation[];
}

export interface BatchEmisionResult {
  total: number;
  exitosas: number;
  fallidas: number;
  resultados: Array<{
    factura: string;
    exito: boolean;
    id?: string;
    e_ncf?: string;
    error?: string;
  }>;
}

@Injectable()
export class BatchFacturasService {
  private readonly logger = new Logger(BatchFacturasService.name);

  constructor(private readonly facturasService: FacturasService) {}

  /**
   * Valida la estructura y contenido de un archivo Excel/CSV para carga masiva.
   * No emite facturas — solo valida y retorna preview.
   */
  async validarArchivo(buffer: Buffer, filename: string): Promise<BatchValidationResult> {
    const rows = await this.parseFile(buffer, filename);

    if (rows.length === 0) {
      throw new BadRequestException('El archivo está vacío o no contiene datos.');
    }

    // Check column structure
    const headers = Object.keys(rows[0]).map((h) => h.toLowerCase().trim());
    const columnasFaltantes = REQUIRED_COLUMNS.filter(
      (col) => !headers.includes(col),
    );

    if (columnasFaltantes.length > 0) {
      return {
        total_filas: rows.length,
        filas_validas: 0,
        filas_con_errores: rows.length,
        facturas_detectadas: 0,
        columnas_detectadas: headers,
        columnas_faltantes: columnasFaltantes,
        estructura_valida: false,
        detalle: [],
      };
    }

    // Validate each row
    const detalle: BatchRowValidation[] = rows.map((row, idx) => {
      return this.validarFila(row, idx + 2); // +2: row 1 is headers, data starts at 2
    });

    const filasValidas = detalle.filter((d) => d.valido).length;

    // Count unique factura groups
    const gruposUnicos = new Set(
      detalle.filter((d) => d.valido && d.datos).map((d) => d.datos!.factura),
    );

    return {
      total_filas: rows.length,
      filas_validas: filasValidas,
      filas_con_errores: rows.length - filasValidas,
      facturas_detectadas: gruposUnicos.size,
      columnas_detectadas: headers,
      columnas_faltantes: [],
      estructura_valida: true,
      detalle,
    };
  }

  /**
   * Emite facturas en lote a partir de filas ya validadas.
   * Agrupa por la columna "factura" — todas las filas con el mismo valor
   * de "factura" se convierten en una sola factura con múltiples ítems.
   */
  async emitirLote(
    buffer: Buffer,
    filename: string,
    user: RequestContext,
    correlationId: string,
  ): Promise<BatchEmisionResult> {
    const validation = await this.validarArchivo(buffer, filename);

    if (!validation.estructura_valida) {
      throw new BadRequestException(
        `Estructura inválida. Columnas faltantes: ${validation.columnas_faltantes.join(', ')}`,
      );
    }

    if (validation.filas_validas === 0) {
      throw new BadRequestException('No hay filas válidas para emitir.');
    }

    // Group by "factura" column
    const facturas = this.agruparPorFactura(validation.detalle.filter((d) => d.valido));

    const resultados: BatchEmisionResult['resultados'] = [];
    let exitosas = 0;
    let fallidas = 0;

    for (const factura of facturas) {
      try {
        const dto: any = {
          rnc_receptor: factura.rnc_receptor,
          nombre_receptor: factura.nombre_receptor,
          tipo_comprobante: factura.tipo_comprobante as any,
          items: factura.items.map((item) => ({
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            tasa_itbis: item.tasa_itbis,
          })),
        };

        // If e_ncf is provided in the file, pass it (manual mode)
        if (factura.e_ncf) {
          dto.e_ncf = factura.e_ncf;
        }

        // If descuento is provided, apply it
        if (factura.descuento > 0) {
          dto.descuento_global = factura.descuento;
        }

        const result = await this.facturasService.crearFactura(
          dto,
          user,
          `${correlationId}-batch-${factura.factura_id}`,
        );

        resultados.push({
          factura: factura.factura_id,
          exito: true,
          id: result.id,
          e_ncf: result.e_ncf ?? undefined,
        });
        exitosas++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        resultados.push({
          factura: factura.factura_id,
          exito: false,
          error: msg,
        });
        fallidas++;
      }
    }

    this.logger.log(
      `Batch completado: ${exitosas} exitosas, ${fallidas} fallidas de ${facturas.length} facturas`,
    );

    return {
      total: facturas.length,
      exitosas,
      fallidas,
      resultados,
    };
  }

  /**
   * Genera un archivo Excel de plantilla con las columnas requeridas.
   */
  async generarPlantilla(): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Facturas');

    sheet.columns = [
      { header: 'factura', key: 'factura', width: 10 },
      { header: 'rnc_receptor', key: 'rnc_receptor', width: 15 },
      { header: 'nombre_receptor', key: 'nombre_receptor', width: 30 },
      { header: 'tipo_comprobante', key: 'tipo_comprobante', width: 18 },
      { header: 'e_ncf', key: 'e_ncf', width: 18 },
      { header: 'descuento', key: 'descuento', width: 12 },
      { header: 'descripcion', key: 'descripcion', width: 35 },
      { header: 'cantidad', key: 'cantidad', width: 10 },
      { header: 'precio_unitario', key: 'precio_unitario', width: 15 },
      { header: 'tasa_itbis', key: 'tasa_itbis', width: 12 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A3A5C' },
    };

    // Example: Factura 1 - two items to same company (auto NCF)
    sheet.addRow({
      factura: '1',
      rnc_receptor: '123456789',
      nombre_receptor: 'Empresa Ejemplo SRL',
      tipo_comprobante: 'E31',
      e_ncf: '',
      descripcion: 'Servicio de consultoría',
      cantidad: 1,
      precio_unitario: 5000,
      tasa_itbis: 18,
    });
    sheet.addRow({
      factura: '1',
      rnc_receptor: '123456789',
      nombre_receptor: 'Empresa Ejemplo SRL',
      tipo_comprobante: '',
      e_ncf: '',
      descripcion: 'Licencia de software anual',
      cantidad: 2,
      precio_unitario: 2500,
      tasa_itbis: 18,
    });

    // Example: Factura 2 - another invoice to same company (auto NCF)
    sheet.addRow({
      factura: '2',
      rnc_receptor: '123456789',
      nombre_receptor: 'Empresa Ejemplo SRL',
      tipo_comprobante: '',
      e_ncf: '',
      descripcion: 'Mantenimiento mensual febrero',
      cantidad: 1,
      precio_unitario: 3000,
      tasa_itbis: 18,
    });

    // Example: Factura 3 - with manual NCF
    sheet.addRow({
      factura: '3',
      rnc_receptor: '98765432101',
      nombre_receptor: 'Otra Empresa SA',
      tipo_comprobante: 'E32',
      e_ncf: 'E320010100001',
      descripcion: 'Venta de producto al detalle',
      cantidad: 10,
      precio_unitario: 150,
      tasa_itbis: 18,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ─── Private helpers ───

  private async parseFile(
    buffer: Buffer,
    filename: string,
  ): Promise<Record<string, string>[]> {
    const ext = filename.toLowerCase().split('.').pop();

    if (ext === 'xlsx' || ext === 'xls') {
      return this.parseExcel(buffer);
    } else if (ext === 'csv') {
      return this.parseCsv(buffer);
    }

    throw new BadRequestException(
      'Formato no soportado. Use archivos .xlsx, .xls o .csv',
    );
  }

  private async parseExcel(buffer: Buffer): Promise<Record<string, string>[]> {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
      return [];
    }

    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value || '').toLowerCase().trim();
    });

    const rows: Record<string, string>[] = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const record: Record<string, string> = {};
      let hasData = false;

      headers.forEach((header, idx) => {
        const cell = row.getCell(idx + 1);
        const value = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : '';
        record[header] = value;
        if (value) hasData = true;
      });

      if (hasData) rows.push(record);
    }

    return rows;
  }

  private parseCsv(buffer: Buffer): Record<string, string>[] {
    const content = buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());

    if (lines.length < 2) return [];

    const separator = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(separator).map((h) => h.toLowerCase().trim().replace(/"/g, ''));

    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(separator).map((v) => v.trim().replace(/"/g, ''));
      const record: Record<string, string> = {};
      let hasData = false;

      headers.forEach((header, idx) => {
        record[header] = values[idx] || '';
        if (values[idx]) hasData = true;
      });

      if (hasData) rows.push(record);
    }

    return rows;
  }

  private validarFila(row: Record<string, string>, fila: number): BatchRowValidation {
    const errores: string[] = [];

    const facturaId = (row['factura'] || '').trim();
    if (!facturaId) {
      errores.push('factura (identificador de grupo) es requerido');
    }

    const rnc = (row['rnc_receptor'] || '').trim();
    if (!rnc) {
      errores.push('rnc_receptor es requerido');
    } else if (!/^\d{9}$|^\d{11}$/.test(rnc)) {
      errores.push('rnc_receptor debe tener 9 u 11 dígitos numéricos');
    }

    const nombre = (row['nombre_receptor'] || '').trim();
    if (!nombre) {
      errores.push('nombre_receptor es requerido');
    }

    // tipo_comprobante is optional — default E31
    let tipo = (row['tipo_comprobante'] || '').trim().toUpperCase();
    if (!tipo) {
      tipo = DEFAULT_TIPO;
    } else if (!VALID_TIPOS.includes(tipo)) {
      errores.push(`tipo_comprobante debe ser uno de: ${VALID_TIPOS.join(', ')} (o dejarlo vacío para E31)`);
    }

    // e_ncf is optional — if provided, validate format
    const eNcf = (row['e_ncf'] || '').trim();
    if (eNcf && !/^[A-Z]\d{12}$/.test(eNcf)) {
      errores.push('e_ncf debe tener formato válido: 1 letra + 12 dígitos (ej: E310000000001). Déjelo vacío para asignación automática.');
    }

    // descuento is optional (0-100 percentage applied to the invoice total)
    const descuentoRaw = (row['descuento'] || '').trim();
    let descuento = 0;
    if (descuentoRaw) {
      descuento = parseFloat(descuentoRaw);
      if (isNaN(descuento) || descuento < 0 || descuento > 100) {
        errores.push('descuento debe ser un número entre 0 y 100 (porcentaje)');
        descuento = 0;
      }
    }

    const descripcion = (row['descripcion'] || '').trim();
    if (!descripcion) {
      errores.push('descripcion es requerida');
    }

    const cantidad = parseFloat(row['cantidad'] || '0');
    if (isNaN(cantidad) || cantidad <= 0) {
      errores.push('cantidad debe ser un número mayor a 0');
    }

    const precio = parseFloat(row['precio_unitario'] || '0');
    if (isNaN(precio) || precio < 0) {
      errores.push('precio_unitario debe ser un número >= 0');
    }

    const itbis = parseFloat(row['tasa_itbis'] || '0');
    if (isNaN(itbis) || ![0, 16, 18].includes(itbis)) {
      errores.push('tasa_itbis debe ser 0, 16 o 18');
    }

    return {
      fila,
      valido: errores.length === 0,
      errores,
      datos: errores.length === 0
        ? {
            factura: facturaId,
            rnc_receptor: rnc,
            nombre_receptor: nombre,
            tipo_comprobante: tipo,
            e_ncf: eNcf,
            descuento,
            descripcion,
            cantidad,
            precio_unitario: precio,
            tasa_itbis: itbis,
          }
        : undefined,
    };
  }

  /**
   * Agrupa filas por el campo "factura".
   * Todas las filas con el mismo valor de "factura" se convierten
   * en una sola factura con múltiples ítems.
   * El tipo_comprobante se toma de la primera fila del grupo.
   */
  private agruparPorFactura(
    filas: BatchRowValidation[],
  ): Array<{
    factura_id: string;
    rnc_receptor: string;
    nombre_receptor: string;
    tipo_comprobante: string;
    e_ncf: string;
    descuento: number;
    items: Array<{ descripcion: string; cantidad: number; precio_unitario: number; tasa_itbis: number }>;
  }> {
    const grupos = new Map<string, {
      factura_id: string;
      rnc_receptor: string;
      nombre_receptor: string;
      tipo_comprobante: string;
      e_ncf: string;
      descuento: number;
      items: Array<{ descripcion: string; cantidad: number; precio_unitario: number; tasa_itbis: number }>;
    }>();

    for (const fila of filas) {
      if (!fila.datos) continue;
      const { factura, rnc_receptor, nombre_receptor, tipo_comprobante, e_ncf, descuento, descripcion, cantidad, precio_unitario, tasa_itbis } = fila.datos;

      if (!grupos.has(factura)) {
        grupos.set(factura, {
          factura_id: factura,
          rnc_receptor,
          nombre_receptor,
          tipo_comprobante,
          e_ncf,
          descuento,
          items: [],
        });
      }

      grupos.get(factura)!.items.push({ descripcion, cantidad, precio_unitario, tasa_itbis });
    }

    return Array.from(grupos.values());
  }
}
