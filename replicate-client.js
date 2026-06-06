const Replicate = require("replicate");

const token = process.env.REPLICATE_API_TOKEN;
let replicate = null;

if (token) {
  replicate = new Replicate({ auth: token });
  console.log('[Replicate] Client initialized successfully.');
} else {
  console.warn('[Replicate] REPLICATE_API_TOKEN is not set. Replicate integration is disabled.');
}

module.exports = replicate;
