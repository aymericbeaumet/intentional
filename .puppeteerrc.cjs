// Browsers live inside the repo so CI caching and local runs agree.
const { join } = require("node:path");

module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
  chrome: { skipDownload: false },
  firefox: { skipDownload: false },
};
