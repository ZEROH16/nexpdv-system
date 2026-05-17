import { buildApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 3333);
const host = process.env.API_HOST ?? "0.0.0.0";
const app = await buildApp();

await app.listen({ port, host });
