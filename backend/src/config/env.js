import dotenv from 'dotenv';
dotenv.config();
export const env={
 port:Number(process.env.PORT||4000),origin:process.env.FRONTEND_ORIGIN||'http://localhost:5173',
 jwtSecret:process.env.JWT_SECRET||'',adminEmail:process.env.ADMIN_EMAIL||'',
 smtp:{host:process.env.SMTP_HOST||'',port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',user:process.env.SMTP_USER||'',pass:process.env.SMTP_PASSWORD||'',from:process.env.MAIL_FROM||''},
 devShowOtp:process.env.NODE_ENV!=='production'&&process.env.DEV_SHOW_OTP==='true'
};
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing in backend/.env');
if(env.jwtSecret.length<32)throw Error('JWT_SECRET must be at least 32 characters');
