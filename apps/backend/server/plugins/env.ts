import { z } from 'zod';

const envSchema = z.object({
  CRYPTO_SECRET: z.string().min(64, 'CRYPTO_SECRET must be at least 64 hex characters'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection string'),
  // Other variables are optional or have defaults
});

export default defineNitroPlugin(() => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    process.exit(1);
  }
});
