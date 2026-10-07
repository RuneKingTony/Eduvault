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

export async function startPostgres(
  image: string = POSTGRES_IMAGE
): Promise<StartedPostgres> {
  const container = await new PostgreSqlContainer(image)
    .withDatabase('eduvault')
    .withUsername('eduvault')
    .withPassword('eduvault')
    .start();
  return {
    uri: container.getConnectionUri(),
    container,
    stop: async () => {
      await container.stop({ remove: true, removeVolumes: true });
    },
  };
}
