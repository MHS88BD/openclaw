# 🛠 Developer Guide: Future Development & Architecture
**Project:** OpenClaw AI
**Version:** 1.9.0-REST-API

## 🏗 System Architecture
প্রজেক্টটি মডুলার আর্কিটেকচারে তৈরি করা হয়েছে যাতে ভবিষ্যতে নতুন ফিচার যোগ করা সহজ হয়।

### Key Directories & Files:
- `whatsapp.js`: হোয়াটসঅ্যাপ কানেকশন এবং মেসেজ ইভেন্ট লিসেনার।
- `bot.js`: টেলিগ্রাম কানেকশন, এক্সপ্রেস ওয়েবহুক সার্ভার (Port 3000) এবং মেইন বুটস্ট্র্যাপ।
- `src/messageHandler.js`: **সিস্টেমের হার্ট!** এখানে ম্যাপিং, লার্নিং রুলস এবং কমান্ড লজিক থাকে।
- `src/aiEngine.js`: ফিন্যান্সিয়াল ডাটা এক্সট্রাকশন এবং টুল হ্যান্ডলিং।
- `src/budgetApi.js`: সরাসরি BudgetBakers REST API এর সাথে যোগাযোগ।
- `src/accountMemory.js`: `account_map.json` এর মাধ্যমে ব্যাংক একাউন্ট ম্যাপিং ম্যানেজমেন্ট।
- `src/merchantMemory.js`: `merchant_map.json` এর মাধ্যমে ক্যাটাগরি লার্নিং সিস্টেম।

## 🚀 Bookkeeping Engine (New)
সিস্টেমটি এখন ব্রাউজার অটোমেশন ছাড়াই সরাসরি এপিআই এর মাধ্যমে ডাটা এন্ট্রি দেয়।
- **Smart Mapping:** ইউজার যখন কোনো একাউন্ট চুজ করে, বট তা `account_map.json` এ সেভ করে রাখে।
- **Learning Flow:** `ai account rule` কমান্ডের মাধ্যমে ইউজার সরাসরি ডাটাবেজ আপডেট করতে পারে।
- **Webhook Source:** n8n থেকে আসা ডাটা `POST /api/expense` এন্ডপয়েন্টে রিসিভ হয়।

## 🛡 Security & Secrets
- **BB_TOKEN:** বাজেট-বেকারস এপিআই টোকেন `.env` ফাইলে সুরক্ষিত আছে।
- **Strict Mode:** কোডটি কোনো অবস্থাতেই নতুন ক্যাটাগরি বা একাউন্ট তৈরি করবে না (ফেইল সেফ ডিজাইন)।

## 📦 Deployment Workflow
১. লোকাল মেশিনে কোড চেঞ্জ করুন।
২. সরাসরি পুশ স্ক্রিপ্ট ব্যবহার করুন: `./push_whatsapp.sh`. 
৩. এটি অটোমেটিক সার্ভারে কোড পাঠিয়ে PM2 রিস্টার্ট দিবে।
