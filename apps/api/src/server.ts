import { buildApp } from "./app.js";
import { config } from "./config.js";

const port = config.API_PORT;
const host = process.env.API_HOST ?? "0.0.0.0";
const app = await buildApp();

await app.listen({ port, host });
