import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { EstadoToken } from '../enums.js';
import { Usuario } from './usuario.entity.js';
import { Empresa } from './empresa.entity.js';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  usuario_id!: string | null;

  @ManyToOne(() => Usuario, (usuario) => usuario.refresh_tokens, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario | null;

  @Column({ type: 'uuid', nullable: true })
  empresa_id!: string | null;

  @ManyToOne(() => Empresa, (empresa) => empresa.refresh_tokens, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa | null;

  @Index('idx_refresh_tokens_hash')
  @Column({ type: 'varchar' })
  token_hash!: string;

  @Column({ type: 'enum', enum: EstadoToken, default: EstadoToken.ACTIVO })
  estado!: EstadoToken;

  @Column({ type: 'timestamptz' })
  expira_en!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
