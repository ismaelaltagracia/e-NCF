import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TipoCatalogo } from '../enums.js';
import { Empresa } from './empresa.entity.js';

@Entity('catalogo_items')
@Index('idx_catalogo_empresa_activo', ['empresa_id', 'activo'])
export class CatalogoItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, (empresa) => empresa.catalogo_items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'enum', enum: TipoCatalogo })
  tipo!: TipoCatalogo;

  @Column({ type: 'varchar' })
  codigo!: string;

  @Column({ type: 'varchar' })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  precio_unitario!: string;

  @Column({ type: 'integer' })
  tasa_itbis!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
