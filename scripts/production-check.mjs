import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'server/app.ts',
  'server/auth.ts',
  'api/index.ts',
  'firestore.rules',
  'vercel.json',
  '.env.example',
  'src/lib/validation.ts',
  'src/lib/authFetch.ts',
];
const failures = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing required file: ${file}`);
}

const app = fs.readFileSync(path.join(root, 'server/app.ts'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const checks = [
  [app.includes('requireAuth'), 'AI routes must use Firebase authentication'],
  [app.includes('AI_REQUESTS_PER_HOUR'), 'Per-user AI quota must be configured'],
  [app.includes('app.use(helmet'), 'Helmet security headers must be enabled'],
  [app.includes("express.json({ limit: '12mb' })"), 'Request body limit must be explicit'],
  [app.includes('safetyPattern'), 'AI coach safety screening must be enabled'],
  [app.includes("sex === 'unspecified'"), 'Nutrition calculator must not guess sex'],
  [rules.includes("request.auth.uid == uid"), 'Firestore must enforce per-user ownership'],
  [rules.includes('age >= 18'), 'Firestore must enforce adult-only profile data'],
  [rules.includes("request.resource.data.sex in ['male', 'female', 'unspecified']"), 'Firestore must validate sex'],
  [source.includes('profileSetupRequired'), 'New users must complete profile setup'],
];
for (const [ok, message] of checks) if (!ok) failures.push(message);

if (failures.length) {
  console.error('Production checks FAILED');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log(`Production checks PASSED (${required.length + checks.length} checks)`);
