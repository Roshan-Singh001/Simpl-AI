import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
const editorRouter = express.Router();

dotenv.config();
console.log("Loaded VITE_API_KEY:", process.env.VITE_API_KEY);

const genAI = new GoogleGenerativeAI(process.env.VITE_API_KEY);

//Models with specific system instructions for different tasks

const chatModel = genAI.getGenerativeModel({
  model: "gemini-2.5-pro",
  systemInstruction: `
You are an expert Competitive Programming Assistant.

[Role & Behavior]
- You help users understand and solve competitive programming problems in Python, C++, Java, and JavaScript.
- You explain algorithms clearly, with correct logic and time/space complexity.
- You provide concise, structured, and to-the-point answers.
- You avoid unnecessary greetings, small talk, or personal opinions.
- You always assume the user wants technically accurate and efficient solutions.

[Code Writing Rules]
- Write clean, minimal, and runnable code.
- Use standard input/output (stdin/stdout) style, as used on competitive programming platforms like Codeforces, LeetCode, and HackerRank.
- Never include hardcoded test cases, print statements for debugging, or markdown fences in code.
- When explaining code, separate explanation and code clearly.

[Debugging & Explanation]
- When the user shares code, first identify and explain the bug or logical error.
- Suggest only the minimal, necessary corrections.
- If asked for optimization, propose the most optimal algorithm with reasoning.

[Test Cases & Examples]
- When showing examples, use small, valid inputs that match the program’s expected stdin format.
- Outputs must be exactly as they would appear when the program is executed.

[Formatting]
- When explaining: use lists, short paragraphs, and avoid redundant text.
- When outputting code: do NOT use markdown fences (\`\`\`), just plain text.

[Restrictions]
- Never generate malicious, unsafe, or unrelated content.
- Never fabricate input/output examples inconsistent with the code logic.
`
});

const reviewModel = genAI.getGenerativeModel({
  model: "gemini-2.5-pro",
  systemInstruction: `
You are a professional Competitive Programming Code Reviewer.

[Role & Behavior]
- Your role is to review a user's submitted solution and provide structured, constructive feedback.
- Evaluate correctness, efficiency, edge cases, readability, and adherence to competitive programming standards.
- Do not rewrite the entire code unless explicitly asked.
- Keep the tone professional, concise, and objective.

[Review Format]
Your review must include these sections:
1. **Correctness** – Does the solution logically produce correct results for all test cases?
2. **Time & Space Complexity** – Analyze the complexity and mention if it can be optimized.
3. **Edge Cases** – Identify potential missing or failing scenarios.
4. **Code Quality** – Mention issues like naming, readability, unnecessary steps, or redundant variables.
5. **Suggestions** – Provide only the necessary improvements or optimizations.

[Example Review Style]
✅ **Correctness:** Works for basic and standard cases.  
⚠️ **Edge Cases:** May fail when the input array is empty or has negative numbers.  
💡 **Optimization:** Can reduce nested loops to O(n) using a hash map.  
🧩 **Code Quality:** Variable names are clear; logic flow is simple.  
✨ **Suggestion:** Consider early returns for better readability.

[Rules & Restrictions]
- Never output full rewritten code unless the user explicitly asks.
- Do not use markdown fences or formatting like \`\`\`.
- Avoid personal comments or non-technical opinions.
- If the code is perfect, clearly state: “The solution is correct and efficient.”

[Output Style]
- Always use bullet points or short paragraphs.
- Keep the feedback concise but technically precise.
`
});

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction: `
You are an expert competitive programming assistant. Always follow these rules strictly:

[Code Generation Rules]
- When given partial logic or a function, generate a complete runnable program in the specified language.
- The program must:
  - Read all inputs from standard input (stdin).
  - Parse input exactly as competitive programming platforms expect.
  - Print ONLY the final required output. No debug statements.
  - Do NOT include built-in test cases or hardcoded examples.
  - Return code without markdown fences or explanations.
`
});

const testModel = genAI.getGenerativeModel({
  model: "gemini-2.5-pro",
  systemInstruction: `
You are an expert competitive programming assistant. Always follow these rules strictly:

[Test Case Generation Rules]
- Generate ONLY valid JSON.
- JSON format must be an array of objects: [{"input": "...", "expected_output": "..."}].
- No markdown, no text before/after, no headings, no comments.
- Test cases must exactly match stdin parsing in the program.
`
});

editorRouter.post("/api/chat",async(req,res)=>{
  const {message,code, chatHistory} = req.body;
  console.log("Chat message received:", message);
  console.log("Code context:", code);
  try {
    const chats = chatModel.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: `Here is the code:\n${code}` }],
        },
      ],
    });
    
    const result = await chats.sendMessage(message);
    const ai_result = result.response.text();

    res.status(200).json({reply:ai_result});

    
  } catch (error) {
    console.error("Chat Error:", error.message);
    res.status(500).json({ error: "Failed to get chat response" });
    
  }

});

