import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Empresa } from './empresa.entity.js';

@Entity('planes')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  nombre!: string;

  @Column({ type: 'integer', nullable: true })
  limite_facturas_mensual!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precio!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'boolean', default: false })
  permite_api!: boolean;

  @Column({ type: 'integer', default: 0 })
  max_dispositivos!: number; // 0 = no incluye Print Bridge

  @Column({ type: 'integer', default: 1 })
  max_api_keys!: number; // máximo de API Keys activas

  @Column({ type: 'integer', nullable: true })
  rate_limit_por_minuto!: number | null; // null = sin límite custom (usa default)

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @OneToMany(() => Empresa, (empresa) => empresa.plan)
  empresas!: Empresa[];
}
