import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
export const normalizeEmail=email=>String(email||'').trim().toLowerCase();
export const securePassword=password=>bcrypt.hash(password,12);
export const passwordMatches=(plain,hash)=>bcrypt.compare(plain,hash);
export const generateOtp=()=>String(crypto.randomInt(100000,1000000));
export const fingerprintOtp=code=>crypto.createHash('sha256').update(String(code)).digest('hex');
