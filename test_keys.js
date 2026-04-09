require('dotenv').config();
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function run() {
    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: "hi" }]
        });
        console.log("OpenAI success:", res.choices[0].message.content);
    } catch(e) {
        console.log("OpenAI error:", e.message);
    }
}
run();
