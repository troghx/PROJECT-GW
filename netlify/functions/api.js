const serverless = require('serverless-http');
const app = require('../../server/index.js');

module.exports.handler = serverless(app, {
  request(req, event, context) {
    if (req.url && req.url.startsWith('/.netlify/functions/api')) {
      req.url = req.url.replace('/.netlify/functions/api', '/api');
    }
  }
});