editorRouter.post("/api/run-full", async (req, res) => {
  const { logicCode, language } = req.body;

  console.log("Received logic code for full run:", logicCode);

  try {

    const codeResult = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: `Convert this ${language} function logic into a complete runnable program that reads input from stdin and prints only the final result:\n\n${logicCode}` }] }],
    });
    let fullCode = codeResult.response.text().replace(/```[a-z]*|```/g, "").trim();

    console.log("Generated full code:", fullCode);

    const testResult = await testModel.generateContent({
      contents: [{ role: "user", parts: [{ text: `Generate 3-5 diverse test cases for this ${language} program. Code: ${fullCode}` }] }],
    });
    let testCases = testResult.response.text().replace(/```json|```/g, "").trim();
    testCases = JSON.parse(testCases);
    console.log("Generated test cases:", testCases);

    const languageMap = { javascript: 63, python: 71, cpp: 54, java: 62 };
    const JUDGE0_API_URL = "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true";
    const results = await Promise.all(
      testCases.map(async (tc) => {
        const runRes = await axios.post(`${JUDGE0_API_URL}`, {
          source_code: fullCode,
          language_id: languageMap[language],
          stdin: tc.input,
        }, {
          headers: {
            "Content-Type": "application/json",
            "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
            "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
          }
        });
        console.log("Run result for input:", tc.input, runRes.data);
         const output = runRes.data.stdout
          ? runRes.data.stdout.trim()
          : runRes.data.stderr || runRes.data.compile_output || "";
        return {
          input: tc.input,
          expected: tc.expected_output,
          output,
          passed: String(output).trim() === String(tc.expected_output).trim()
        };
      })
    );
    console.log("Test results:", results);

    res.status(200).json({ fullCode, testCases, results });

  } catch (err) {
    console.error(err);
    console.error("Full run error:", err.message);
    res.status(500).json({ error: "Failed to run full flow" });
  }
});


editorRouter.post("/api/generate-code", async (req, res) => {
  const { logicCode, language } = req.body;
  console.log("Received logic code:", logicCode);

  try {
    const prompt = `
    You are an expert competitive programmer.
    I will give you a ${language} function body (logic only) for a DSA problem.
    Wrap it into a complete, runnable program:
    - Add necessary imports
    - Add input handling (read from stdin)
    - Add output printing
    - Keep the function name the same
    - Do not change the algorithm logic

    Logic code:
    ${logicCode}
    `;

    const result = await model.generateContent(prompt);
    var fullCode = result.response.text();

    fullCode = fullCode.replace(/```[\s\S]*?```/g, (match) => {
      return match.replace(/```[a-zA-Z]*\n?/, "").replace(/```/, "");
    }).trim();

    console.log("Generated full code:", fullCode);

    res.status(200).json({ fullCode });
  } catch (err) {
    console.error("Gemini Error:", err.message);
    res.status(500).json({ error: "Failed to generate code" });
  }
});

editorRouter.post("/api/generate-test-inputs", async (req, res) => {
  const { logicCode, language } = req.body;

  const prompt = `
  Based on the following ${language} function logic:
  ${logicCode}

  Generate 4-6 diverse input strings for stdin testing.
  Include edge cases, normal cases, and one large input.
  Only return a JSON array of strings, like:
  [
    "4\\n2 7 11 15\\n9",
    "5\\n1 2 3 4 5\\n10"
  ]
  `;

  try {
    const result = await model.generateContent(prompt);
    let jsonText = result.response.text().replace(/```json|```/g, "").trim();
    const testInputs = JSON.parse(jsonText);
    res.status(200).json({ testInputs });
  } catch (err) {
    console.error("Test input generation error:", err.message);
    res.status(500).json({ error: "Failed to generate test inputs" });
  }
});

editorRouter.post("/api/run-code", async (req, res) => {
  const { fullCode, languageId, input } = req.body;

  try {
    const response = await axios.post(
      "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true",
      {
        source_code: fullCode,
        language_id: languageId,
        stdin: input
      },
      {
        headers: {
          "content-type": "application/json",
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com"
        }
      }
    );

    console.log("Execution result:", response.data);

    res.status(200).json(response.data);
  } catch (err) {
    console.error("Judge0 Error:", err.message);
    res.status(500).json({ error: "Code execution failed" });
  }
});

editorRouter.post("/api/review-code", async (req,res)=>{
  const {code,language} = req.body;
  console.log("Code review request received");
  try {
    const review = await reviewModel.generateContent({
      contents: [{ role: "user", parts: [{ text: `Please review this ${language} logic code:\n\n${code}` }] }],
    });
    const reviewText = review.response.text();
    res.status(200).json({review:reviewText});
  } catch (error) {
    console.error("Review Error:", error.message);
    res.status(500).json({ error: "Failed to review code" });
  }
});

export default editorRouter;
