/**
 * Ghost – Global Shims
 * Hermes (React Native's JS engine) is not a browser.
 * These polyfills provide browser APIs that packages expect.
 * Import this as the VERY FIRST line of index.js.
 */

// ── Buffer ───────────────────────────────────────────────────────
// Many crypto packages (tweetnacl-util, etc.) use Buffer.
import {Buffer} from 'buffer';
global.Buffer = Buffer;

// ── atob / btoa ──────────────────────────────────────────────────
// Hermes does not have atob/btoa. Implement via Buffer.
if (typeof global.atob === 'undefined') {
  global.atob = (b64) => {
    return Buffer.from(b64, 'base64').toString('binary');
  };
}

if (typeof global.btoa === 'undefined') {
  global.btoa = (binary) => {
    return Buffer.from(binary, 'binary').toString('base64');
  };
}

// ── process ──────────────────────────────────────────────────────
// Some packages reference process.env or process.nextTick
if (typeof global.process === 'undefined') {
  global.process = {
    env:       {NODE_ENV: __DEV__ ? 'development' : 'production'},
    nextTick:  (fn) => setTimeout(fn, 0),
    version:   'v18.0.0',
    platform:  'android',
  };
}

// ── TextEncoder / TextDecoder ────────────────────────────────────
// tweetnacl-util uses these
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = class TextEncoder {
    encode(str) {
      const arr = [];
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code < 0x80) {
          arr.push(code);
        } else if (code < 0x800) {
          arr.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else {
          arr.push(
            0xe0 | (code >> 12),
            0x80 | ((code >> 6) & 0x3f),
            0x80 | (code & 0x3f),
          );
        }
      }
      return new Uint8Array(arr);
    }
  };
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = class TextDecoder {
    decode(arr) {
      let str = '';
      const bytes = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 0x80) {
          str += String.fromCharCode(b);
        } else if ((b & 0xe0) === 0xc0) {
          str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f));
        } else {
          str += String.fromCharCode(
            ((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f),
          );
        }
      }
      return str;
    }
  };
}
