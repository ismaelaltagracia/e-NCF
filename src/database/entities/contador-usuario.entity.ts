import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Contador } from './contador.entity.js';
import { Usuario } from './usuario.entity.js';
import { Empresa } from './empresa.entity.js';

/**
 * Relación entre usuarios del equipo del contador y las empresas que pueden gestionar.
 * Un usuario puede tener acceso a N empresas del contador.
 */
@Entity('contador_usuarios')
@Unique('uq_contador_usuario_empresa', ['contador_id', 'usuario_id', 'empresa_id'])
export class ContadorUsuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_contador_usuarios_contador')
  @Column({ type: 'uuid' })
  contador_id!: string;

  @ManyToOne(() => Contador, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contador_id' })
  contador!: Contador;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column({ type: 'uuid' })
  empresa_id!: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'varchar', default: 'facturador' })
  rol!: string; // admin | facturador | lector

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
