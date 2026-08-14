import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@budgetio/db';

const prismaPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (server) => {
    await server.prisma.$disconnect();
  });
});
