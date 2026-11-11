// Fiş okuma (OCR) dosyalarını public/ocr altına kopyalar; böylece dışarıdaki bir CDN'e bağlı kalmayız.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });
const nm = (...p) => join(root, 'node_modules', ...p);
const files = [
  [nm('tesseract.js', 'dist', 'worker.min.js'), 'worker.min.js'],
  [nm('tesseract.js-core', 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [nm('tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [nm('tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm.js'), 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  [nm('@tesseract.js-data', 'tur', '4.0.0_best_int', 'tur.traineddata.gz'), 'tur.traineddata.gz']
];
for (const [from, name] of files) {
  if (!existsSync(from)) { console.warn('OCR dosyası bulunamadı:', from); continue; }
  copyFileSync(from, join(out, name));
}
console.log('OCR dosyaları kopyalandı →', out);
