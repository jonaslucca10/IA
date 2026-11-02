'use strict';

const { llmConfig, isConfigured } = require('../lib/core');

module.exports = function handler(req, res) {
  const config = llmConfig();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = 200;
  res.end(JSON.stringify({ configured: isConfigured(config), model: config.model }));
};
