#!/usr/bin/env node

const { Builder, By, until } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Config
const CHAT_URL = process.argv[2] || "https://chat.openai.com/";
const FIREFOX_PROFILE = path.join(os.homedir(), ".mozilla/firefox/w8ymqkg0.default-release");
const TEMP_DIR = path.join(__dirname, ".tmp_cookies_chatgpt");

// Cool separators
const SEPARATORS = {
  divider: `

   *.·:·.✧    ════════════════════════════════    ✧.·:·.*

`,
  header: `
╔══════════════════════════════════════════════════════════════╗
║                    CHATGPT CHAT EXTRACTION                   ║
║                     ${new Date().toLocaleString().padEnd(38)}║
╚══════════════════════════════════════════════════════════════╝

`,
  userStart: `┌──────────────────────────────────────────────────────────────┐
│  ◆ USER                                                      │
└──────────────────────────────────────────────────────────────┘
`,
  aiStart: `┌──────────────────────────────────────────────────────────────┐
│  ◇ CHATGPT                                                   │
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
  
  cookieFiles.forEach(file => {
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
  });

  const Database = require("better-sqlite3");
  const dbPath = path.join(TEMP_DIR, "cookies.sqlite");
  
  const db = new Database(dbPath, { readonly: true });
  
  const cookies = db.prepare(`
    SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite
    FROM moz_cookies 
    WHERE host LIKE '%openai%' OR host LIKE '%chatgpt%'
  `).all();

  db.close();

  console.log(`\nFound ${cookies.length} ChatGPT cookies:`);
  cookies.forEach(c => {
    console.log(`  - ${c.name} (${c.host})`);
  });
  
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
  options.setPreference("useAutomationExtension", false);
  options.setPreference("permissions.default.image", 2); // Disable images for faster loading
  options.setPreference("javascript.enabled", true);
  
  // Set user agent to look more like a regular browser
  options.setPreference("general.useragent.override", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0");

  const driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .build();

  console.log("Navigating to ChatGPT to set cookies...");
  await driver.get("https://chat.openai.com/");
  await driver.sleep(5000);
  
  // Check for Cloudflare
  const hasCloudflare = await handleCloudflare(driver, "cookie injection");
  
  if (hasCloudflare) {
    console.log("\n⏳ Waiting for Cloudflare to process (this can take 10-60 seconds)...");
    await driver.sleep(15000);
    
    // Check again
    const stillBlocked = await handleCloudflare(driver, "after wait");
    if (stillBlocked) {
      console.log("\n❌ Cloudflare still requires manual intervention.");
      console.log("👆 Please solve any captcha in the browser window, then press ENTER...");
      await new Promise(resolve => process.stdin.once("data", resolve));
      
      // Final check
      const finalCheck = await handleCloudflare(driver, "after manual solve");
      if (!finalCheck) {
        console.log("✅ Cloudflare challenge resolved!");
      }
    } else {
      console.log("✅ Cloudflare challenge automatically resolved!");
    }
  }

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

async function detectCloudflare(driver) {
  return await driver.executeScript(`
    const bodyText = document.body.innerText;
    const title = document.title;
    const url = window.location.href;
    
    return {
      hasCloudflare: bodyText.includes('Cloudflare') || 
                    bodyText.includes('Checking your browser') ||
                    bodyText.includes('ray id') ||
                    bodyText.includes('DDoS protection') ||
                    title.includes('Cloudflare'),
      hasCaptcha: document.querySelector('input[type="text"][name*="cf"]') !== null ||
                 document.querySelector('[class*="cf-"]') !== null ||
                 document.querySelector('#challenge-form') !== null ||
                 document.querySelector('[data-sitekey]') !== null,
      isChallengePage: url.includes('challenge') || 
                       url.includes('cf-browser') ||
                       title.includes('Just a moment'),
      bodyTextPreview: bodyText.substring(0, 200)
    };
  `);
}

async function handleCloudflare(driver, context = "initial") {
  const cf = await detectCloudflare(driver);
  
  if (cf.hasCloudflare || cf.hasCaptcha || cf.isChallengePage) {
    console.log(`\n🛡️  Cloudflare challenge detected (${context}):`);
    console.log(`   URL: ${await driver.getCurrentUrl()}`);
    console.log(`   Has Captcha: ${cf.hasCaptcha}`);
    console.log(`   Is Challenge Page: ${cf.isChallengePage}`);
    
    if (cf.bodyTextPreview.length > 0) {
      console.log(`   Page preview: "${cf.bodyTextPreview.replace(/\n/g, ' ')}..."`);
    }
    
    console.log("\n🔧 Resolution options:");
    console.log("   1. Wait 10-30 seconds for automatic resolution");
    console.log("   2. Manually solve captcha in browser window");
    console.log("   3. Try different browser profile");
    console.log("   4. Use VPN if IP is blocked");
    
    return true;
  }
  return false;
}

async function debugPage(driver) {
  console.log("\n=== DEBUG INFO ===");
  
  const info = await driver.executeScript(`
    return {
      url: window.location.href,
      title: document.title,
      bodyText: document.body.innerText.substring(0, 500),
      hasMarkdown: document.querySelectorAll('[data-message-author-role="assistant"]').length,
      hasUserMessages: document.querySelectorAll('[data-message-author-role="user"]').length,
      allClasses: [...new Set([...document.querySelectorAll('*')].map(e => e.className).filter(c => typeof c === 'string' && (c.includes('message') || c.includes('conversation'))))].slice(0, 10)
    };
  `);
  
  console.log(`URL: ${info.url}`);
  console.log(`Title: ${info.title}`);
  console.log(`Found assistant messages: ${info.hasMarkdown}`);
  console.log(`Found user messages: ${info.hasUserMessages}`);
  console.log(`Message-related classes: ${JSON.stringify(info.allClasses)}`);
  console.log(`\nPage text preview:\n${info.bodyText}\n`);
  
  return info;
}

async function extractChatMessages(driver) {
  console.log("Extracting messages...\n");

  const data = await driver.executeScript(`
    const conversations = [];
    const seenAI = new Set();
    
    // Try multiple selectors for ChatGPT messages
    const assistantSelectors = [
      '[data-message-author-role="assistant"]',
      '[data-testid="conversation-turn-3"]',
      '.markdown',
      '[class*="prose"]',
      '[class*="message-content"]'
    ];
    
    const userSelectors = [
      '[data-message-author-role="user"]',
      '[data-testid="conversation-turn-2"]',
      '[class*="user-message"]'
    ];
    
    let aiBlocks = [];
    for (const sel of assistantSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        console.log('Found AI messages with selector:', sel, found.length);
        aiBlocks = found;
        break;
      }
    }
    
    let userBlocks = [];
    for (const sel of userSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        console.log('Found user messages with selector:', sel, found.length);
        userBlocks = found;
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
    
    // Extract conversations by matching user and assistant messages
    const allMessages = [];
    
    // Get all messages in order
    const messageContainer = document.querySelector('[data-testid="conversation-turn"]') || 
                            document.querySelector('.conversation-turn') ||
                            document.querySelector('[class*="conversation"]');
    
    if (messageContainer) {
      const messages = messageContainer.querySelectorAll('[data-message-author-role]');
      messages.forEach(msg => {
        const role = msg.getAttribute('data-message-author-role');
        const text = msg.innerText?.trim();
        if (text && text.length > 0) {
          allMessages.push({ role, text });
        }
      });
    } else {
      // Fallback: try to pair user and AI blocks
      const userTexts = Array.from(userBlocks).map(el => el.innerText?.trim()).filter(t => t && t.length > 0);
      const aiTexts = Array.from(aiBlocks).map(el => el.innerText?.trim()).filter(t => t && t.length > 0);
      
      for (let i = 0; i < Math.min(userTexts.length, aiTexts.length); i++) {
        allMessages.push({ role: 'user', text: userTexts[i] });
        allMessages.push({ role: 'assistant', text: aiTexts[i] });
      }
    }
    
    // Group into conversations
    for (let i = 0; i < allMessages.length - 1; i += 2) {
      if (allMessages[i].role === 'user' && allMessages[i + 1].role === 'assistant') {
        conversations.push({
          user: allMessages[i].text,
          assistant: allMessages[i + 1].text
        });
      }
    }
    
    return { conversations, debug: { 
      aiBlocksFound: aiBlocks.length, 
      userBlocksFound: userBlocks.length,
      totalMessages: allMessages.length
    } };
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
║           ChatGPT Chat Extractor v1.0 (DEBUG)                ║
╚══════════════════════════════════════════════════════════════╝
`);

  try {
    const cookies = readCookiesFromFirefox();
    
    if (cookies.length === 0) {
      console.log("\nNo ChatGPT cookies found!");
      console.log("Please log in to ChatGPT in Firefox first, then run this script.");
      process.exit(1);
    }

    driver = await createDriverWithCookies(cookies);

    // Refresh to apply cookies
    console.log("\nRefreshing page to apply cookies...");
    await driver.get(CHAT_URL);
    
    // Additional wait for Cloudflare
    console.log("⏳ Waiting for page to load (checking for Cloudflare)...");
    await driver.sleep(8000);
    
    // Check if Cloudflare is blocking after refresh
    const cfCheck = await driver.executeScript(`
      return {
        hasCloudflare: document.body.innerText.includes('Cloudflare') || 
                      document.body.innerText.includes('Checking your browser') ||
                      document.body.innerText.includes('ray id'),
        title: document.title
      };
    `);
    
    if (cfCheck.hasCloudflare) {
      console.log("\n🚨 Cloudflare challenge detected on refresh!");
      console.log("🔧 Please solve the captcha manually in the browser window.");
      console.log("⏳ This may take 30-60 seconds to resolve...");
      console.log(">>> Press ENTER after you've solved any captcha and see the chat...\n");
    } else {
      console.log("\n>>> Browser is now open. Check if you see the chat.");
      console.log(">>> If you see a login page, the cookies didn't work.");
      console.log(">>> Press ENTER when the chat is fully loaded...\n");
    }
    await new Promise(resolve => process.stdin.once("data", resolve));

    // Debug info
    const pageInfo = await debugPage(driver);
    
    // Check if logged in
    if (pageInfo.url.includes("login") || pageInfo.title.toLowerCase().includes("login") || pageInfo.url.includes("auth")) {
      console.log("\n⚠ NOT LOGGED IN - cookies didn't work");
      console.log("Please log in manually in the browser, then press ENTER...");
      await new Promise(resolve => process.stdin.once("data", resolve));
      await driver.get(CHAT_URL);
      await driver.sleep(5000);
      
      // Check for Cloudflare again after manual login
      const cfAfterLogin = await driver.executeScript(`
        return document.body.innerText.includes('Cloudflare') || 
               document.body.innerText.includes('Checking your browser');
      `);
      
      if (cfAfterLogin) {
        console.log("⚠️ Cloudflare challenge after login. Please solve captcha manually.");
        await new Promise(resolve => process.stdin.once("data", resolve));
      }
    }

    // Extract
    const result = await extractChatMessages(driver);
    console.log("Extraction result:", JSON.stringify(result.debug, null, 2));
    
    const messages = result.conversations || [];
    console.log(`\nExtracted ${messages.length} exchange(s)`);

    if (messages.length > 0) {
      const output = formatOutput(messages);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const outputFile = path.join(__dirname, `chatgpt_chat_${timestamp}.txt`);
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