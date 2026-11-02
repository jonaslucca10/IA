'use strict';

const { HttpError, runChat } = require('../lib/core');

const MAX_BODY_BYTES = 200 * 1024;

/** Lê e interpreta o corpo JSON, aceitando o body já parseado pela Vercel. */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Requisição muito grande.');
    chunks.push(chunk);
  }
  return parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') return send(405, { error: 'Método não permitido.' });
  try {
    const body = await readBody(req);
    return send(200, runChat(body));
  } catch (err) {
    if (err instanceof HttpError) return send(err.status, { error: err.message });
    console.error(err);
    return send(500, { error: 'Erro interno do servidor.' });
  }
};
