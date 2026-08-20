import bcrypt from 'bcrypt';
import { query, closePool } from './src/config/db.js';

const SALT_ROUNDS = 10;

// Creates the first admin account (bcrypt-hashed). Safe to re-run.
const seedAdmin = async (): Promise<void> => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required to seed the admin account');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO admins (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO NOTHING
     RETURNING id`,
    [username, passwordHash]
  );

  if (result.rows.length > 0) {
    console.log(`Admin account "${username}" created.`);
  } else {
    console.log(`Admin account "${username}" already exists — skipped.`);
  }
};

seedAdmin()
  .catch((error) => {
    console.error('Failed to seed admin account:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    closePool();
  });
