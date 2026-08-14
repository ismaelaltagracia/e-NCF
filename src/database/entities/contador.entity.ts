import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Usuario } from './usuario.entity.js';
import { ContadorEmpresa } from './contador-empresa.entity.js';

@Entity('contadores')
export class Contador {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  usuario_id!: string;

  @OneToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column({ type: 'varchar' })
  nombre_firma!: string;

  @Column({ type: 'varchar', nullable: true })
  rnc_firma!: string | null;

  @Column({ type: 'varchar', nullable: true })
  exequatur!: string | null;

  @Column({ type: 'varchar' })
  email_facturacion!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @OneToMany(() => ContadorEmpresa, (ce) => ce.contador)
  empresas!: ContadorEmpresa[];
}
