import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('super_admins')
export class SuperAdmin {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar' })
  password_hash!: string;

  @Column({ type: 'varchar' })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'integer', default: 0 })
  intentos_fallidos!: number;

  @Column({ type: 'timestamptz', nullable: true })
  primer_intento_fallido!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  bloqueado_hasta!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
