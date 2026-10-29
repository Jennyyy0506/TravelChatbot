// Dora local dev launcher. No third-party launcher dependency required.
// Run from the project root: npm run dev
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const candidates = win
  ? [join(root, '.venv', 'Scripts', 'python.exe'),
     join(root, 'Travel Chatbot', '.venv', 'Scripts', 'python.exe')]
  : [join(root, '.venv', 'bin', 'python'),
     join(root, 'Travel Chatbot', '.venv', 'bin', 'python')];
if (process.env.VIRTUAL_ENV) {
  candidates.push(join(process.env.VIRTUAL_ENV, win ? 'Scripts/python.exe' : 'bin/python'));
}
const python = candidates.find(existsSync) ?? 'python';

if (python === 'python') {
  console.warn('[Dora] Khong tim thay .venv; thu dung python tu PATH.');
}
console.log('[Dora] Backend:  http://127.0.0.1:8000/docs');
console.log('[Dora] Frontend: http://127.0.0.1:5173/');
console.log('[Dora] Chia se:  ngrok http 5173 --host-header=rewrite');
console.log('[Dora] Ctrl+C de dung ca hai.\n');

let stopping = false;
const children = [];
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed && child.exitCode === null) {
      try { child.kill('SIGTERM'); } catch { /* already exited */ }
    }
  }
  // Child streams use inherited stdio; this process can exit once signaled.
  process.exitCode = code;
}

const backend = spawn(python,
  ['-m', 'uvicorn', 'auth_api:app', '--app-dir', 'Travel Chatbot',
   '--host', '127.0.0.1', '--port', '8000'],
  { cwd: root, stdio: 'inherit', env: process.env });
children.push(backend);

const frontend = win
  ? spawn(process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'npm --prefix frontend run dev'],
      { cwd: root, stdio: 'inherit', env: process.env })
  : spawn('npm', ['--prefix', 'frontend', 'run', 'dev'],
      { cwd: root, stdio: 'inherit', env: process.env });
children.push(frontend);

for (const [name, child] of [['Backend', backend], ['Frontend', frontend]]) {
  child.on('error', (error) => {
    console.error(`[Dora] Khong mo duoc ${name}: ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[Dora] ${name} da dung (${signal || `exit ${code}`}).`);
      shutdown(code || 1);
    }
  });
}
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
