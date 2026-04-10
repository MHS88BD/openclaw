# 📝 Project Analysis: OpenClaw AI (WhatsApp & Telegram)
**Status:** ✅ Stable & Production Ready
**Last Updated:** 2026-04-10

## 🎯 Overview
OpenClaw AI একটি মাল্টি-চ্যানেল অটোমেশন বট যা হোয়াটসঅ্যাপ এবং টেলিগ্রামের মাধ্যমে কন্ট্রোল করা যায়। এটি মূলত ব্যক্তিগত সহকারী, গ্রুপ ম্যানেজমেন্ট এবং স্মার্ট ব্রডকাস্টিংয়ের জন্য ডিজাইন করা হয়েছে।

## ✨ Accomplished Features (সম্পন্নকৃত কাজসমূহ)

### 1. WhatsApp Connectivity (Baileys v2)
- **Pairing Code Auth:** QR কোড স্ক্যানিং ঝামেলা এড়াতে ফোন নম্বর ও পেয়ারিং কোড সিস্টেম।
- **Multi-File State:** সেশন পারসিস্টেন্স নিশ্চিত করা হয়েছে (সার্ভার রিস্টার্ট দিলেও লগআউট হবে না)।
- **Mac OS Identity:** হোয়াটসঅ্যাপ থেকে ব্যান এড়াতে ব্রাউজার আইডেন্টিটি কাস্টমাইজ করা হয়েছে।

### 2. Smart Auto-Reply (Human-Like AI)
- **Context Awareness:** AI (GPT-4o/Gemini) ব্যবহার করে মেসেজ প্রসেসিং।
- **Toggle Control:** প্রতি চ্যাটের জন্য আলাদাভাবে অটো-রিপ্লাই অন/অফ করার ক্ষমতা।
- **Human Delay:** ৫-১২ সেকেন্ডের র‍্যান্ডম ডিলে লজিক (Anti-Ban)।
- **Stealth Mode:** গ্রুপে কমান্ড দিলে মেসেজ অটো-ডিলিট হয় এবং ফিডব্যাক পার্সোনাল ইনবক্সে আসে।

### 3. Group Management Tools
- **Member Extraction:** গ্রুপ মেম্বারদের নম্বর এক্সেল ফরম্যাটে (`+CountryCode`) এক্সট্র্যাক্ট করা।
- **Privacy ID Support:** প্রাইভেসি প্রোটেক্টড মেম্বারদের (LID) সাথেও যোগাযোগের ব্যবস্থা।
- **ID Lookup:** যেকোনো হোয়াটসঅ্যাপ অ্যাকাউন্টের অস্তিত্ব এবং JID চেক করা।

### 4. Smart Broadcasting System
- **Batch Processing:** একসাথে অনেককে মেসেজ না পাঠিয়ে ব্যাচ আকারে (যেমন ১০ জন করে) পাঠানোর সিস্টেম।
- **Safe Delays:** প্রতিটি মেসেজের মাঝে ১০-২৫ সেকেন্ডের বিরতি।
- **Uniqueness:** মেসেজ ট্র্যাকিং এড়াতে ইনভিজিবল টোকেন যোগ করা।

### 5. Utilities & Logs
- **Unread Tracker:** আনপঠিত মেসেজগুলোর লিস্ট দেখা এবং ওখান থেকেই রিপ্লাই দেওয়া।
- **Voice Transcription:** ভয়েস মেসেজকে টেক্সটে রূপান্তর করে AI এর মাধ্যমে উত্তর দেওয়া।
- **Centralized Logging:** প্রতিটি অ্যাকশনের বিশদ লগ রাখা।

## 📊 Current Statistics
- **Platform Support:** WhatsApp, Telegram.
- **AI Engines:** OpenAI GPT-4o, Google Gemini 1.5 Flash.
- **Node.js Environment:** Linux/Ubuntu VPS with PM2.
