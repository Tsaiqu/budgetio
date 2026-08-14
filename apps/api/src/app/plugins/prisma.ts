import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@budgetio/db';

const prismaPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (server) => {
    await server.prisma.$disconnect();
  });
});

// @fastify/autoload ładuje wyłącznie domyślny eksport — bez tego plik jest
// po cichu pomijany i fastify.prisma zostaje undefined.
export default prismaPlugin;
