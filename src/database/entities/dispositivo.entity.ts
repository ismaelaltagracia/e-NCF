import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Empresa } from './empresa.entity.js';

/**
 * Dispositivo registrado del Print Bridge.
 * Controla cuántas PCs pueden usar el puente de impresión por empresa.
 */
@Entity('dispositivos')
@Unique('uq_dispositivo_empresa_machine', ['empresa_id', 'machine_id'])
export class Dispositivo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_dispositivos_empresa_id')
  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'varchar' })
  machine_id!: string; // Hash de hardware (MAC + disco + hostname)

  @Column({ type: 'varchar' })
  nombre_equipo!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  ultima_actividad!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
