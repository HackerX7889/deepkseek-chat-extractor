#!/usr/bin/env node

const { Builder, By, until } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Config
const CHAT_URL = process.argv[2] || "https://chat.deepseek.com/a/chat/s/0a3ba0f9-69b8-45dd-91fa-5a689ba34fdd";
const FIREFOX_PROFILE = path.join(os.homedir(), ".mozilla/firefox/w8ymqkg0.default-release");
const TEMP_DIR = path.join(__dirname, ".tmp_cookies");

// Cool separators
const SEPARATORS = {
  divider: `

   *.·:·.✧    ════════════════════════════════    ✧.·:·.*

`,
  header: `
╔══════════════════════════════════════════════════════════════╗
║                   DEEPSEEK CHAT EXTRACTION                    ║
║                     ${new Date().toLocaleString().padEnd(38)}║
╚══════════════════════════════════════════════════════════════╝

`,
  userStart: `┌──────────────────────────────────────────────────────────────┐
│  ◆ USER                                                      │
└──────────────────────────────────────────────────────────────┘
`,
  aiStart: `┌──────────────────────────────────────────────────────────────┐
│  ◇ DEEPSEEK                                                  │
└──────────────────────────────────────────────────────────────┘
`,
  footer: `
╔══════════════════════════════════════════════════════════════╗
║                       END OF CHAT                             ║
║                   Total Exchanges: {{COUNT}}                  ║
╚══════════════════════════════════════════════════════════════╝
`,
};

function readCookiesFromFirefox() {
  console.log("Reading cookies from Firefox...\n");

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const cookieFiles = ["cookies.sqlite", "cookies.sqlite-wal", "cookies.sqlite-shm"];
  
  for (const file of cookieFiles) {
    const src = path.join(FIREFOX_PROFILE, file);
    const dest = path.join(TEMP_DIR, file);
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, dest);
        console.log(`  Copied: ${file}`);
      } catch (e) {
        console.log(`  Could not copy ${file}: ${e.message}`);
      }
    }
  }

  const Database = require("better-sqlite3");
  const dbPath = path.join(TEMP_DIR, "cookies.sqlite");
  
  const db = new Database(dbPath, { readonly: true });
  
  const cookies = db.prepare(`
    SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite
    FROM moz_cookies 
    WHERE host LIKE '%deepseek%'
  `).all();

  db.close();

  console.log(`\nFound ${cookies.length} DeepSeek cookies:`);
  cookies.forEach(c => console.log(`  - ${c.name} (${c.host})`));
  
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch (e) {}

  return cookies;
}

function convertToSeleniumCookie(mozCookie) {
  return {
    name: mozCookie.name,
    value: mozCookie.value,
    domain: mozCookie.host,
    path: mozCookie.path || '/',
    expiry: mozCookie.expiry || undefined,
    secure: !!mozCookie.isSecure,
    httpOnly: !!mozCookie.isHttpOnly,
  };
}

