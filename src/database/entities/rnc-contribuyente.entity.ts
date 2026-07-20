import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('rnc_contribuyentes')
export class RncContribuyente {
  @PrimaryColumn({ type: 'varchar', length: 11 })
  rnc!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  razon_social!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  actividad_economica!: string;

  @Column({ type: 'varchar', length: 20, default: '' })
  fecha_inicio_operaciones!: string;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVO' })
  estado!: string;

  @Column({ type: 'varchar', length: 30, default: 'NORMAL' })
  regimen_pago!: string;
}
