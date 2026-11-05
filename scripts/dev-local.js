import { spawn } from 'node:child_process';
import process from 'node:process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit', env: process.env }),
  spawn(npm, ['run', 'dev', '--', '--host', '0.0.0.0'], { stdio: 'inherit', env: process.env })
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => {
  if (!stopping && code !== 0) {
    console.error(`Un service Kingbox s'est arrêté (code ${code}).`);
    stop();
    process.exitCode = code || 1;
  }
});
