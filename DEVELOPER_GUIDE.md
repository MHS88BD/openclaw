# 🛠 Developer Guide: Future Development & Architecture
**Project:** OpenClaw AI
**Version:** 1.8.0-Stable

## 🏗 System Architecture
প্রজেক্টটি মডুলার আর্কিটেকচারে তৈরি করা হয়েছে যাতে ভবিষ্যতে নতুন ফিচার যোগ করা সহজ হয়।

### Key Directories & Files:
- `whatsapp.js`: হোয়াটসঅ্যাপ কানেকশন এবং মেসেজ ইভেন্ট লিসেনার।
- `bot.js`: টেলিগ্রাম কানেকশন এবং মেইন বুটস্ট্র্যাপ।
- `src/messageHandler.js`: **সবচেয়ে গুরুত্বপূর্ণ ফাইল!** এখানে সব প্লাটফর্মের মেসেজ প্রসেস হয় এবং কমান্ড লজিক থাকে।
- `src/aiEngine.js`: OpenAI এবং Gemini কানেক্টিভিটি।
- `src/autoReplyManager.js`: অটো-রিপ্লাই স্টেট (ID normalization সহ)।
- `src/groupUtils.js`: গ্রুপ এক্সট্রাকশন এবং ব্রডকাস্টিং লজিক।

## 🚀 Where to Start for Future Updates?

### 1. Adding a New Command
- `src/messageHandler.js` ফাইলে যান।
- `processMessage` ফাংশনের ভিতরে নতুন একটি `if (cmdBody.startsWith('...'))` ব্লক যোগ করুন।
- মালিকানা নিশ্চিত করতে `isOwner` ফ্ল্যাগ চেক করুন।

### 2. Changing AI Logic or System Prompt
- `src/aiEngine.js` ফাইলে `askOpenAI` ফাংশনের ভিতরে `systemPrompt` ভেরিয়েবলটি আপডেট করুন।
- কোনো নতুন "System Call" বা "Function" যোগ করতে চাইলে `tools` অ্যারেতে তা ডিফাইন করুন।

### 3. Adding Support for Images/Media
- বর্তমানে শুধুমাত্র টেকস্ট এবং অডিও সাপোর্ট আছে।
- `whatsapp.js` এর `messages.upsert` লিসেনারে `imageMessage` বা `videoMessage` চেক করে ডাউনলোড লজিক যোগ করতে হবে।

## 🛡 Security & Maintenance
- **API Keys:** সব কী `.env` ফাইলে রাখা হয়েছে। নতুন কী যোগ করলে ওখানে এন্ট্রি দিন।
- **Logs:** PM2 ব্যবহার করে সার্ভারে লগ দেখুন: `pm2 logs ai-bot`.
- **Ban Prevention:** হোয়াটসঅ্যাপে নতুন ফিচার যোগ করার সময় সবসময় `random delay` এবং `unique tokens` ব্যবহার করুন (রেফারেন্স: `src/groupUtils.js` এর ব্রডকাস্ট লজিক)।

## 📦 Deployment Workflow
১. লোকাল মেশিনে কোড চেঞ্জ করুন।
২. সরাসরি পুশ স্ক্রিপ্ট ব্যবহার করুন: `./push_whatsapp.sh`. 
৩. এটি অটোমেটিক সার্ভারে কোড পাঠিয়ে PM2 রিস্টার্ট দিবে।
