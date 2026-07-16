import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Empresa } from './empresa.entity.js';

@Entity('webhooks')
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, (empresa) => empresa.webhooks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'varchar' })
  url!: string;

  @Column({ type: 'jsonb', default: [] })
  eventos!: string[];

  @Column({ type: 'varchar' })
  secret!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'integer', default: 0 })
  fallos_consecutivos!: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_delivery_at!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  last_delivery_status!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
