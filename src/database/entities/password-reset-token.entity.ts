import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Token de recuperación de contraseña (single-use).
 *
 * Igual que los refresh tokens, en BD solo se guarda el hash SHA-256 del token
 * crudo que viaja en el enlace enviado por email. Soporta tanto usuarios de
 * empresa (`usuario_id`) como super admins (`super_admin_id`); exactamente uno
 * de los dos estará poblado.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  usuario_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  super_admin_id!: string | null;

  @Index('idx_password_reset_tokens_hash')
  @Column({ type: 'varchar' })
  token_hash!: string;

  @Column({ type: 'timestamptz' })
  expira_en!: Date;

  @Column({ type: 'boolean', default: false })
  usado!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
