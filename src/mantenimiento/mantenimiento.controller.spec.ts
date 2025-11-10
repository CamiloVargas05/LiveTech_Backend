import { Test, TestingModule } from '@nestjs/testing';
import { MantenimientoController } from './mantenimiento.controller';
import { MantenimientoService } from './mantenimiento.service';

describe('MantenimientoController', () => {
  let controller: MantenimientoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MantenimientoController],
      providers: [MantenimientoService],
    }).compile();

    controller = module.get<MantenimientoController>(MantenimientoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
