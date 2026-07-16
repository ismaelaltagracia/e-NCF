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

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @OneToMany(() => Empresa, (empresa) => empresa.plan)
  empresas!: Empresa[];
}
