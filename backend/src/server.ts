import { app } from './app.js';
import { config } from './config/env.js';
import { db } from './config/db.js';

const server = app.listen(config.PORT,config.HOST,() => {
  console.log(JSON.stringify({event:'ready',host:config.HOST,port:config.PORT}));
});

async function shutdown() {
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1),5000).unref();
}
process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);
