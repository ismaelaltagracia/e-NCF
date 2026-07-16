import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { EstadoDgii } from '../enums.js';
import { Empresa } from './empresa.entity.js';
import { Usuario } from './usuario.entity.js';
import { ApiKey } from './api-key.entity.js';

@Entity('facturas_electronicas')
@Check('chk_actor', '"usuario_id" IS NOT NULL OR "api_key_id" IS NOT NULL')
export class FacturaElectronica {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_facturas_empresa_id')
  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, (empresa) => empresa.facturas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'uuid', nullable: true })
  usuario_id!: string | null;

  @ManyToOne(() => Usuario, (usuario) => usuario.facturas, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario | null;

  @Column({ type: 'uuid', nullable: true })
  api_key_id!: string | null;

  @ManyToOne(() => ApiKey, (apiKey) => apiKey.facturas, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'api_key_id' })
  api_key!: ApiKey | null;

  @Column({ type: 'varchar', nullable: true })
  e_ncf!: string | null;

  @Column({ type: 'varchar', nullable: true })
  track_id!: string | null;

  @Index('idx_facturas_estado_dgii')
  @Column({ type: 'enum', enum: EstadoDgii, default: EstadoDgii.ENVIADO })
  estado_dgii!: EstadoDgii;

  @Column({ type: 'jsonb' })
  payload_json!: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  xml_s3_url!: string | null;

  @Column({ type: 'varchar', nullable: true })
  pdf_s3_url!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  error_dgii!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  rnc_validado!: boolean;

  @Column({ type: 'varchar', nullable: true })
  correlation_id!: string | null;

  @Index('idx_facturas_created_at')
  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
