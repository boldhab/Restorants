import { spawn } from 'node:child_process';
const port = '4201';
const server = spawn(process.execPath, ['apps/api/dist/src/server.js'], {
  env: { ...process.env, NODE_ENV: 'development', PORT: port },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk;
});
server.stderr.on('data', (chunk) => {
  output += chunk;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (server.exitCode !== null) throw new Error('API exited before readiness');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/ready`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('API did not become ready');
  const health = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
  if (!health.ok) throw new Error('Liveness failed');
  server.kill('SIGTERM');
  const code = await new Promise((resolve) => server.once('exit', resolve));
  if (code !== 0) throw new Error('Shutdown failed');
  console.log('Compiled API readiness, liveness, and graceful shutdown passed.');
} catch (error) {
  server.kill('SIGTERM');
  console.error(output);
  throw error;
}
