# Chat Extractor

Extract chat conversations from DeepSeek and ChatGPT sessions to nicely formatted text files.

## How It Works

1. Reads cookies from your **running Firefox browser** (no need to close it)
2. Copies the cookie database and extracts session tokens (DeepSeek or ChatGPT)
3. Launches a fresh Firefox instance with those cookies injected
4. Navigates to your chat URL and scrapes the conversation
5. Outputs a formatted `.txt` file with user/AI message pairs

## Supported Platforms

- **DeepSeek** (`extract-chat.js`)
- **ChatGPT** (`extract-chatgpt.js`)

## Requirements

- **Node.js** (v16+)
- **Firefox** browser (with an active session on the target platform)
- **Linux** (tested on Linux, may work on macOS with path adjustments)

## Installation

```bash
npm install
```

### For ChatGPT - Browser Console Method (Recommended)

If you're hitting Cloudflare issues with the Selenium script, use this alternative method:

1. Go to [chat.openai.com](https://chat.openai.com/)
2. Open Developer Tools: Press `F12` or `Cmd+Option+I` (Mac)
3. Click on the **Console** tab
4. Copy and paste the contents of `extract-chatgpt-console.js` into the console
5. Press **Enter**

The script will automatically:
- Detect and extract all chat messages from the current page
- Download a formatted `.txt` file with the conversation
- Copy the content to your clipboard

**Note:** You must be on a conversation page for this to work.

### Dependencies

- `selenium-webdriver` - Browser automation
- `geckodriver` - Firefox WebDriver
- `better-sqlite3` - Read Firefox's cookie database

## Important: Login Methods

**DeepSeek**: You must log in using email/phone, NOT Google OAuth.
- Google blocks Selenium-controlled browsers with: "This browser or app may not be secure"
- If you're currently logged in via Google, log out and use email/phone login

**ChatGPT**: Standard login methods work, but ensure you have an active session in Firefox.

## Usage

### DeepSeek Chat Extraction

```bash
# Extract a specific chat
node extract-chat.js "https://chat.deepseek.com/a/chat/s/YOUR-CHAT-ID"

# Or use npm script
npm run extract:deepseek
```

### ChatGPT Chat Extraction

```bash
# Extract ChatGPT conversations
node extract-chatgpt.js "https://chat.openai.com/c/YOUR-CONVERSATION-ID"

# Or use npm script
npm run extract:chatgpt
```

### General Workflow

Both scripts will:
1. Copy cookies from your Firefox profile
2. Open a new Firefox window
3. Prompt you to confirm the page is loaded
4. Extract and save the conversation

## Firefox Profile

The script reads from the default Firefox profile location:

```
~/.mozilla/firefox/*.default-release/
```

### Required Cookie Files

These files are copied from your Firefox profile:

| File | Purpose |
|------|---------|
| `cookies.sqlite` | Main cookie database |
| `cookies.sqlite-wal` | Write-ahead log (recent cookies) |
| `cookies.sqlite-shm` | Shared memory file |

The script creates a temporary copy, reads the cookies, then deletes the copy.

## Output Format

**DeepSeek**: Extracted chats are saved as `deepseek_chat_TIMESTAMP.txt`

**ChatGPT**: Extracted chats are saved as `chatgpt_chat_TIMESTAMP.txt`

**DeepSeek format:**
```
╔══════════════════════════════════════════════════════════════╗
║                   DEEPSEEK CHAT EXTRACTION                    ║
╚══════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────┐
│  ◆ USER                                                      │
└──────────────────────────────────────────────────────────────┘
Your message here

┌──────────────────────────────────────────────────────────────┐
│  ◇ DEEPSEEK                                                  │
└──────────────────────────────────────────────────────────────┘
AI response here

   *.·:·.✧    ════════════════════════════════    ✧.·:·.*
```

**ChatGPT format:**
```
╔══════════════════════════════════════════════════════════════╗
║                    CHATGPT CHAT EXTRACTION                   ║
╚══════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────┐
│  ◆ USER                                                      │
└──────────────────────────────────────────────────────────────┘
Your message here

┌──────────────────────────────────────────────────────────────┐
│  ◇ CHATGPT                                                   │
└──────────────────────────────────────────────────────────────┘
AI response here

   *.·:·.✧    ════════════════════════════════    ✧.·:·.*
```

## Troubleshooting

### "No cookies found" (DeepSeek or ChatGPT)
- Make sure you're logged into the target platform in Firefox
- Check that the Firefox profile path is correct
- Verify you have an active session (not expired)

### Session not working / Redirected to login
- Your session may have expired - log in again in Firefox
- For DeepSeek: Make sure you used email/phone login, not Google OAuth

### "Could not copy cookies.sqlite"
- Firefox may have locked the file - try again in a few seconds

### No messages extracted
- Check if the page loaded completely in the browser window
- Verify you're on a conversation page, not the main chat interface
- Some ChatGPT conversations may have different HTML structures

### Cloudflare Captcha Issues (ChatGPT)
ChatGPT frequently uses Cloudflare protection. Here are solutions:

**Automatic Handling:**
- The script detects Cloudflare and waits for resolution
- It provides prompts for manual captcha solving when needed

**Manual Solutions:**
1. **Wait it out** - Cloudflare may resolve automatically in 10-60 seconds
2. **Solve manually** - Complete the captcha in the browser window
3. **Try multiple times** - Run the script several times
4. **VPN** - Use a VPN if your IP is flagged
5. **Browser profile** - Try a different Firefox profile
6. **Timing** - Run during off-peak hours when protection is lighter

**Prevention:**
- Log into ChatGPT in Firefox regularly (creates browsing history)
- Use the same IP address consistently
- Avoid running the script too frequently (rate limiting)

## Configuration

Edit the appropriate script to change the Firefox profile path:

**DeepSeek (`extract-chat.js`):**
```javascript
const FIREFOX_PROFILE = path.join(os.homedir(), ".mozilla/firefox/YOUR-PROFILE.default-release");
```

**ChatGPT (`extract-chatgpt.js`):**
```javascript
const FIREFOX_PROFILE = path.join(os.homedir(), ".mozilla/firefox/YOUR-PROFILE.default-release");
```

Find your profile name:
```bash
ls ~/.mozilla/firefox/
```

## License

ISC
