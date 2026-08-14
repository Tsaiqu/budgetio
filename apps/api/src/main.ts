// Musi być pierwsze — @budgetio/db czyta DATABASE_URL przy ładowaniu modułu.
// Ścieżka rozwiązuje się względem cwd, czyli korzenia workspace'u pod `nx serve`.
// Na produkcji zmienne wstrzykuje kontener i ten import nie ma nic do roboty.
import 'dotenv/config';
import Fastify from 'fastify';
import { app } from './app/app';

const host = process.env.HOST ?? 'localhost';
// API_PORT, nie PORT — `next dev` czyta PORT z tego samego .env i oba serwery
// próbowałyby wtedy zająć ten sam port. PORT zostaje jako fallback dla
// produkcji, gdzie kontener api ma własne środowisko.
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3333);

// Instantiate Fastify with some config
const server = Fastify({
  logger: true,
});

// Register your application as a normal plugin.
server.register(app);

// Start listening.
server.listen({ port, host }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  } else {
    console.log(`[ ready ] http://${host}:${port}`);
  }
});
