import 'dotenv/config';
import express from 'express';
import { toNodeHandler } from "better-auth/node";
import { auth } from './lib/auth.js';
import mysql2 from 'mysql2/promise';
import cors from 'cors';
import editorRouter from './routes/editor.js';
import chatRouter from './routes/chat.js';
import docRouter from './routes/doc.js';
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.all("/api/auth/*", toNodeHandler(auth.handler));
app.use('/code',editorRouter);
app.use('/chat',chatRouter);
app.use('/doc',docRouter);

const databasePass = process.env.MYSQL_PASSWORD;
const db_host = process.env.MYSQL_HOST;
const db_user = process.env.MYSQL_USER;
const db_name = process.env.MYSQL_DATABASE;

// MYSQL Connection
var conn;
const connectWithDB = async (retries = 10, delayMs = 3000)=>{
  for (let i = 0; i <= retries; i++) {
    try {
      conn = await mysql2.createConnection({
        host: db_host,
        user: db_user,
        password: databasePass,
        database: db_name
      });
      console.log("Database connection established...");
    } 
    catch (err) {
      console.error("Error in database connection: ", err, " retrying...", i);
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
    
  }
};
connectWithDB();

app.post("/api/new_user", async(req,res)=>{
    const { userId } = req.body;
    console.log("New user creation request for userId:", userId);
    try {
        const sql = `CREATE TABLE IF NOT EXISTS ${userId+'_chat_instances'}
                    (instance_id VARCHAR(255) PRIMARY KEY,
                    topic_message LONGTEXT NOT NULL,
                    active BOOLEAN DEFAULT FALSE,
                    pin BOOLEAN DEFAULT FALSE,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
        await conn.query(sql);

        const sql2 = `CREATE TABLE IF NOT EXISTS ${userId+'_doc_chat_instances'}
                    (doc_instance_id VARCHAR(255) PRIMARY KEY,
                    doc_topic_message LONGTEXT NOT NULL,
                    doc_file_name VARCHAR(255) DEFAULT 'none',
                    doc_type ENUM('pdf','docx','txt','ppt','none') DEFAULT 'none',
                    doc_pin BOOLEAN DEFAULT FALSE,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
        await conn.query(sql2);
        res.status(200).json({ message: "User table created successfully" });

    } catch (error) {
        console.error("Error creating new user:", error);
        res.status(500).json({ message: "Internal server error" });
    }

});

app.listen(port,"0.0.0.0", () => {
  console.log(`Example app listening on port ${port}`)
})
