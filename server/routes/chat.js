import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import db from "../config/db.js";
const chatRouter = express.Router();

dotenv.config();

const generateTableName = (userId, instanceId)=>{
  const input = `${userId}:${instanceId}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const shortHash = hash.substring(0, 32);

  return `chat_${shortHash}`;
}

//Getting the chats according to the instance id
chatRouter.get('/api/chat/:slug',async (req,res)=>{
  const { slug: instance_id } = req.params;
  const userId = req.headers.userid;
  const sql = `SELECT * FROM ?? ORDER BY timestamp ASC`;
  try{
    const tableName = generateTableName(userId, instance_id);
    const [results] = await db.query(sql,[tableName]);
    res.status(200).json(results);
  }
  catch(err){
    console.log("Error..");
    res.status(500).send('Internal Server Error');
  }
});


//Getting chat index according to instance id
chatRouter.get('/api/chat_index/:slug',async (req,res)=>{
  const { slug: instance_id } = req.params;
  const userId = req.headers.userid;
  const sql = `SELECT * FROM ?? ORDER BY timestamp ASC`;
  console.log("User ID:", userId);
  console.log("Instance ID:", instance_id);
  try{
    const tableName = generateTableName(userId, instance_id);
    console.log("Fetching from table:", tableName.replace('chat_','index_'));
    const [results] = await db.query(sql,[tableName.replace('chat_','index_')]);
    res.status(200).json(results);
  }
  catch(err){
    console.log("Error..",err);
    res.status(500).send('Internal Server Error');
  }
});


//Getting all the instances
chatRouter.get('/api/all_instance',async (req,res)=>{
  const userId = req.headers.userid;
  const sql = `SELECT * FROM ${userId+'_chat_instances'} ORDER BY timestamp ASC`;
  try{
    const [results] = await db.query(sql);
    res.status(200).json(results);
  }
  catch(err){
    console.log("Error..", err);
    res.status(500).send('Internal Server Error');
  }
});


//For New Chat Table
chatRouter.post('/api/newchat/:slug', async (req, res) => {
  const { slug: instance_id } = req.params;
  const {userId} = req.body;
  const sql = `CREATE TABLE IF NOT EXISTS ??(chat_id VARCHAR(255) PRIMARY KEY,chat_message LONGTEXT NOT NULL,is_human BOOLEAN NOT NULL, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
  const sql2 = `CREATE TABLE IF NOT EXISTS ??(index_id VARCHAR(255) PRIMARY KEY,index_name LONGTEXT NOT NULL,timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
  try {
    const tableName = generateTableName(userId, instance_id);
    const indexTableName = tableName.replace('chat_','index_');
    await db.query(sql,[tableName]);
    await db.query(sql2,[indexTableName]);
    console.log("Table is created: ",tableName,": ", indexTableName);
  } catch (err) {
    console.log("Error in creating table",err) 
    res.status(500).send('Internal Server Error');
  }
  res.sendStatus(200);
})


//For New Instance
chatRouter.post('/api/instance/:slug', async (req, res) => {
  const { slug: instance_id } = req.params;
  const {topic,is_active, userId} = req.body;
  const sql = `INSERT INTO ${userId+'_chat_instances'}(instance_id,topic_message,active) VALUES (?,?,?);`;
  try {
    await db.query(sql,[instance_id,topic,is_active]);
    console.log("Inserted in the instance",instance_id);
  } catch (err) {
    console.log("Error in inserting in the instance",err);
    res.status(500).send('Internal Server Error');
  }
  res.sendStatus(200);
})


//For Updating Topic Message
chatRouter.post('/api/instance_topic/:slug', async (req, res) => {
  const { slug: chat_active_id } = req.params;
  const {topic, userId} = req.body;
  const sql = `UPDATE ${userId+'_chat_instances'} SET topic_message = '${topic}' WHERE instance_id = '${chat_active_id}';`;
  try {
    await db.query(sql);
    console.log("Updated");
  } catch (err) {
    console.log("Error in Updation in the instance",err);
    res.status(500).send('Internal Server Error');
  }
  res.sendStatus(200);
})


//For Deleting Instance
chatRouter.post('/api/instance_delete/:slug', async (req,res)=>{
  const { slug: instance_id } = req.params;
  const {userId} = req.body;
  const sql = `DELETE FROM ${userId+'_chat_instances'} WHERE instance_id = '${instance_id}';`;
  try {
    await db.query(sql);
    console.log("Deleted");
  } catch (err) {
    console.log("Error in Deletion the instance",err);
    res.status(500).send('Internal Server Error');
  }
  const tableName = generateTableName(userId, instance_id);
  const indexTableName = tableName.replace('chat_','index_');

  let query = `DROP TABLE ${tableName};`;
  let query2 = `DROP TABLE ${indexTableName};`;
  try {
    await db.query(query);
    await db.query(query2);
    console.log("Deleted");
  } catch (err) {
    console.log("Error in Deletion the instance",err);
    res.status(500).send('Internal Server Error');
  }

  res.sendStatus(200);
})


//For Inserting Chat Message
chatRouter.post('/api/go/:slug', async(req, res) => {
  const { slug: chat_active_id } = req.params;
  const {id,message,is_human} = req.body;
  const {userId} = req.body;
  console.log("Instance: ",chat_active_id)
  const tableName = generateTableName(userId, chat_active_id);
  console.log("Inserting into table:", tableName);
  const sql = `INSERT INTO ${tableName}(chat_id, chat_message, is_human) VALUES (?,?,?)`
  try {
    await db.query(sql,[id,message,is_human]);
    console.log("Data inserted...",chat_active_id);
  } catch (err) {
    console.log("Error in Insertion",err);
    res.status(500).send('Internal Server Error');
  }
  res.sendStatus(200);
});


//For Inserting Chat Index
chatRouter.post('/api/chat_index/:slug', async(req, res) => {
  const { slug: chat_active_id } = req.params;
  const {index, userMessageId, userId} = req.body;
  console.log("Received index:", index, "for chat instance:", chat_active_id, "with message ID:", userMessageId);

  const tableName = generateTableName(userId, chat_active_id).replace('chat_','index_');
  console.log("Index Table Name:", tableName);
  const sql = `INSERT INTO ${tableName}(index_id,index_name) VALUES (?,?)`
  try {
    await db.query(sql,[userMessageId, index]);
    console.log("Data inserted...",chat_active_id);
  } catch (err) {
    console.log("Error in Insertion",err);
    res.status(500).send('Internal Server Error');
  }
  res.sendStatus(200);
})

export default chatRouter;
