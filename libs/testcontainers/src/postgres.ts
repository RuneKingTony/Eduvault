import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

export const POSTGRES_IMAGE = 'postgres:17.6-alpine';

export interface StartedPostgres {
  uri: string;
  container: StartedPostgreSqlContainer;
  stop: () => Promise<void>;
}

export interface StartPostgresOptions {
  image?: string;
  /** `postgres -c name=value` server settings. */
  settings?: Record<string, string>;
}

export async function startPostgres({
  image = POSTGRES_IMAGE,
  settings = {},
}: StartPostgresOptions = {}): Promise<StartedPostgres> {
  const flags = Object.entries(settings).flatMap(([name, value]) => [
    '-c',
    `${name}=${value}`,
  ]);
  const container = await new PostgreSqlContainer(image)
    .withDatabase('eduvault')
    .withUsername('eduvault')
    .withPassword('eduvault')
    .withCommand(['postgres', ...flags])
    .start();
  return {
    uri: container.getConnectionUri(),
    container,
    stop: async () => {
      await container.stop({ remove: true, removeVolumes: true });
    },
  };
}
