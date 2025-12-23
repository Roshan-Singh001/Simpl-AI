import express from "express";
import db from "../config/db.js"
import {Ollama} from "ollama";
import { chunkText } from "../utils/chunks.js";
import { embed } from "../utils/embedding.js";
import { extractText } from "../utils/extract.js";
import { get_Collection, resetCollection, delete_Collection } from "../config/chromadb.js";
import multer from "multer";
import crypto from "crypto";
import dotenv from "dotenv";
const docRouter = express.Router();

dotenv.config();

const upload = multer();

const ollama1 = new Ollama({
  host: process.env.OLLAMA_BASE_URL,
});

const generateTableName = (userId, instanceId) => {
  const input = `${userId}:${instanceId}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const shortHash = hash.substring(0, 32);

  return `doc_chat_${shortHash}`;
}

docRouter.post('/api/upload_doc/:slug', upload.single('file'), async (req, res) => {
  const { slug: instance_id } = req.params;
  const userId = req.headers.userid;
  try {
    const file = req.file;
    console.log(file);
    if (!file) return res.json({ success: false, msg: "No file" });

    const text = await extractText(file);
    const chunks1 = await chunkText(text);
    const fileId = `doc_${instance_id}`;
    const collection = await resetCollection(fileId);

    console.log("FileID", fileId);
    console.log("Chunks:", chunks1);
    console.log("Number of chunks:", chunks1.length);
    console.log("Sample chunk:", text);

    
    for (let i = 0; i < chunks1.length; i++) {
      const emb = await embed(chunks1[i]);
      console.log("Embedding length:", emb?.length);
      await collection.add({
        ids: [`doc_${instance_id}_${i}`],
        embeddings: [emb],
        metadatas: [{ chunk: chunks1[i] }]
      });
    }
    console.log(collection);

    var fileType = '';
    var filename = file.originalname;
    if (file.mimetype.includes("pdf")) fileType = "pdf";
    else if (file.mimetype.includes("word")) fileType = "docx";
    else if (file.mimetype.includes("presentation")) fileType = "ppt";
    else if (file.mimetype === "text/plain") fileType = "txt";



    const query1 = `UPDATE ${userId + '_doc_chat_instances'} 
    SET 
        doc_file_name = ?,
        doc_type = ?,
        doc_topic_message = ?
    WHERE doc_instance_id = ?`;

    await db.query(query1, [filename, fileType, filename, instance_id]);

    return res.json({ success: true, fileId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, msg: "Error processing file" });
  }
})

docRouter.post('/api/new_chat/:slug', async (req, res) => {
  const { slug: instance_id } = req.params;
  const { userId } = req.body;
  try {
    const sql = `CREATE TABLE IF NOT EXISTS ??
    (doc_chat_id VARCHAR(255) PRIMARY KEY,
    doc_chat_message LONGTEXT NOT NULL,
    is_human BOOLEAN NOT NULL, 
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
    const tableName = generateTableName(userId, instance_id);
    await db.query(sql, [tableName]);

    const sql_instance = `INSERT INTO ${userId + '_doc_chat_instances'} 
    (doc_instance_id, doc_topic_message, doc_pin) VALUES (?,?,FALSE);`;
    await db.query(sql_instance, [instance_id, 'New Chat']);

    res.status(200).json({ message: 'Chat table created successfully' });
  } catch (error) {
    console.error("Error creating new chat table:", error);
    res.status(500).json({ message: 'Internal server error' });
  }
})

docRouter.post('/api/ask/:slug', async (req, res) => {
  const { slug: instance_id } = req.params;
  const { question, userId, userMessageId, aiMessageId } = req.body;

  try {
    if (!instance_id || !question) {
      return res.json({ success: false, msg: "Missing data" });
    }
    console.log("Received question:", question);

    console.log(`${instance_id}`);

    const collection = await get_Collection(`doc_${instance_id}`);
    console.log("Collection: ", collection)

    const questionEmb = await embed(question);
    console.log("Question embedding:", questionEmb);

    const results = await collection.query({
      queryEmbeddings: [questionEmb],
      nResults: 5
    });

    console.log("ChromaDB results:", results);

    const chunks = results.metadatas.flat().map(m => m.chunk).join("\n\n");
    console.log("Retrieved chunks:", chunks);
    const prompt = `
      You are a document assistant. Answer based ONLY on the content provided from the document. 
      If the answer cannot be found, say "I cannot find relevant information in the document."

      Document context:
      ${chunks}

      Question:
      ${question}

      Answer:`;

    const llmRes = await ollama1.generate({
      model: "llama3",
      prompt
    });
    console.log("Ollama response:", llmRes.response);

    const tableName = generateTableName(userId, instance_id);
    const insertSql = `INSERT INTO ${tableName} 
    (doc_chat_id, doc_chat_message, is_human) VALUES (?,?,?);`;
    await db.query(insertSql, [userMessageId, question, true]);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await db.query(insertSql, [aiMessageId, llmRes.response, false]);

    return res.json({ success: true, answer: llmRes.response });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, msg: "Error processing question" });

  }
});

docRouter.get('/api/doc_chat_instance_list', async (req, res) => {
  const userId = req.headers.userid;
  
  try {
    const sql = `SELECT * FROM ${userId + '_doc_chat_instances'} ORDER BY doc_pin DESC, timestamp DESC;`;
    const [rows] = await db.query(sql);

    console.log(rows);

    res.status(200).json({ success: true, instances: rows });
  } catch (error) {
    console.error("Error fetching doc chat instances:", error);
    res.status(500).json({ success: false, message: 'Internal server error' });

  }
})

docRouter.get('/api/doc_chat_history/:slug', async (req, res) => {
  const { slug: instance_id } = req.params;
  const userId = req.headers.userid;

  try {
    const tableName = generateTableName(userId, instance_id);
    const sql = `SELECT * FROM ${tableName} ORDER BY timestamp ASC;`;
    const [rows] = await db.query(sql);
    console.log(rows);

    res.status(200).json({ success: true, chatHistory: rows });
  } catch (error) {
    console.error("Error fetching doc chat history:", error);
    res.status(500).json({ success: false, message: 'Internal server error' });

  }
})

docRouter.delete('/api/delete_doc_chat', async(req,res)=>{
  const { instanceId, userId } = req.body;
  try {
    const tableName = generateTableName(userId, instanceId);
    const sql = `DROP TABLE IF EXISTS ${tableName};`;
    await db.query(sql);
    await delete_Collection(`doc_${instanceId}`);

    const sql_instance = `DELETE FROM ${userId + '_doc_chat_instances'} 
    WHERE doc_instance_id = ?;`;
    await db.query(sql_instance, [instanceId]);

    res.status(200).json({ success: true, message: "Document chat deleted successfully" });

  } catch (error) {
    console.error("Error deleting doc chat:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
    
  }

});

export default docRouter;

