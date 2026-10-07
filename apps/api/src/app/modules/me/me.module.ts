import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { MeController } from './me.controller';

@Module({ imports: [EduvaultAuthModule], controllers: [MeController] })
export class MeModule {}
