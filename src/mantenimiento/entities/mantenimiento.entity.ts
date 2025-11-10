// mantenimiento.entity.ts
import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn,
  ManyToOne,
  JoinColumn 
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum EstadoMantenimiento {
  PENDIENTE = 'pendiente',
  EN_REVISION = 'en_revision',
  FINALIZADO = 'finalizado',
}

@Entity('mantenimientos')
export class Mantenimiento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nombreEquipo: string;

  @Column()
  marca: string;

  @Column()
  modelo: string;

  @Column('text')
  descripcionProblema: string;

  @Column({ nullable: true })
  fotoUrl: string;

  @Column({ nullable: true })
  fotoPath: string;

  @Column({
    type: 'enum',
    enum: EstadoMantenimiento,
    default: EstadoMantenimiento.PENDIENTE,
  })
  estado: EstadoMantenimiento;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuarioId' })
  usuario: User;

  @Column()
  usuarioId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'tecnicoId' })
  tecnico: User;

  @Column()
  tecnicoId: string;

  @CreateDateColumn()
  creadoEn: Date;

  @UpdateDateColumn()
  actualizadoEn: Date;
}