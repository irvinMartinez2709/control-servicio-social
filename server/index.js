/* =============================================================
   server/index.js — API en línea de Control Servicio Social
   -------------------------------------------------------------
   Dos modos:
     - MONGODB_URI definida  -> MongoDB Atlas (producción en Render)
     - sin MONGODB_URI       -> modo memoria (pruebas locales, sin BD)

   Endpoints:
     GET  /api/health  -> { ok, mode }
     GET  /api/data    -> estado compartido completo
     POST /api/sync    -> { ops: [{coll, action, id, doc, at}] }

   Las operaciones son upsert/borrado por documento (id), por lo que
   dos dispositivos que suben a la vez se UNEN (nada se borra salvo
   una operación "del" explícita). Después de sincronizar se depuran
   las asistencias huérfanas (userId inexistente).
   ============================================================= */
"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.PORT) || 8124;
const MONGODB_URI = process.env.MONGODB_URI || "";
const APP_KEY = process.env.APP_KEY || ""; // opcional: si existe, exige header x-app-key
const MEMORY_PERSIST = process.env.MEMORY_PERSIST === "1";

const SHARED = ["users", "attendance", "photos", "bitacoras", "jornadas", "groups", "audit", "settings"];
const ARRAY_COLL = SHARED.filter((c) => c !== "settings");
const DATA_FILE = path.join(__dirname, ".data", "db.json");
const REPO_DATA = path.join(__dirname, "..", "data");
const DOCS = "docs"; // colección única de MongoDB: { _id: "coll:id", coll, id, data, updatedAt }

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" })); // fotos en base64

/* ------------------------- Memoria (modo pruebas) ------------------------- */
let memory = null;

function repoSeed() {
  const seed = {};
  for (const coll of ARRAY_COLL) {
    seed[coll] = {};
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(REPO_DATA, `${coll}.json`), "utf8"));
      const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
      rows.forEach((d) => { if (d && d.id) seed[coll][String(d.id)] = d; });
    } catch (e) { /* sin ese archivo: colección vacía */ }
  }
  seed.settings = {};
  return seed;
}

function saveMemory() {
  if (!MEMORY_PERSIST) return;
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(memory));
  } catch (e) {
    console.error("[api] No se pudo guardar .data/db.json:", e.message);
  }
}

function loadMemory() {
  if (MEMORY_PERSIST) {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (raw && typeof raw === "object" && raw.users) return raw;
    } catch (e) { /* primera ejecución */ }
  }
  return repoSeed();
}

function memGetAll() {
  const out = {};
  for (const coll of ARRAY_COLL) out[coll] = Object.values(memory[coll] || {});
  out.settings = (memory.settings && memory.settings.singleton) || null;
  return out;
}

function memApply(ops) {
  for (const op of ops) {
    if (!op || !SHARED.includes(op.coll)) continue;
    if (op.coll === "settings") {
      if (op.action === "del") delete memory.settings.singleton;
      else if (op.doc && typeof op.doc === "object") memory.settings.singleton = op.doc;
      continue;
    }
    const id = op.id ? String(op.id) : "";
    if (!id) continue;
    if (op.action === "del") delete memory[op.coll][id];
    else if (op.doc && typeof op.doc === "object") memory[op.coll][id] = op.doc;
  }
  // Higiene: una cuenta eliminada no deja asistencias huérfanas
  const userIds = new Set(Object.keys(memory.users));
  if (userIds.size) {
    Object.values(memory.attendance).forEach((r) => {
      if (r.userId && !userIds.has(String(r.userId))) delete memory.attendance[String(r.id)];
    });
  }
  saveMemory();
}

/* ------------------------- MongoDB Atlas (producción) ------------------------- */
let mongoClient = null;

async function mongoGetAll() {
  const rows = await mongoClient.db().collection(DOCS).find({}).toArray();
  const out = {};
  for (const coll of SHARED) out[coll] = coll === "settings" ? null : [];
  rows.forEach((r) => {
    if (r.coll === "settings") out.settings = r.data;
    else if (Array.isArray(out[r.coll])) out[r.coll].push(r.data);
  });
  return out;
}

async function mongoApply(ops) {
  const col = mongoClient.db().collection(DOCS);
  const now = Date.now();
  for (const op of ops) {
    if (!op || !SHARED.includes(op.coll)) continue;
    const id = op.coll === "settings" ? "singleton" : (op.id ? String(op.id) : "");
    if (!id) continue;
    const _id = `${op.coll}:${id}`;
    if (op.action === "del") {
      await col.deleteOne({ _id });
    } else if (op.doc && typeof op.doc === "object") {
      await col.replaceOne({ _id }, { _id, coll: op.coll, id, data: op.doc, updatedAt: op.at || now }, { upsert: true });
    }
  }
  // Higiene: una cuenta eliminada no deja asistencias huérfanas
  const users = await col.find({ coll: "users" }, { projection: { _id: 1 } }).toArray();
  if (users.length) {
    await col.deleteMany({
      coll: "attendance",
      _id: { $nin: users.map((u) => `attendance:${u._id.slice("users:".length)}`) }
    });
  }
}

/* ------------------------- Endpoints ------------------------- */
async function getAll() {
  return MONGODB_URI ? mongoGetAll() : memGetAll();
}
async function applyOps(ops) {
  if (MONGODB_URI) await mongoApply(ops); else memApply(ops);
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, mode: MONGODB_URI ? "mongo" : "memory", at: Date.now() });
});

app.get("/api/data", async (req, res) => {
  try {
    res.json(await getAll());
  } catch (e) {
    console.error("[api] GET /api/data:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/sync", async (req, res) => {
  if (APP_KEY && req.get("x-app-key") !== APP_KEY) {
    return res.status(401).json({ error: "Clave de aplicación inválida" });
  }
  const ops = req.body && Array.isArray(req.body.ops) ? req.body.ops : null;
  if (!ops) return res.status(400).json({ error: "Se esperaba { ops: [...] }" });
  if (ops.length > 5000) return res.status(413).json({ error: "Lote demasiado grande" });
  try {
    await applyOps(ops);
    res.json({ ok: true, applied: ops.length });
  } catch (e) {
    console.error("[api] POST /api/sync:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------- Arranque ------------------------- */
(async () => {
  if (MONGODB_URI) {
    const { MongoClient } = require("mongodb");
    try {
      mongoClient = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
      await mongoClient.connect();
      await mongoClient.db().command({ ping: 1 });
      console.log("[api] Conectado a MongoDB Atlas");
    } catch (e) {
      console.error("[api] No se pudo conectar a MongoDB:", e.message);
      if (!process.env.VERCEL) process.exit(1); // Render reiniciará el servicio
    }
  } else {
    memory = loadMemory();
    console.log("[api] Modo memoria (sin MONGODB_URI)", MEMORY_PERSIST ? "+ respaldo .data/db.json" : "");
  }

  // En Vercel (serverless) la app se exporta y NO escucha; en Render/local sí.
  if (!process.env.VERCEL) {
    app.listen(PORT, () => console.log(`[api] Escuchando en http://127.0.0.1:${PORT}`));
  }
})();

// Salida para serverless (Vercel): el runtime envuelve la app Express exportada.
module.exports = app;
