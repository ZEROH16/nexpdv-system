import { buildApp } from "./app.js";
import { config } from "./config.js";

const port = config.API_PORT;
const host = config.API_HOST;
const app = await buildApp();

try {
  app.log.info(
    {
      port,
      host,
      environment: config.NODE_ENV,
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      corsOrigins: config.CORS_ALLOW_ALL ? ["*"] : config.CORS_ORIGINS
    },
    "starting NexPDV Cloud API"
  );
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error, "NexPDV Cloud API failed to start");
  process.exit(1);
}
