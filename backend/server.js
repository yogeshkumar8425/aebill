const http = require("http");
const fs = require("fs");
const path = require("path");
const { routeRequest, sendJson } = require("./api-core");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);

startServer().catch((error) => {
  console.error("Failed to start backend.", error);
  process.exit(1);
});

async function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      await routeRequest(req, res);
    } catch (error) {
      console.error("Unhandled server error.", error);
      sendJson(res, error.statusCode || 500, { error: error.message || "Internal server error" });
    }
  });

  server.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, "utf8");
  contents.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      return;
    }
    const separatorIndex = line.indexOf("=");
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}
