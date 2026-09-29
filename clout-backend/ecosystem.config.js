// pm2 definition for every Clout backend process. Start with:
//   sudo pm2 start /opt/hermes/projects/clout/clout-backend/ecosystem.config.js && sudo pm2 save
const path = require("path");
const cwd = __dirname;
module.exports = {
  apps: [
    { name: "clout-backend",             script: path.join(cwd, "src/server.js"),            cwd, interpreter: "node", autorestart: true },
    { name: "clout-indexer",             script: path.join(cwd, "src/indexer.js"),           cwd, interpreter: "node", autorestart: true },
    { name: "clout-indexer-keys",        script: path.join(cwd, "src/indexer-keys.js"),      cwd, interpreter: "node", autorestart: true },
    { name: "clout-indexer-post-shares", script: path.join(cwd, "src/indexer-post-shares.js"), cwd, interpreter: "node", autorestart: true },
  ],
};
