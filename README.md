# 🌸 Curliflower

**Curliflower** is a premium cross-platform desktop application designed for high-performance network request automation. It allows users to manage, automate, and monitor multiple `fetch()` and `cURL` commands with ease, specifically featuring automatic execution on system startup.

[![Korean README](https://img.shields.io/badge/Language-Korean-blue)](README_ko.md)

---

## ✨ Key Features

- **Bulk Request Management**: Paste multiple commands at once and let our smart parser handle the complexity.
- **System Startup Automation**: Automatically triggers your request queue as soon as your computer starts.
- **Smart Formatting**: Advanced support for Chrome and Safari-style cURL commands (automatically handles flags like `--data-raw`).
- **Sequential Execution**: Requests are processed one-by-one with a 5-second delay to ensure reliability and bypass rate limits.
- **Real-time Monitoring**: Integrated log viewer to track status codes, response data, and execution duration.
- **Custom Labels (Memos)**: Add personalized memos to your requests for better organization.
- **Premium UI/UX**: Modern dark-themed interface with glassmorphism and smooth animations.

---

## 📅 Event Kiki Auto Check-in Guide

Follow these steps to automate daily attendance on Event Kiki or similar event pages:

![Event Kiki Guide Screenshot](guide.png)

### 🔍 Step 1: Extract Network Request (Chrome)
1. Open your browser and press **F12** to open Developer Tools.
2. Go to the **Network** tab and filter for `pick` (or `checklog` if you already checked in).
3. Click the event button (e.g., Click!, Spin) on the website.
4. Right-click the filtered request and select **Copy** -> **Copy as cURL**.

### 📝 Step 2: Modify Command
5. Paste the content into a text editor.
6. If you copied `checklog`, change that word in the URL to `pickrwd`.
7. Copy the entire modified string.

### 🚀 Step 3: Register in Curliflower
8. Open **Curliflower** and click **+ Add Request**.
9. Paste your command and add a memo (e.g., "Event Kiki Daily").
10. Click **Add to Queue** and test it with the **Run** button.
11. Enable **Launch at Startup** in the sidebar for daily automation.

---

## 💻 Development & Build

### Development
```bash
npm install
npm start
```

### Build (Windows & macOS)
```bash
npm run build
```

---

## ⚖️ Credits & Copyright

- **Developed by**: [krazyeom](https://github.com/krazyeom) & **그래염 (LTC)**
- **LTC Community**: [https://cafe.naver.com/hexenyang](https://cafe.naver.com/hexenyang)

---
*Made with ❤️ by krazyeom & 그래염*
