/* =============================================================
   crypto.js — Hash de contraseñas, Base32, TOTP (RFC 6238) y QR
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const enc = new TextEncoder();

  /* ------------------------- SHA-256 ------------------------- */
  /**
   * SHA-256 en JavaScript puro. Se usa cuando WebCrypto no está disponible
   * (contextos no seguros / navegadores antiguos) para que los hashes
   * calculados sigan siendo compatibles con los de data/users.json.
   */
  const SHA_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

  function sha256Sync(bytes) {
    const H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    const len = bytes.length;
    const blocks = Math.ceil((len + 9) / 64);
    const padded = new Uint8Array(blocks * 64);
    padded.set(bytes);
    padded[len] = 0x80;
    const bits = len * 8;
    const dv = new DataView(padded.buffer);
    dv.setUint32(blocks * 64 - 8, Math.floor(bits / 4294967296), false);
    dv.setUint32(blocks * 64 - 4, bits >>> 0, false);

    const w = new Uint32Array(64);
    for (let b = 0; b < blocks; b++) {
      const off = b * 64;
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const a15 = w[i - 15], a2 = w[i - 2];
        const s0 = (rotr(a15, 7) ^ rotr(a15, 18) ^ (a15 >>> 3)) >>> 0;
        const s1 = (rotr(a2, 17) ^ rotr(a2, 19) ^ (a2 >>> 10)) >>> 0;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        const ch = ((e & f) ^ (~e & g)) >>> 0;
        const t1 = (h + S1 + ch + SHA_K[i] + w[i]) >>> 0;
        const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        const maj = ((a & bb) ^ (a & c) ^ (bb & c)) >>> 0;
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + bb) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    let out = "";
    for (let i = 0; i < 8; i++) out += H[i].toString(16).padStart(8, "0");
    return out;
  }

  async function sha256Hex(buffer) {
    if (window.crypto && crypto.subtle) {
      try {
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        return Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } catch (e) {
        /* cae al respaldo síncrono */
      }
    }
    return sha256Sync(new Uint8Array(buffer));
  }

  function randomSalt(bytes) {
    const arr = new Uint8Array(bytes || 16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /** Hash "salt:sha256(salt:password)" listo para almacenar */
  async function hashPassword(password, salt) {
    const s = salt || randomSalt(16);
    const digest = await sha256Hex(enc.encode(s + ":" + String(password)));
    return `sha256$${s}$${digest}`;
  }

  /** Verifica una contraseña contra el hash almacenado */
  async function verifyPassword(password, stored) {
    if (!stored) return false;
    const parts = String(stored).split("$");
    if (parts.length !== 3) return false;
    const candidate = await hashPassword(password, parts[1]);
    // Comparación en tiempo constante básica
    if (candidate.length !== stored.length) return false;
    let diff = 0;
    for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ stored.charCodeAt(i);
    return diff === 0;
  }

  /* ------------------------- BASE32 (TOTP) ------------------------- */
  const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  function base32Encode(bytes) {
    let bits = 0, value = 0, out = "";
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
    return out;
  }

  function base32Decode(str) {
    const clean = String(str || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
    let bits = 0, value = 0;
    const out = [];
    for (let i = 0; i < clean.length; i++) {
      const idx = B32_ALPHABET.indexOf(clean[i]);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  /** Genera secreto TOTP aleatorio de 20 bytes (160 bits) en Base32 */
  function generateTotpSecret() {
    const bytes = new Uint8Array(20);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return base32Encode(bytes);
  }

  /* ------------------------- TOTP ------------------------- */
  async function hmacSha1(keyBytes, messageBytes) {
    const key = await crypto.subtle.importKey(
      "raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, messageBytes);
    return new Uint8Array(sig);
  }

  /**
   * Código TOTP de 6 dígitos (periodo 30 s).
   * @param {string} secretBase32
   * @param {number} timestamp (ms)
   */
  async function totp(secretBase32, timestamp) {
    if (!(window.crypto && crypto.subtle)) throw new Error("WebCrypto no disponible");
    const counter = Math.floor((timestamp === undefined ? Date.now() : timestamp) / 1000 / 30);
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint32(0, Math.floor(counter / 2 ** 32));
    view.setUint32(4, counter >>> 0);
    const hmac = await hmacSha1(base32Decode(secretBase32), new Uint8Array(buf));
    const offset = hmac[hmac.length - 1] & 0x0f;
    const bin =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(bin % 1_000_000).padStart(6, "0");
  }

  /** Valida código aceptando ±1 ventana de 30 s */
  async function verifyTotp(secretBase32, code) {
    const clean = String(code || "").replace(/\D/g, "");
    if (clean.length !== 6) return false;
    const now = Date.now();
    for (const step of [-30000, 0, 30000]) {
      const expected = await totp(secretBase32, now + step);
      if (expected === clean) return true;
    }
    return false;
  }

  /** URI otpauth para el autenticador */
  function otpauthURI(secretBase32, accountName, issuer) {
    const iss = issuer || "Control Servicio Social";
    return `otpauth://totp/${encodeURIComponent(iss)}:${encodeURIComponent(accountName)}?secret=${secretBase32}&issuer=${encodeURIComponent(iss)}&algorithm=SHA1&digits=6&period=30`;
  }

  /** Dibuja el QR en un contenedor; si la librería no carga, muestra la clave manual */
  function renderQR(container, text, attempt) {
    if (!container) return;
    const tries = attempt || 0;
    const lib = window.QRCode;

    if (!lib && tries < 8) {
      // La librería externa aún no termina de cargar: reintenta brevemente
      setTimeout(() => renderQR(container, text, tries + 1), 350);
      return;
    }

    container.innerHTML = "";

    // qrcodejs (cdnjs): new QRCode(container, options)
    if (typeof lib === "function") {
      try {
        new lib(container, {
          text,
          width: 208,
          height: 208,
          colorDark: "#10173a",
          colorLight: "#ffffff",
          correctLevel: lib.CorrectLevel ? lib.CorrectLevel.M : 0
        });
        return;
      } catch (e) {
        console.warn("[crypto] No se pudo dibujar el QR:", e);
      }
    }
    renderFallback(container, text);
  }

  function renderFallback(container, text) {
    const note = document.createElement("p");
    note.className = "small muted center mb-0";
    note.innerHTML = "No se pudo generar el QR sin conexión. Captura manualmente la clave secreta en tu autenticador (Google Authenticator / Authy).";
    container.appendChild(note);
  }

  /* ------------------------- PIN / MASTER ------------------------- */
  async function hashPin(pin) {
    return hashPassword(String(pin));
  }
  async function verifyPin(pin, stored) {
    return verifyPassword(String(pin), stored);
  }

  SS.crypto = {
    hashPassword, verifyPassword, randomSalt,
    generateTotpSecret, totp, verifyTotp, otpauthURI, renderQR,
    base32Encode, base32Decode, hashPin, verifyPin,
    sha256Sync
  };
})();
