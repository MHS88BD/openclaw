const axios = require('axios');
require('dotenv').config({path: '/root/ai-bot/.env'});

async function testKeys() {
    let openaiKey = process.env.OPENAI_API_KEY || "";
    // Attempt auto-fix for missing hyphen in sk-proj
    if (openaiKey.startsWith("sk-proj") && openaiKey.charAt(7) !== "-") {
        openaiKey = "sk-proj-" + openaiKey.substring(7);
        console.log("FIXED OPENAI KEY FORMAT IN MEMORY applied hyphen");
    }

    try {
        const res = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', messages: [{role: 'user', content: 'hi'}]
        }, { headers: { 'Authorization': `Bearer ${openaiKey}` }});
        console.log('OpenAI API Status: OK (' + res.status + ')');
    } catch(e) {
        console.error('OpenAI Error:', e.response?.data?.error?.message || e.message);
    }

    try {
        const res2 = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            contents: [{parts:[{text: 'hi'}]}]
        });
        console.log('Gemini API Status: OK (' + res2.status + ')');
    } catch(e) {
        console.error('Gemini Error:', e.response?.data?.error?.message || e.message);
    }
}
testKeys();
