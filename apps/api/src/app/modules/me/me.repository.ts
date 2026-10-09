export abstract class MeRepository {
  abstract countSchools(userId: string): Promise<number>;
}
