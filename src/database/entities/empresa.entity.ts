import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { EstadoEmpresa, ModoNcf } from '../enums.js';
import { Plan } from './plan.entity.js';
import { Usuario } from './usuario.entity.js';
import { ApiKey } from './api-key.entity.js';
import { FacturaElectronica } from './factura-electronica.entity.js';
import { CatalogoItem } from './catalogo-item.entity.js';
import { SecuenciaNcf } from './secuencia-ncf.entity.js';
import { UsoMensual } from './uso-mensual.entity.js';
import { Auditoria } from './auditoria.entity.js';
import { Webhook } from './webhook.entity.js';
import { RefreshToken } from './refresh-token.entity.js';

@Entity('empresas')
export class Empresa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  rnc!: string;

  @Column({ type: 'varchar' })
  nombre!: string;

  @Column({ type: 'bytea', nullable: true })
  certificado_encriptado!: Buffer | null;

  @Column({ type: 'bytea', nullable: true })
  salt_encriptacion!: Buffer | null;

  @Column({ type: 'bytea', nullable: true })
  auth_tag!: Buffer | null;

  @Column({ type: 'bytea', nullable: true })
  certificado_password_encrypted!: Buffer | null;

  @Column({ type: 'enum', enum: EstadoEmpresa, default: EstadoEmpresa.CERTIFICACION })
  estado!: EstadoEmpresa;

  @Column({ type: 'uuid', nullable: true })
  plan_id!: string | null;

  @ManyToOne(() => Plan, (plan) => plan.empresas, { nullable: true })
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan | null;

  @Column({ type: 'enum', enum: ModoNcf, default: ModoNcf.AUTOMATICO })
  modo_ncf!: ModoNcf;

  @Column({ type: 'varchar', length: 20, default: 'certificacion' })
  ambiente_dgii!: string; // 'certificacion' | 'produccion'

  @Column({ type: 'varchar', nullable: true })
  formato_pdf!: string | null;

  @Column({ type: 'boolean', default: true })
  validar_rnc_receptor!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  certificado_vence_en!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @OneToMany(() => Usuario, (usuario) => usuario.empresa)
  usuarios!: Usuario[];

  @OneToMany(() => ApiKey, (apiKey) => apiKey.empresa)
  api_keys!: ApiKey[];

  @OneToMany(() => FacturaElectronica, (factura) => factura.empresa)
  facturas!: FacturaElectronica[];

  @OneToMany(() => CatalogoItem, (item) => item.empresa)
  catalogo_items!: CatalogoItem[];

  @OneToMany(() => SecuenciaNcf, (secuencia) => secuencia.empresa)
  secuencias_ncf!: SecuenciaNcf[];

  @OneToMany(() => UsoMensual, (uso) => uso.empresa)
  uso_mensual!: UsoMensual[];

  @OneToMany(() => Auditoria, (auditoria) => auditoria.empresa)
  auditorias!: Auditoria[];

  @OneToMany(() => Webhook, (webhook) => webhook.empresa)
  webhooks!: Webhook[];

  @OneToMany(() => RefreshToken, (token) => token.empresa)
  refresh_tokens!: RefreshToken[];
}
