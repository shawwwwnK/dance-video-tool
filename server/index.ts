import { createApp } from "./app.js";
import { serverPort } from "./config.js";

const app = createApp();
const server = app.listen(serverPort, "127.0.0.1", () => console.log(`LindyLoop API listening at http://127.0.0.1:${serverPort}`));
function stop() { server.close(() => process.exit(0)); }
process.once("SIGINT", stop); process.once("SIGTERM", stop);
