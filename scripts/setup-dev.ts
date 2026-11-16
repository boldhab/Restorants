import { copyFileSync, existsSync } from 'node:fs';
for (const [source, target] of [
  ['apps/api/.env.example', 'apps/api/.env'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
]) {
  if (!existsSync(target)) {
    copyFileSync(source, target);
    console.log(`Created ${target}`);
  } else console.log(`Preserved existing ${target}`);
}
console.log('Start PostgreSQL, then run npm run db:migrate and npm run dev.');
