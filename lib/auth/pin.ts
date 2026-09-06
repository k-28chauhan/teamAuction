import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;
export const DEFAULT_MASTER_PIN = '1234';

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
