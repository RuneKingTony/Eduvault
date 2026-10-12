import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV_TOKEN, type Env } from '../config/env';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';

export const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FileSweepService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(FileSweepService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly files: FilesRepository,
    private readonly service: FilesService,
    @Inject(ENV_TOKEN) private readonly env: Env
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test') {
      return;
    }
    this.run();
    this.timer = setInterval(() => {
      this.run();
    }, SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  private run(): void {
    this.sweep(new Date()).catch((error: unknown) => {
      this.logger.error(
        `Orphan file sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    });
  }

  async sweep(now: Date): Promise<number> {
    const orphans = await this.files.findOrphansUploadedBefore(
      new Date(now.getTime() - ORPHAN_AGE_MS)
    );
    let discarded = 0;
    for (const orphan of orphans) {
      try {
        if (!(await this.files.isAttached(orphan))) {
          await this.service.discard(orphan);
          discarded += 1;
        }
      } catch (error) {
        this.logger.error(
          `Could not discard orphan file ${orphan.id}: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }
    return discarded;
  }
}
