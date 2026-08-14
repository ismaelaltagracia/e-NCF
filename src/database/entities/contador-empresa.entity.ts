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
import { Empresa } from './empresa.entity.js';
import { Plan } from './plan.entity.js';

@Entity('contador_empresas')
export class ContadorEmpresa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_contador_empresas_contador')
  @Column({ type: 'uuid' })
  contador_id!: string;

  @ManyToOne(() => Contador, (c) => c.empresas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contador_id' })
  contador!: Contador;

  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'uuid' })
  plan_id!: string;

  @ManyToOne(() => Plan)
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'date' })
  fecha_alta!: string;

  @Column({ type: 'date', nullable: true })
  fecha_baja!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
