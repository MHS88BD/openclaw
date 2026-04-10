# 🛠 OpenClaw AI System - Technical Documentation

This document serves as a technical reference for the architecture and implementation details of the OpenClaw Multi-Channel AI System.

## 🏗 System Architecture
- **Language:** Node.js
- **WhatsApp Engine:** `@whiskeysockets/baileys` (Multi-device support)
- **Telegram Engine:** `telegraf`
- **Session Management:** Multi-file authentication stored in `/auth`
- **Process Manager:** PM2 (running with `xvfb-run` for headless support if needed)

## 📡 WhatsApp Socket Logic (`whatsapp.js`)
- **Pairing Code Support:** Implemented as a primary/fallback method to bypass QR scan failures and "Can't link device" errors.
- **Identity Masking:** Socket is configured to identify as `Mac OS / Chrome` to reduce detection by WhatsApp's anti-bot mechanisms.
- **Connectivity:** 
  - `markOnlineOnConnect: true`
  - Connection backoff logic implemented for reconnection (max 5 attempts with delay).
  - Cleaned duplicate event listeners to prevent loop-backs.

## 🛡 Anti-Ban Broadcast Mechanism
To protect the account from being flagged as a spammer, the `broadcastToGroup` function (`src/groupUtils.js`) implements:
1. **Randomized Delays:** 10 to 25 seconds interval between each message.
2. **Text Fingerprint Variation:** Appends an invisible `\u200B` (Zero Width Space) and a random alphanumeric string to the end of every message, making each message content unique to automated filters.
3. **Batching:** Enforces offset (`--s`) and count (`--c`) parameters to encourage users to send in small bursts rather than thousands at once.

## 🔍 Data Handling & Normalization
- **Owner Identification:** Centralized in `src/messageHandler.js`. Normalizes both Phone JIDs and LIDs (Linked Identities) by stripping suffixes and device markers (`:1`, `:2`).
- **LID Filtering:** Group extraction (`src/groupUtils.js`) identifies `@lid` suffixes and separates them from `@s.whatsapp.net` (JID) members for user clarity.
- **Excel Formatting:** All extracted contacts are prefixed with `+` and stripped of indexing to allow direct TSV/CSV compatibility.

## 📁 Project Structure Highlights
- `/whatsapp.js`: Socket management & Raw event filtering.
- `/bot.js`: Entry point for concurrent platform startup.
- `/src/messageHandler.js`: Central command routing & security checks.
- `/src/groupUtils.js`: Group metadata fetching and broadcast operations.

---
**Maintained by:** Antigravity (AI Lead Engineer)
**Last Major Update:** 2026-04-10 (WhatsApp Stability & Bulk Tools)
