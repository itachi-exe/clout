// Real syntax check for browser scripts. `node --check` core-dumps on this box, so compile with vm instead.
const fs = require("fs");
const vm = require("vm");
let bad = 0;
for (const file of process.argv.slice(2)) {
  try { new vm.Script(fs.readFileSync(file, "utf8"), { filename: file }); console.log("ok   " + file); }
  catch (e) { bad++; console.log("FAIL " + file + "\n     " + e.message + "\n     " + (e.stack || "").split("\n")[1]); }
}
process.exitCode = bad ? 1 : 0;
