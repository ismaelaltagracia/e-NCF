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
import { Usuario } from './usuario.entity.js';
import { ApiKey } from './api-key.entity.js';

@Entity('auditoria')
@Index('idx_auditoria_empresa_created', ['empresa_id', 'created_at'])
export class Auditoria {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  empresa_id!: string | null;

  @ManyToOne(() => Empresa, (empresa) => empresa.auditorias, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa | null;

  @Column({ type: 'uuid', nullable: true })
  usuario_id!: string | null;

  @ManyToOne(() => Usuario, (usuario) => usuario.auditorias, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario | null;

  @Column({ type: 'uuid', nullable: true })
  api_key_id!: string | null;

  @ManyToOne(() => ApiKey, (apiKey) => apiKey.auditorias, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'api_key_id' })
  api_key!: ApiKey | null;

  @Column({ type: 'varchar' })
  accion!: string;

  @Column({ type: 'varchar' })
  recurso_tipo!: string;

  @Column({ type: 'uuid', nullable: true })
  recurso_id!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  datos_anteriores!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  datos_nuevos!: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  ip_origen!: string | null;

  @Column({ type: 'uuid', nullable: true })
  correlation_id!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
