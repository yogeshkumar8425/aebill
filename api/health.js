const { routeRequest, sendJson } = require("../backend/api-core");

module.exports = async function handler(req, res) {
  try {
    req.url = "/api/health";
    await routeRequest(req, res);
  } catch (error) {
    console.error("Unhandled API error.", error);
    sendJson(res, error.statusCode || 500, { error: error.message || "Internal server error" });
  }
};
