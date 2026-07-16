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

@Entity('uso_mensual')
@Unique('uq_uso_empresa_periodo', ['empresa_id', 'anio', 'mes'])
export class UsoMensual {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, (empresa) => empresa.uso_mensual, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'integer' })
  anio!: number;

  @Column({ type: 'integer' })
  mes!: number;

  @Column({ type: 'integer', default: 0 })
  facturas_generadas!: number;

  @Column({ type: 'integer', nullable: true })
  limite_aplicado!: number | null;

  @Column({ type: 'varchar' })
  plan_nombre!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
