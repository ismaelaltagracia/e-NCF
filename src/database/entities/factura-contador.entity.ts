import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contador } from './contador.entity.js';

export enum EstadoFacturaContador {
  PENDIENTE = 'pendiente',
  PAGADA = 'pagada',
  VENCIDA = 'vencida',
}

@Entity('facturas_contador')
export class FacturaContador {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_facturas_contador_id')
  @Column({ type: 'uuid' })
  contador_id!: string;

  @ManyToOne(() => Contador, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contador_id' })
  contador!: Contador;

  @Column({ type: 'varchar', length: 7 })
  periodo!: string; // "2026-08"

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  descuento!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;

  @Column({
    type: 'enum',
    enum: EstadoFacturaContador,
    default: EstadoFacturaContador.PENDIENTE,
  })
  estado!: EstadoFacturaContador;

  @Column({ type: 'jsonb' })
  detalle!: Array<{
    empresa_id: string;
    empresa_nombre: string;
    plan_nombre: string;
    precio_base: number;
    descuento_aplicado: boolean;
    precio_final: number;
  }>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  pagada_en!: Date | null;
}