async function createDriverWithCookies(cookies) {
  console.log("\nStarting Firefox...");

  const options = new firefox.Options();
  options.setPreference("dom.webdriver.enabled", false);

  const driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .build();

  console.log("Navigating to DeepSeek to set cookies...");
  await driver.get("https://chat.deepseek.com/");
  await driver.sleep(2000);

  console.log("Injecting cookies...");
  let injected = 0;
  for (const cookie of cookies) {
    try {
      const seleniumCookie = convertToSeleniumCookie(cookie);
      delete seleniumCookie.expiry;
      await driver.manage().addCookie(seleniumCookie);
      injected++;
    } catch (e) {
      console.log(`  Failed: ${cookie.name} - ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`Injected ${injected}/${cookies.length} cookies`);

  return driver;
}

async function debugPage(driver) {
  console.log("\n=== DEBUG INFO ===");
  
  const info = await driver.executeScript(`
    return {
      url: window.location.href,
      title: document.title,
      bodyText: document.body.innerText.substring(0, 500),
      hasMarkdown: document.querySelectorAll('.ds-markdown').length,
      allClasses: [...new Set([...document.querySelectorAll('*')].map(e => e.className).filter(c => typeof c === 'string' && c.includes('message')))].slice(0, 10)
    };
  `);
  
  console.log(`URL: ${info.url}`);
  console.log(`Title: ${info.title}`);
  console.log(`Found .ds-markdown elements: ${info.hasMarkdown}`);
  console.log(`Message-related classes: ${JSON.stringify(info.allClasses)}`);
  console.log(`\nPage text preview:\n${info.bodyText}\n`);
  
  return info;
}

async function extractChatMessages(driver) {
  console.log("Extracting messages...\n");

  const data = await driver.executeScript(`
    const conversations = [];
    const seenAI = new Set();
    
    // Try multiple selectors for AI responses
    const selectors = [
      '.ds-markdown',
      '[class*="markdown"]',
      '[class*="message-content"]',
      '[class*="answer"]',
      '[class*="response"]'
    ];
    
    let aiBlocks = [];
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        console.log('Found with selector:', sel, found.length);
        aiBlocks = found;
        break;
      }
    }
    
    // If still nothing, get ALL significant text blocks
    if (aiBlocks.length === 0) {
      const allDivs = document.querySelectorAll('div');
      const textBlocks = [];
      allDivs.forEach(div => {
        const text = div.innerText?.trim();
        if (text && text.length > 50 && !div.querySelector('div')) {
          textBlocks.push({ el: div, text });
        }
      });
      return { 
        conversations: [], 
        debug: {
          totalDivs: allDivs.length,
          textBlocks: textBlocks.length,
          samples: textBlocks.slice(0, 3).map(t => t.text.substring(0, 100))
        }
      };
    }
    
    aiBlocks.forEach((aiEl) => {
      const aiText = aiEl.innerText.trim();
      if (!aiText || seenAI.has(aiText)) return;
      seenAI.add(aiText);
      
      let container = aiEl;
      let userText = '';
      
      for (let i = 0; i < 20 && container; i++) {
        container = container.parentElement;
        if (!container) break;
        
        let prev = container.previousElementSibling;
        let attempts = 0;
        
        while (prev && attempts < 10) {
          attempts++;
          const text = prev.innerText?.trim();
          
          if (!text || text.length < 2) {
            prev = prev.previousElementSibling;
            continue;
          }
          
          if (prev.querySelector('.ds-markdown')) {
            prev = prev.previousElementSibling;
            continue;
          }
          
          if (/^(Copy|Edit|Share|Regenerate|Search|Deep\\s*Think|DeepThink|R1|New Chat)$/i.test(text)) {
            prev = prev.previousElementSibling;
            continue;
          }
          
          userText = text
            .replace(/^(Copy|Edit|Share|Search|Deep\\s*Think|DeepThink|R1)\\s*/gi, '')
            .replace(/\\s*(Copy|Edit|Share|Search|Regenerate)\\s*$/gi, '')
            .trim();
          break;
        }
        
        if (userText) break;
      }
      
      conversations.push({
        user: userText || '[User message not detected]',
        assistant: aiText
      });
    });
    
    return { conversations, debug: { aiBlocksFound: aiBlocks.length } };
  `);

  return data;
}

function formatOutput(messages) {
  let output = SEPARATORS.header;

  if (!messages || messages.length === 0) {
    output += "No messages found.\n";
    return output;
  }

  messages.forEach((msg) => {
    output += SEPARATORS.userStart;
    output += msg.user;
    output += "\n";
    output += SEPARATORS.aiStart;
    output += msg.assistant;
    output += SEPARATORS.divider;
  });

  output += SEPARATORS.footer.replace("{{COUNT}}", String(messages.length).padStart(2, ' '));
  return output;
}

async function main() {
  let driver;

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DeepSeek Chat Extractor v3.1 (DEBUG)               ║
╚══════════════════════════════════════════════════════════════╝
`);

  try {
    const cookies = readCookiesFromFirefox();
    
    if (cookies.length === 0) {
      console.log("\nNo DeepSeek cookies found!");
      process.exit(1);
    }

    driver = await createDriverWithCookies(cookies);

    // Refresh to apply cookies
    console.log("\nRefreshing page to apply cookies...");
    await driver.get(CHAT_URL);
    
    console.log("\n>>> Browser is now open. Check if you see the chat.");
    console.log(">>> If you see a login page, the cookies didn't work.");
    console.log(">>> Press ENTER when the chat is fully loaded...\n");
    await new Promise(resolve => process.stdin.once("data", resolve));

    // Debug info
    const pageInfo = await debugPage(driver);
    
    // Check if logged in
    if (pageInfo.url.includes("login") || pageInfo.title.toLowerCase().includes("login")) {
      console.log("\n⚠ NOT LOGGED IN - cookies didn't work");
      console.log("Please log in manually in the browser, then press ENTER...");
      await new Promise(resolve => process.stdin.once("data", resolve));
      await driver.get(CHAT_URL);
      await driver.sleep(3000);
    }

    // Extract
    const result = await extractChatMessages(driver);
    console.log("Extraction result:", JSON.stringify(result.debug, null, 2));
    
    const messages = result.conversations || [];
    console.log(`\nExtracted ${messages.length} exchange(s)`);

    if (messages.length > 0) {
      const output = formatOutput(messages);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const outputFile = path.join(__dirname, `deepseek_chat_${timestamp}.txt`);
      fs.writeFileSync(outputFile, output, "utf8");
      console.log(`\n✓ Saved to: ${outputFile}`);
      console.log("\nPREVIEW:\n" + output.substring(0, 1500));
    }

    console.log("\n\nPress ENTER to close...");
    await new Promise(resolve => process.stdin.once("data", resolve));

  } catch (error) {
    console.error("\nError:", error.message);
    console.error(error.stack);
  } finally {
    if (driver) {
      await driver.quit();
    }
    process.exit(0);
  }
}

main();
