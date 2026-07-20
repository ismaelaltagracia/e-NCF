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
import { RolUsuario } from '../enums.js';
import { Empresa } from './empresa.entity.js';
import { FacturaElectronica } from './factura-electronica.entity.js';
import { RefreshToken } from './refresh-token.entity.js';
import { Auditoria } from './auditoria.entity.js';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, (empresa) => empresa.usuarios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'varchar' })
  nombre!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar' })
  password_hash!: string;

  @Column({ type: 'enum', enum: RolUsuario, default: RolUsuario.LECTOR })
  rol!: RolUsuario;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'uuid', nullable: true })
  created_by_user_id!: string | null;

  @Column({ type: 'integer', default: 0 })
  intentos_fallidos!: number;

  @Column({ type: 'timestamptz', nullable: true })
  primer_intento_fallido!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  bloqueado_hasta!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @OneToMany(() => FacturaElectronica, (factura) => factura.usuario)
  facturas!: FacturaElectronica[];

  @OneToMany(() => RefreshToken, (token) => token.usuario)
  refresh_tokens!: RefreshToken[];

  @OneToMany(() => Auditoria, (auditoria) => auditoria.usuario)
  auditorias!: Auditoria[];
}
