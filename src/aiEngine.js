const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function askGemini(prompt) {
    try {
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (err) {
        console.error("Gemini Error:", err);
        throw err;
    }
}

async function askOpenAI(query) {
    // Get current time in Bangladesh (BST - UTC+6)
    const now = new Date();
    const bstTime = new Date(now.getTime() + (6 * 60 * 60 * 1000));
    const bstString = bstTime.toISOString().replace('T', ' ').substring(0, 16);

    const systemPrompt = `You are Antigravity AI Command Center.
You act as a personal automation assistant. 
Current Time (Bangladesh): ${bstString} (BST)

You can perform actions by outputting system function calls.
If the user wants you to do finance accounting from SMS, call 'process_finance'.
If the user wants web research, call 'research_web'.
If the user wants you to schedule a reminder or action, call 'schedule_action'.
IMPORTANT: When scheduling, use the Current Time provided above to calculate the 'target_time'.
Always return the 'target_time' in 'YYYY-MM-DD HH:mm' format.

If the user wants something normal, just reply naturally in the language they used (e.g. Bengali or English).`;

    const tools = [
        {
            type: "function",
            function: {
                name: "process_finance",
                description: "Extract finance data from SMS and send to accounting workflow.",
                parameters: {
                    type: "object",
                    properties: {
                        amount: { type: "number" },
                        bank: { type: "string" },
                        date: { type: "string" },
                        category: { type: "string" },
                        description: { type: "string" }
                    },
                    required: ["amount", "bank"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "research_web",
                description: "Perform an online search or get live market data.",
                parameters: {
                    type: "object",
                    properties: {
                        search_topic: { type: "string" }
                    },
                    required: ["search_topic"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "schedule_action",
                description: "Schedule a reminder or a specific message to be sent back to the user at a particular time.",
                parameters: {
                    type: "object",
                    properties: {
                        target_time: { type: "string", description: "The time to schedule the action. Must be in the format 'YYYY-MM-DD HH:mm'." },
                        message: { type: "string", description: "The reminder text or task to send to the user." }
                    },
                    required: ["target_time", "message"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "send_whatsapp_message",
                description: "Send a WhatsApp message directly to a specific phone number.",
                parameters: {
                    type: "object",
                    properties: {
                        phone_number: { type: "string", description: "The target phone number with country code. E.g. '8801700000000'." },
                        message: { type: "string", description: "The message content to send." }
                    },
                    required: ["phone_number", "message"]
                }
            }
        }
    ];

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: query }
            ],
            tools: tools,
            tool_choice: "auto"
        });

        const msg = response.choices[0].message;

        if (msg.tool_calls) {
            for (const tool of msg.tool_calls) {
                if (tool.function.name === 'process_finance') {
                    const args = JSON.parse(tool.function.arguments);
                    // Hit n8n webhook
                    const webhookUrl = process.env.N8N_FINANCE_WEBHOOK || "https://automation.dupno.com/webhook/finance";
                    try {
                        await axios.post(webhookUrl, args);
                        return `✅ Finance data saved! Bank: ${args.bank}, Amount: ${args.amount}, Category: ${args.category || 'N/A'}`;
                    } catch (err) {
                        return `⚠️ Error triggering n8n webhook: ${err.message}`;
                    }
                }
                if (tool.function.name === 'research_web') {
                    const args = JSON.parse(tool.function.arguments);
                    // Temporarily replying natively for search
                    return `🔍 [Research Mode] You asked to search for: "${args.search_topic}". (Web scraping module is ready for integration).`;
                }
                if (tool.function.name === 'schedule_action') {
                    return `INTERNAL_SCHEDULE:${tool.function.arguments}`; // We will parse this in messageHandler.js
                }
                if (tool.function.name === 'send_whatsapp_message') {
                    return `INTERNAL_WHATSAPP_SEND:${tool.function.arguments}`;
                }
            }
        }

        return msg.content;
    } catch (error) {
        console.error('OpenAI Error:', error.message);
        throw error;
    }
}

async function processCommand(query, platform) {
    // Force OpenAI primary since we need tools for reminders
    try {
        return await askOpenAI(query);
    } catch (openaiErr) {
        console.error("OpenAI failed:", openaiErr.message);
        // Fallback to Gemini if OpenAI fails
        try {
            return await askGemini(query);
        } catch (err) {
            return "⚠️ Error connecting to AI Command Center. Both OpenAI and Gemini systems failed.";
        }
    }
}

module.exports = { processCommand };
