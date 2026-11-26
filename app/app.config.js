// Reads app.json and lets CI set the web base URL (GitHub Pages serves from /<repo>).
const base = require("./app.json").expo;
module.exports = () => ({
  ...base,
  experiments: process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : undefined,
});
