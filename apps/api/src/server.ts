import { buildApp } from "./app.js";
import { config } from "./config.js";
import { bootstrapAutomaticAdminIfNeeded } from "./services/automaticAdminBootstrap.js";

const port = config.API_PORT;
const host = config.API_HOST;
const app = await buildApp();

try {
  const adminBootstrap = await bootstrapAutomaticAdminIfNeeded(app.prisma);
  app.log.info(
    {
      created: adminBootstrap.created,
      email: adminBootstrap.user.email,
      role: adminBootstrap.user.role,
      platformRole: adminBootstrap.user.platformRole
    },
    adminBootstrap.created ? "automatic admin bootstrap created default admin" : "automatic admin bootstrap skipped"
  );

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
