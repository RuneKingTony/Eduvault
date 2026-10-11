import { Module } from '@nestjs/common';
import { ActivityWriter } from './activity-writer';

@Module({ providers: [ActivityWriter], exports: [ActivityWriter] })
export class ActivityModule {}
