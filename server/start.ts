import { startGenerationServer } from "./startup";
// Entry module intentionally starts on import for the explicit mock bootstrap.
startGenerationServer(process.env)
  .then((server) => {
    const stop = () => {
      server.close();
      server.closeAllConnections();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  })
  .catch(() => {
    console.error(
      "Backend could not start. Check local configuration and port.",
    );
    process.exitCode = 1;
  });
