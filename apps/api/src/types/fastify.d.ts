import type { prisma } from '@budgetio/db';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}
