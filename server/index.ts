import "../src/env/loadDotEnv";
import { createClawfiApiServer } from "./app";

const port = Number(process.env.PORT ?? process.env.CLAWFI_API_PORT ?? 8787);
const host = process.env.CLAWFI_API_HOST ?? (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");

const server = createClawfiApiServer({ host, port });
server.listen(port, host, () => {
  console.log(`ClawFi API listening on http://${host}:${port}`);
});
