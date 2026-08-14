import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contador } from '../../database/entities/contador.entity.js';
import { ContadorEmpresa } from '../../database/entities/contador-empresa.entity.js';
import {
  FacturaContador,
  EstadoFacturaContador,
} from '../../database/entities/factura-contador.entity.js';
import { ContadorService } from './contador.service.js';
import { EMAIL_SERVICE } from '../../infrastructure/email/email.interface.js';
import type { IEmailService } from '../../infrastructure/email/email.interface.js';

/**
 * Cron que genera facturas mensuales a contadores y suspende por impago.
 */
@Injectable()
export class ContadorCronService {
  private readonly logger = new Logger(ContadorCronService.name);

  constructor(
    @InjectRepository(Contador)
    private readonly contadorRepo: Repository<Contador>,
    @InjectRepository(ContadorEmpresa)
    private readonly contadorEmpresaRepo: Repository<ContadorEmpresa>,
    @InjectRepository(FacturaContador)
    private readonly facturaRepo: Repository<FacturaContador>,
    private readonly contadorService: ContadorService,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: IEmailService,
  ) {}

  /**
   * Día 1 de cada mes a las 3:00 AM — genera facturas.
   */
  @Cron('0 3 1 * *')
  async generarFacturasMensuales() {
    this.logger.log('Iniciando generación de facturas mensuales de contadores');

    const contadores = await this.contadorRepo.find({ where: { activo: true } });
    let generadas = 0;

    const ahora = new Date();
    const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    const periodo = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`;

    for (const contador of contadores) {
      // Skip if already generated for this period
      const existente = await this.facturaRepo.findOne({
        where: { contador_id: contador.id, periodo },
      });
      if (existente) continue;

      const factura = await this.contadorService.generarFacturaMensual(
        contador.id,
        periodo,
      );
      if (factura) {
        generadas++;
        // Send email notification
        await this.enviarEmailFactura(contador, factura);
      }
    }

    this.logger.log(`Facturas de contadores generadas: ${generadas}/${contadores.length}`);
  }

  /**
   * Día 6 de cada mes a las 8:00 AM — suspende por impago (5 días de gracia).
   */
  @Cron('0 8 6 * *')
  async suspenderPorImpago() {
    this.logger.log('Verificando facturas vencidas de contadores');

    const pendientes = await this.facturaRepo.find({
      where: { estado: EstadoFacturaContador.PENDIENTE },
      relations: ['contador'],
    });

    let suspendidas = 0;

    for (const factura of pendientes) {
      // Si tiene más de 5 días desde created_at → vencida
      const diasDesdeEmision = Math.floor(
        (Date.now() - factura.created_at.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diasDesdeEmision >= 5) {
        factura.estado = EstadoFacturaContador.VENCIDA;
        await this.facturaRepo.save(factura);

        // Desactivar empresas del contador
        await this.contadorEmpresaRepo.update(
          { contador_id: factura.contador_id, activo: true },
          { activo: false },
        );

        suspendidas++;
        this.logger.warn(
          `Contador ${factura.contador_id} suspendido por impago (factura ${factura.id})`,
        );
      }
    }

    if (suspendidas > 0) {
      this.logger.warn(`Contadores suspendidos por impago: ${suspendidas}`);
    }
  }

  private async enviarEmailFactura(contador: Contador, factura: FacturaContador) {
    try {
      const detalleHtml = factura.detalle.map((d) =>
        `<tr><td>${d.empresa_nombre}</td><td>${d.plan_nombre}</td><td style="text-align:right">RD$ ${d.precio_final.toFixed(2)}</td></tr>`
      ).join('');

      await this.emailService.send({
        to: contador.email_facturacion,
        subject: `Factura mensual e-NCF — ${factura.periodo}`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:2rem;">
            <h2 style="color:#0f1b2d;">Factura mensual</h2>
            <p>Hola ${contador.nombre_firma},</p>
            <p>Su factura del período <strong>${factura.periodo}</strong> ha sido generada:</p>
            <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
              <thead><tr style="background:#f9fafb;"><th style="padding:0.5rem;text-align:left;">Empresa</th><th style="padding:0.5rem;text-align:left;">Plan</th><th style="padding:0.5rem;text-align:right;">Monto</th></tr></thead>
              <tbody>${detalleHtml}</tbody>
            </table>
            <p style="font-size:1.1rem;font-weight:700;">Total: RD$ ${Number(factura.total).toFixed(2)}</p>
            ${Number(factura.descuento) > 0 ? `<p style="color:#059669;">Ahorro por descuento: RD$ ${Number(factura.descuento).toFixed(2)}</p>` : ''}
            <p style="color:#6b7280;font-size:0.85rem;">Tiene 5 días para realizar el pago. Después de ese plazo las empresas serán suspendidas.</p>
            <hr style="margin:1.5rem 0;border:none;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:0.75rem;">Este correo fue generado automáticamente por e-NCF.</p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.warn(`No se pudo enviar email de factura al contador ${contador.id}: ${err}`);
    }
  }
}
