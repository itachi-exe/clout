// pm2 definition for every ArcYard backend process. Start with:
//   sudo pm2 start /opt/hermes/projects/arcyard/yard-backend/ecosystem.config.js && sudo pm2 save
const path = require("path");
const cwd = __dirname;
module.exports = {
  apps: [
    { name: "arcyard-backend",      script: path.join(cwd, "src/server.js"),       cwd, interpreter: "node", autorestart: true },
    { name: "arcyard-indexer",      script: path.join(cwd, "src/indexer.js"),      cwd, interpreter: "node", autorestart: true },
    { name: "arcyard-indexer-keys", script: path.join(cwd, "src/indexer-keys.js"), cwd, interpreter: "node", autorestart: true },
  ],
};
