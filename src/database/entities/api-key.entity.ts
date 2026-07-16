import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Empresa } from './empresa.entity.js';
import { FacturaElectronica } from './factura-electronica.entity.js';
import { Auditoria } from './auditoria.entity.js';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, (empresa) => empresa.api_keys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'varchar' })
  nombre!: string;

  @Index('idx_api_keys_hash')
  @Column({ type: 'varchar' })
  key_hash!: string;

  @Column({ type: 'jsonb', default: [] })
  scopes!: string[];

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  last_used_at!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @OneToMany(() => FacturaElectronica, (factura) => factura.api_key)
  facturas!: FacturaElectronica[];

  @OneToMany(() => Auditoria, (auditoria) => auditoria.api_key)
  auditorias!: Auditoria[];
}
