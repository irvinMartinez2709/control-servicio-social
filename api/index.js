/* =============================================================
   api/index.js — Punto de entrada serverless para Vercel
   El runtime de Vercel (@vercel/node) detecta la app Express
   exportada y la monta bajo /api, así que las rutas del API
   (/api/health, /api/data, /api/sync) quedan igual que siempre.
   En Render y en local esto no se usa.
   ============================================================= */
"use strict";

const app = require("../server/index.js");

module.exports = app;
