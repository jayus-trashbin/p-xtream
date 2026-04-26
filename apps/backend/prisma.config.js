// Prisma 7 config — plain JS to avoid prisma/config module resolution issues
// defineConfig is an identity function, so the plain object is equivalent
require('dotenv/config');

module.exports = {
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
