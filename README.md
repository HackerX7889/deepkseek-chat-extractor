# DeepSeek Chat Extractor

Extract your DeepSeek chat conversations to a nicely formatted text file.

## How It Works

1. Reads cookies from your **running Firefox browser** (no need to close it)
2. Copies the cookie database and extracts DeepSeek session tokens
3. Launches a fresh Firefox instance with those cookies injected
4. Navigates to your chat URL and scrapes the conversation
5. Outputs a formatted `.txt` file with user/AI message pairs

## Requirements

- **Node.js** (v16+)
- **Firefox** browser (with an active DeepSeek session)
- **Linux** (tested on Linux, may work on macOS with path adjustments)

## Installation

```bash
npm install
```

### Dependencies

- `selenium-webdriver` - Browser automation
- `geckodriver` - Firefox WebDriver
- `better-sqlite3` - Read Firefox's cookie database

## Important: Login Method

**You must log into DeepSeek using email/phone, NOT Google OAuth.**

Google blocks Selenium-controlled browsers with this error:
> "This browser or app may not be secure"

If you're currently logged in via Google, you'll need to:
1. Log out of DeepSeek
2. Create an account or log in using email/phone
3. Run the extractor

## Usage

```bash
# Extract a specific chat
node extract-chat.js "https://chat.deepseek.com/a/chat/s/YOUR-CHAT-ID"

# Or use npm script
npm run extract
```

The script will:
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

Extracted chats are saved as `deepseek_chat_TIMESTAMP.txt`:

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

## Troubleshooting

### "No DeepSeek cookies found"
- Make sure you're logged into DeepSeek in Firefox
- Check that the Firefox profile path is correct

### Session not working / Redirected to login
- Your session may have expired - log in again in Firefox
- Make sure you used email/phone login, not Google

### "Could not copy cookies.sqlite"
- Firefox may have locked the file - try again in a few seconds

## Configuration

Edit `extract-chat.js` to change the Firefox profile path:

```javascript
const FIREFOX_PROFILE = path.join(os.homedir(), ".mozilla/firefox/YOUR-PROFILE.default-release");
```

Find your profile name:
```bash
ls ~/.mozilla/firefox/
```

## License

ISC
