// ============================================
// ChatGPT Chat Extractor - Browser Console Script
// ============================================
// Instructions:
// 1. Go to https://chat.openai.com/
// 2. Open Developer Tools (F12 or Cmd+Option+I)
// 3. Paste this entire script into the Console tab
// 4. Press Enter to run
// ============================================

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    // Output filename (will be timestamped)
    filenamePrefix: 'chatgpt_chat',
    // Minimum message length to consider valid
    minMessageLength: 1,
    // Delay between extractions (ms)
    delay: 500,
  };

  // ============================================
  // STYLING
  // ============================================
  const STYLES = {
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
    divider: `

   *.·:·.✧    ════════════════════════════════    ✧.·:·.*

`,
    footer: (count) => `
╔══════════════════════════════════════════════════════════════╗
║                       END OF CHAT                             ║
║                   Total Exchanges: ${String(count).padStart(2, ' ')}                  ║
╚══════════════════════════════════════════════════════════════╝
`,
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  
  function cleanText(text) {
    if (!text) return '';
    return text.trim();
  }

  function getMarkdownContent(element) {
    if (!element) return '';
    
    // Try to get the actual markdown content
    // ChatGPT often stores it in data attributes or specific elements
    const markdownEl = element.querySelector('[class*="markdown"]') || element;
    
    // Get raw HTML and try to extract markdown-like formatting
    let html = markdownEl.innerHTML;
    let text = markdownEl.innerText;
    
    // Preserve code blocks (```...```)
    const codeBlocks = markdownEl.querySelectorAll('pre code, pre');
    codeBlocks.forEach(pre => {
      const code = pre.innerText;
      text = text.replace(code, '\n```\n' + code + '\n```\n');
    });
    
    // Preserve inline code (`...`)
    const inlineCode = markdownEl.querySelectorAll('code:not(pre code)');
    inlineCode.forEach(code => {
      const codeText = code.innerText;
      text = text.replace(codeText, '`' + codeText + '`');
    });
    
    // Preserve bold (**text** or <strong>)
    const boldEls = markdownEl.querySelectorAll('strong, b, [class*="bold"]');
    boldEls.forEach(el => {
      const boldText = el.innerText;
      text = text.replace(boldText, '**' + boldText + '**');
    });
    
    // Preserve italic (*text* or <em>)
    const italicEls = markdownEl.querySelectorAll('em, i, [class*="italic"]');
    italicEls.forEach(el => {
      const italicText = el.innerText;
      text = text.replace(italicText, '*' + italicText + '*');
    });
    
    // Preserve headers
    const headers = markdownEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headers.forEach(h => {
      const headerText = h.innerText;
      const level = h.tagName.charAt(1);
      text = text.replace(headerText, '#'.repeat(level) + ' ' + headerText);
    });
    
    // Preserve bullet lists
    const listItems = markdownEl.querySelectorAll('li');
    listItems.forEach(li => {
      const liText = li.innerText;
      const parent = li.parentElement;
      if (parent?.tagName === 'UL') {
        text = text.replace(liText, '- ' + liText);
      } else if (parent?.tagName === 'OL') {
        text = text.replace(liText, '1. ' + liText);
      }
    });
    
    // Preserve blockquotes
    const blockquotes = markdownEl.querySelectorAll('blockquote');
    blockquotes.forEach(bq => {
      const bqText = bq.innerText;
      text = text.replace(bqText, '> ' + bqText);
    });
    
    // Preserve horizontal rules
    if (html.includes('<hr') || html.includes('---')) {
      text += '\n---\n';
    }
    
    // Preserve links
    const links = markdownEl.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      const linkText = link.innerText;
      if (href && linkText) {
        text = text.replace(linkText, '[' + linkText + '](' + href + ')');
      }
    });
    
    // Preserve line breaks - ChatGPT uses <br> or divs for newlines
    const paragraphs = markdownEl.querySelectorAll('p, div');
    paragraphs.forEach(p => {
      const pText = p.innerText;
      if (pText && pText.length > 0) {
        text = text.replace(pText, pText + '\n\n');
      }
    });
    
    // Clean up excessive newlines but preserve structure
    text = text.replace(/\n{3,}/g, '\n\n');
    
    return text.trim();
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================
  // EXTRACTION FUNCTIONS
  // ============================================

  function findConversationContainer() {
    // Try various selectors for the conversation container
    const selectors = [
      '[data-testid="conversation-turn"]',
      '[class*="conversation-turn"]',
      '[class*="conversation-container"]',
      '[role="log"]',
      'main [class*="flex flex-col"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // Fallback: find the main content area
    return document.querySelector('main') || document.body;
  }

  function findAllMessages() {
    const messages = [];
    
    // Method 1: Use data attributes (ChatGPT uses these)
    // Works for both chat.openai.com and chatgpt.com
    const dataMsgs = document.querySelectorAll('[data-message-author-role]');
    if (dataMsgs.length > 0) {
      dataMsgs.forEach(el => {
        const role = el.getAttribute('data-message-author-role');
        // Try to get markdown content first, fallback to innerText
        let text = getMarkdownContent(el);
        if (!text || text.length < CONFIG.minMessageLength) {
          text = cleanText(el.innerText);
        }
        if (text && text.length >= CONFIG.minMessageLength) {
          messages.push({ role, text, element: el });
        }
      });
      console.log(`[EXTRACTOR] Found ${messages.length} messages via data attributes`);
      return messages;
    }

    // Method 2: Look for message containers by class patterns
    const messageSelectors = [
      '[class*="message-content"]',
      '[class*="message-body"]',
      '[class*="message-"]',
      '.markdown',
      '.prose',
    ];

    for (const sel of messageSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        console.log(`[EXTRACTOR] Found ${els.length} elements with selector: ${sel}`);
      }
    }

    // Method 3: Look for the conversation turn elements (newer ChatGPT UI)
    const turnSelectors = [
      '[data-testid="conversation-turn"]',
      '[class*="conversation-turn"]',
      '[class*="conversation-item"]',
    ];

    for (const sel of turnSelectors) {
      const turns = document.querySelectorAll(sel);
      if (turns.length > 0) {
        turns.forEach(turn => {
          // Try to find user/assistant within this turn
          const userEl = turn.querySelector('[data-message-author-role="user"]');
          const aiEl = turn.querySelector('[data-message-author-role="assistant"]');
          
          if (userEl) {
            let text = getMarkdownContent(userEl);
            if (!text) text = cleanText(userEl.innerText);
            if (text) messages.push({ role: 'user', text, element: userEl });
          }
          if (aiEl) {
            let text = getMarkdownContent(aiEl);
            if (!text) text = cleanText(aiEl.innerText);
            if (text) messages.push({ role: 'assistant', text, element: aiEl });
          }
        });
        if (messages.length > 0) {
          console.log(`[EXTRACTOR] Found ${messages.length} messages via turn elements`);
          return messages;
        }
      }
    }

    // Method 4: Scan all relevant divs for message patterns
    const allDivs = document.querySelectorAll('div');
    const textMessages = [];
    
    allDivs.forEach(div => {
      let text = getMarkdownContent(div);
      if (!text) text = cleanText(div.innerText);
      
      // Check if this looks like a user or AI message based on context
      if (text && text.length > 10 && text.length < 50000) {
        // Look for parent/sibling indicators
        const parent = div.closest('[class*="message"]') || div.parentElement;
        const classes = parent?.className?.toString() || '';
        
        if (!classes.includes('input') && !classes.includes('composer')) {
          textMessages.push({ 
            text, 
            element: div,
            isUser: classes.includes('user') || div.previousElementSibling?.innerText?.includes('You'),
          });
        }
      }
    });

    console.log(`[EXTRACTOR] Found ${textMessages.length} potential text blocks`);
    return messages.length > 0 ? messages : textMessages;
  }

  function pairMessages(messages) {
    const conversations = [];
    let currentUser = null;
    let currentAI = null;

    for (const msg of messages) {
      const role = msg.role || (msg.isUser ? 'user' : 'assistant');
      
      if (role === 'user') {
        if (currentUser) {
          // Previous user message without AI response - might be system or edge case
          console.log(`[EXTRACTOR] Orphan user message: "${currentUser.substring(0, 50)}..."`);
        }
        currentUser = msg.text;
      } else if (role === 'assistant') {
        currentAI = msg.text;
        
        if (currentUser) {
          conversations.push({ user: currentUser, assistant: currentAI });
          currentUser = null;
          currentAI = null;
        } else {
          console.log(`[EXTRACTOR] Orphan AI message (no user): "${currentAI.substring(0, 50)}..."`);
        }
      }
    }

    // Handle case where last message is user without response
    if (currentUser && !currentAI) {
      console.log(`[EXTRACTOR] Last user message without response: "${currentUser.substring(0, 50)}..."`);
    }

    return conversations;
  }

  // ============================================
  // OUTPUT FUNCTIONS
  // ============================================

  function formatConversations(conversations) {
    let output = STYLES.header;
    output += '📝 Markdown formatting preserved\n\n';

    if (!conversations || conversations.length === 0) {
      output += 'No messages found.\n';
      return output;
    }

    conversations.forEach(msg => {
      output += STYLES.userStart;
      output += msg.user;
      output += '\n\n';
      output += STYLES.aiStart;
      output += msg.assistant;
      output += STYLES.divider;
    });

    output += STYLES.footer(conversations.length);
    return output;
  }

  function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[EXTRACTOR] ✅ Downloaded: ${filename}`);
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      console.log('[EXTRACTOR] ✅ Copied to clipboard!');
    }).catch(err => {
      console.error('[EXTRACTOR] Failed to copy:', err);
    });
  }

  // ============================================
  // MAIN EXTRACTION
  // ============================================

  async function extractChat() {
    console.clear();
    console.log('%c🤖 ChatGPT Chat Extractor', 'font-size: 20px; font-weight: bold; color: #10a37f;');
    console.log('%c=====================================', 'color: #10a37f;');
    console.log('[EXTRACTOR] Starting extraction...');
    console.log('[EXTRACTOR] URL:', window.location.href);
    console.log('[EXTRACTOR] Page title:', document.title);

    // Validate we're on a chat page
    const url = window.location.href;
    const isChatPage = url.includes('/c/') || url.includes('/chat/') || url.includes('chatgpt.com');
    
    if (!isChatPage) {
      console.warn('[EXTRACTOR] ⚠️  You may not be on a ChatGPT conversation page');
    }

    // Wait for page to settle
    await delay(CONFIG.delay);
    
    // Find conversation container
    const container = findConversationContainer();
    if (!container) {
      console.error('[EXTRACTOR] ❌ Could not find conversation container');
      console.log('[EXTRACTOR] Debug - Body classes:', document.body.className);
      console.log('[EXTRACTOR] Debug - Page HTML preview:', document.body.innerHTML.substring(0, 500));
      return null;
    }
    console.log('[EXTRACTOR] Found conversation container');

    // Extract messages
    const rawMessages = findAllMessages();
    console.log(`[EXTRACTOR] Raw messages found: ${rawMessages.length}`);

    if (rawMessages.length === 0) {
      console.error('[EXTRACTOR] ❌ No messages found. Are you on a chat page?');
      console.log('[EXTRACTOR] Debug - Page title:', document.title);
      console.log('[EXTRACTOR] Debug - URL:', url);
      
      // Extra debug info
      const debugSelectors = [
        '[data-message-author-role]',
        '[data-testid]',
        '[class*="message"]',
        '[class*="conversation"]'
      ];
      
      console.log('[EXTRACTOR] Debug - Checking common selectors:');
      debugSelectors.forEach(sel => {
        const count = document.querySelectorAll(sel).length;
        if (count > 0) {
          console.log(`[EXTRACTOR]   ${sel}: ${count} elements`);
        }
      });
      
      return null;
    }

    // Pair into conversations
    const conversations = pairMessages(rawMessages);
    console.log(`[EXTRACTOR] Paired conversations: ${conversations.length}`);

    // Format output
    const output = formatConversations(conversations);

    // Generate filename from URL if available, otherwise use timestamp
    let filename;
    const urlMatch = url.match(/\/c\/([a-zA-Z0-9-]+)/);
    if (urlMatch) {
      filename = `chatgpt_${urlMatch[1]}.txt`;
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      filename = `${CONFIG.filenamePrefix}_${timestamp}.txt`;
    }

    // Download
    downloadFile(output, filename);

    // Also log to console
    console.log('\n%c=====================================', 'color: #10a37f;');
    console.log('%cEXTRACTED CHAT PREVIEW:', 'font-weight: bold;');
    console.log('%c=====================================', 'color: #10a37f;');
    console.log(output.substring(0, 2000));
    
    if (output.length > 2000) {
      console.log(`\n... (${output.length - 2000} more characters - see downloaded file)`);
    }

    console.log('\n%c✅ EXTRACTION COMPLETE!', 'font-size: 16px; font-weight: bold; color: green;');
    console.log(`%c📁 File saved as: ${filename}`, 'color: #666;');

    return { conversations, output, filename };
  }

  // ============================================
  // RUN EXTRACTION
  // ============================================
  
  // Auto-run
  extractChat().then(result => {
    if (result) {
      // Offer to copy to clipboard
      console.log('%c💡 Tip: Content also copied to clipboard!', 'color: #666;');
      copyToClipboard(result.output);
    }
  }).catch(err => {
    console.error('[EXTRACTOR] ❌ Error:', err);
  });

  // Return for manual use
  return {
    extract: extractChat,
    findAllMessages,
    pairMessages,
    formatConversations,
    downloadFile,
  };

})();