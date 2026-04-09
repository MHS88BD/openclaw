const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeAudio(buffer) {
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const inputPath = path.join(tempDir, `audio_${Date.now()}.ogg`);
    const outputPath = path.join(tempDir, `audio_${Date.now()}.mp3`);

    fs.writeFileSync(inputPath, buffer);

    try {
        // Convert OGG/Opus to MP3 for better compatibility with Whisper API
        // requires ffmpeg to be installed on VPS
        await new Promise((resolve, reject) => {
            exec(`ffmpeg -i ${inputPath} ${outputPath}`, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(outputPath),
            model: "whisper-1",
        });

        // Cleanup
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        return transcription.text;
    } catch (error) {
        console.error("Transcription Error:", error);
        // Cleanup on failure
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw error;
    }
}

module.exports = { transcribeAudio };
