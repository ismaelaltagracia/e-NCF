import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Empresa } from './empresa.entity.js';

@Entity('secuencias_ncf')
@Unique('uq_secuencia_empresa_tipo_prefijo_ambiente', ['empresa_id', 'tipo_comprobante', 'prefijo', 'ambiente'])
export class SecuenciaNcf {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, (empresa) => empresa.secuencias_ncf, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'varchar' })
  tipo_comprobante!: string;

  @Column({ type: 'varchar' })
  prefijo!: string;

  @Column({ type: 'bigint' })
  numero_inicio!: string;

  @Column({ type: 'bigint' })
  numero_fin!: string;

  @Column({ type: 'bigint' })
  numero_actual!: string;

  @Column({ type: 'varchar', length: 20, default: 'certificacion' })
  ambiente!: string; // 'certificacion' | 'produccion'

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
