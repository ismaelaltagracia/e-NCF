import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Empresa } from './empresa.entity.js';

export enum EstadoAprobacion {
  PENDIENTE = 'pendiente',
  APROBADA = 'aprobada',
  RECHAZADA = 'rechazada',
}

@Entity('facturas_recibidas')
export class FacturaRecibida {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_facturas_recibidas_empresa_id')
  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'varchar' })
  rnc_emisor!: string;

  @Column({ type: 'varchar' })
  nombre_emisor!: string;

  @Column({ type: 'varchar' })
  e_ncf!: string;

  @Column({ type: 'date' })
  fecha_emision!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  monto_total!: number;

  @Index('idx_facturas_recibidas_estado')
  @Column({ type: 'enum', enum: EstadoAprobacion, default: EstadoAprobacion.PENDIENTE })
  estado_aprobacion!: EstadoAprobacion;

  @Column({ type: 'varchar', nullable: true })
  motivo_rechazo!: string | null;

  @Column({ type: 'varchar', nullable: true })
  track_id_aprobacion!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'certificacion' })
  ambiente!: string; // 'certificacion' | 'produccion'

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
