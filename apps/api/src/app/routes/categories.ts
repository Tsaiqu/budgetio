import type { FastifyPluginAsync } from 'fastify';

const categoriesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/categories', async () => {
    return fastify.prisma.category.findMany();
  });
};

export default categoriesRoute;
