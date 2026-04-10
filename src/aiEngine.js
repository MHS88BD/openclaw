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
You act as a personal automation assistant and financial architect.
Current Time (Bangladesh): ${bstString} (BST)

You can perform actions by outputting system function calls.

1. **Finance Extraction**: When you see a message that looks like a bank transaction, SMS, or receipt:
- CALL 'process_finance'.
- Identify the 'merchant' (e.g. Foodpanda, Uber, Amazon, local shop name).
- Extract the precise 'amount'.
- The full original text will be saved as a note.

2. **Scheduling**: If the user wants a reminder, call 'schedule_action'.
3. **Research**: If the user asks for information or data, call 'research_web'.

Always reply naturally in the language used (Bengali/English) unless a system call is triggered. 
For finance commands, be concise and professional.`;

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
                        merchant: { type: "string" },
                        date: { type: "string" },
                        category: { type: "string" },
                        description: { type: "string" }
                    },
                    required: ["amount", "bank", "merchant"]
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
                description: "Schedule a reminder for the sender or a specific message to be sent to someone else at a particular time.",
                parameters: {
                    type: "object",
                    properties: {
                        target_time: { type: "string", description: "The time to schedule the action. Must be in the format 'YYYY-MM-DD HH:mm'." },
                        message: { type: "string", description: "The message content to be sent." },
                        target_phone: { type: "string", description: "Optional: The phone number of the person to receive the message (if not the sender). E.g. '8801700000000'." }
                    },
                    required: ["target_time", "message"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "send_whatsapp_message",
                description: "Send a WhatsApp message directly to a specific phone number or group ID.",
                parameters: {
                    type: "object",
                    properties: {
                        phone_number: { type: "string", description: "The target phone number (e.g. '8801700000000') OR a Group ID (e.g. '12345@g.us')." },
                        message: { type: "string", description: "The message content to send." }
                    },
                    required: ["phone_number", "message"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "get_unread_messages",
                description: "Fetch a list of all unread WhatsApp messages with index numbers."
            }
        },
        {
            type: "function",
            function: {
                name: "reply_to_unread",
                description: "Reply to an unread message from the unread list using its index number.",
                parameters: {
                    type: "object",
                    properties: {
                        index: { type: "string", description: "The index number from the unread list (e.g. '1')." },
                        message: { type: "string", description: "The reply message content." }
                    },
                    required: ["index", "message"]
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
                    return `INTERNAL_FINANCE:${JSON.stringify(args)}`;
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
                if (tool.function.name === 'get_unread_messages') {
                    return `INTERNAL_UNREAD_LIST`;
                }
                if (tool.function.name === 'reply_to_unread') {
                    return `INTERNAL_UNREAD_REPLY:${tool.function.arguments}`;
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
