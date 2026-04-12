import crypto from 'crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npx ts-node scripts/hash-password.ts <password>');
  process.exit(1);
}

const hash = crypto.createHash('sha256').update(password).digest('hex');
console.log(hash);
