// Copies MediaPipe's WebAssembly files from node_modules into public/, so the
// camera distance check works offline. Runs before dev, build and preview.
import { cpSync, mkdirSync, readdirSync } from "node:fs";

const from = "node_modules/@mediapipe/tasks-vision/wasm";
const to = "public/mediapipe";
mkdirSync(to, { recursive: true });
for (const f of readdirSync(from)) if (f.startsWith("vision_wasm_internal") || f.startsWith("vision_wasm_nosimd_internal")) cpSync(`${from}/${f}`, `${to}/${f}`);
console.log(`copied MediaPipe wasm to ${to}`);
