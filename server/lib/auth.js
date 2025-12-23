import { betterAuth } from "better-auth";
import { createPool } from "mysql2/promise";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();


export const auth = betterAuth({
  database: createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT,
  }),

  user: {
    deleteUser: {
      enabled: true
    }
  },

  emailAndPassword: {
    enabled: true,
    beforeDelete: async (user) => {
      const userId = user.id;
      const pool = auth.config.database;

      // Drop user-specific chat instances table
      const dropChatInstancesTableSQL = `DROP TABLE IF EXISTS \`${userId}_chat_instances\``;
      await pool.query(dropChatInstancesTableSQL);

      const dropChatInstancesTableSQL1 = `DROP TABLE IF EXISTS \`${userId}_doc_chat_instances\``;
      await pool.query(dropChatInstancesTableSQL1);

    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    cookie: {
      name: 'auth_session',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    }
  },
  trustedOrigins: ['http://localhost:5173', 'http://localhost:3000'],
})