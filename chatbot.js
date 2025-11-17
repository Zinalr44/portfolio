(function () {
  const state = {
    fuse: null,
    data: null,
    passages: null,
    isOpen: false,
    focusables: [],
    lastActiveEl: null,
    history: [], // chat history for LLM context
    intents: null, // optional guided intents loaded from intents.json
    cache: new Map(), // cache for LLM responses
  };

  const els = {};

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function scrollMessagesToEnd() {
    requestAnimationFrame(() => {
      els.messages.scrollTop = els.messages.scrollHeight;
    });
  }

  function getTimeContext() {
    try {
      const now = new Date();
      const h = now.getHours();
      const day = now.toLocaleDateString('en-US', { weekday: 'long' });
      const month = now.toLocaleDateString('en-US', { month: 'long' });
      const date = now.getDate();
      const timeString = now.toLocaleTimeString();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Time of day context
      let timeOfDay, greeting, emoji;
      
      if (h < 5) {
        timeOfDay = 'late night';
        greeting = 'Working late';
        emoji = '🌙';
      } else if (h < 12) {
        timeOfDay = 'morning';
        greeting = 'Good morning';
        emoji = '☀️';
      } else if (h < 17) {
        timeOfDay = 'afternoon';
        greeting = 'Good afternoon';
        emoji = '🌤️';
      } else if (h < 22) {
        timeOfDay = 'evening';
        greeting = 'Good evening';
        emoji = '🌆';
      } else {
        timeOfDay = 'night';
        greeting = 'Good night';
        emoji = '🌃';
      }

      // Special dates
      const isWeekend = [0, 6].includes(now.getDay());
      const isBirthday = (now.getMonth() === 5 && date === 15); // June 15th
      const isHoliday = false; // Add your holiday logic here

      return {
        time: timeString,
        timezone,
        day,
        month,
        date,
        timeOfDay,
        greeting,
        emoji,
        isWeekend,
        isBirthday,
        isHoliday
      };
    } catch (e) {
      console.error('Error getting time context:', e);
      return { greeting: 'Hello', emoji: '👋' };
    }
  }

  function getRandomTip() {
    const tips = [
      "Ask me about my latest projects or tech stack!",
      "I can help you find specific skills or experiences.",
      "Looking for my contact info? Just ask!",
      "Check out my open-source contributions on GitHub.",
      "I can explain any project in detail - just ask!"
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }

  function buildGreetingHTML() {
    const context = getTimeContext();
    const { greeting, emoji, isWeekend, isBirthday } = context;
    
    let greetingMsg = `${greeting}! ${emoji} `;
    
    if (isBirthday) {
      greetingMsg = `🎂 Happy Birthday! ${greeting}! 🎉 `;
    } else if (isWeekend) {
      greetingMsg += "Hope you're having a great weekend! " + (context.timeOfDay === 'morning' ? '☕' : '😊');
    }
    
    let firstRun = false;
    try { firstRun = !localStorage.getItem('chat_seen'); } catch (_) {}
    if (firstRun) {
      const tip = getRandomTip();
      return `${greetingMsg} I'm Zinal's AI assistant. ${tip}<br><br>
      <div class="suggestions">
        <strong>Try asking:</strong>
        <ul>
          <li>Tell me about your AI projects</li>
          <li>What tech stack do you use?</li>
          <li>Show me your work experience</li>
          <li>How can we collaborate?</li>
        </ul>
        <p>Or type your question below...</p>
      </div>`;
    }
    // returning users: keep it minimal
    const variants = [
      `${greetingMsg} How can I help today? I answer from this site's sources.`,
      `${greetingMsg} Ask about a project, skill, resume, or contact — I'll cite sources.`,
      `${greetingMsg} Looking for a quick project summary or tech stack? Ask away.`
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  // Split items into smaller passages to improve retrieval precision
  function buildPassages(items) {
    const out = [];
    const CHUNK = 420; // ~300–500 chars target
    const OVERLAP = 60;
    items.forEach((it) => {
      const base = {
        type: it.type,
        title: it.title || it.q || it.type || 'Item',
        href: it.href || '',
        tags: it.tags || [],
        q: it.q,
        a: it.a,
        parent: it,
      };
      const text = String(it.content || it.a || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) {
        out.push({ ...base, content: String(it.content || it.a || ''), chunkIndex: 0 });
        return;
      }
      for (let i = 0; i < text.length; i += (CHUNK - OVERLAP)) {
        const slice = text.slice(i, i + CHUNK);
        out.push({ ...base, content: slice, chunkIndex: Math.floor(i / (CHUNK - OVERLAP)) });
        if (i + CHUNK >= text.length) break;
      }
    });
    return out;
  }

  function addMessage(text, who = 'bot', source = 'unknown') {
    const div = document.createElement('div');
    div.className = `msg ${who}`;
    
    // Create message container
    const msgContent = document.createElement('div');
    msgContent.className = 'msg-content';
    
    // Format the text before displaying
    let cleanText = String(text);
    if (who === 'bot') {
      cleanText = formatResponse(cleanText);
      
      // Format contact information better
      if (cleanText.includes('zinalr4444@gmail.com')) {
        cleanText = cleanText.replace(/zinalr4444@gmail.coma>/, 'zinalr4444@gmail.com');
        cleanText = cleanText.replace(/LinkedIn:\s*:?\s*/, 'LinkedIn: ');
        cleanText = cleanText.replace(/:\s*https:/g, ': https:');
      }
      
      // Format sources at the end
      cleanText = cleanText.replace(/Sources:\s*/g, '<div class="sources"><strong>Sources:</strong> ');
      cleanText = cleanText.replace(/\[\d+\]/g, ''); // Remove source numbers
      
      if (typeof window !== 'undefined' && window.DOMPurify) {
        msgContent.innerHTML = window.DOMPurify.sanitize(cleanText, {
          ALLOWED_TAGS: ['p', 'ul', 'li', 'strong', 'em', 'a', 'small', 'br', 'div', 'span'],
          ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
        });
      }
    } else {
      // user messages are already escaped at callsite
      msgContent.innerHTML = text;
    }
    
    // Add message actions (TTS button for bot messages)
    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    if (who === 'bot') {
      const ttsBtn = document.createElement('button');
      ttsBtn.className = 'tts-btn';
      ttsBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
      ttsBtn.title = 'Read aloud';
      ttsBtn.setAttribute('aria-label', 'Read this message aloud');
      ttsBtn.onclick = () => {
        const icon = ttsBtn.querySelector('i');
        if (icon.classList.contains('fa-volume-up')) {
          icon.className = 'fas fa-volume-mute';
          speakMessage(cleanText.replace(/<[^>]*>?/gm, ''));
        } else {
          icon.className = 'fas fa-volume-up';
          window.speechSynthesis.cancel();
        }
      };
      actions.appendChild(ttsBtn);
    }
    
    // Add copy button for all messages
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.innerHTML = '<i class="far fa-copy"></i>';
    copyBtn.title = 'Copy to clipboard';
    copyBtn.setAttribute('aria-label', 'Copy message to clipboard');
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(cleanText.replace(/<[^>]*>?/gm, ''))
        .then(() => {
          const icon = copyBtn.querySelector('i');
          const originalClass = icon.className;
          icon.className = 'fas fa-check';
          showTemporaryTooltip(copyBtn, 'Copied!');
          setTimeout(() => {
            icon.className = originalClass;
          }, 2000);
        })
        .catch(err => console.error('Failed to copy:', err));
    };
    actions.appendChild(copyBtn);
    
    // Assemble the message
    div.appendChild(msgContent);
    div.appendChild(actions);
    
    // Add to chat
    els.messages.appendChild(div);
    scrollMessagesToEnd();
    
    // Auto-scroll to show the new message
    msgContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // naive HTML highlighter; safe enough since we escape content before
  function highlightHTML(html, query) {
    const terms = String(query).toLowerCase().split(/[^a-z0-9#+]+/i).filter(t => t.length >= 3).slice(0, 4);
    if (!terms.length) return html;
    let out = html;
    terms.forEach(t => {
      const rx = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      out = out.replace(rx, '<mark>$1</mark>');
    });
    return out;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'msg bot typing';
    div.innerHTML = `
      <div class="skeleton-loader">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
      </div>
    `;
    els.messages.appendChild(div);
    els._typing = div;
    scrollMessagesToEnd();
  }

  function hideTyping() {
    if (els._typing && els._typing.parentNode) {
      els._typing.parentNode.removeChild(els._typing);
    }
    els._typing = null;
  }

  async function loadKnowledge() {
    try {
      const res = await fetch('knowledge.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load knowledge.json');
      const kb = await res.json();
      state.data = normalizeKB(kb);
      state.passages = buildPassages(state.data);
      state.fuse = new Fuse(state.passages, {
        includeScore: true,
        shouldSort: true,
        threshold: 0.5,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
          { name: 'title', weight: 0.4 },
          { name: 'content', weight: 0.9 },
          { name: 'tags', weight: 0.3 },
          { name: 'q', weight: 0.9 },
          { name: 'a', weight: 0.7 },
        ],
      });
      // Load optional intents.json (non-blocking)
      try {
        const ir = await fetch('intents.json', { cache: 'no-store' });
        if (ir.ok) {
          state.intents = await ir.json();
        }
      } catch (_) { /* ignore */ }
    } catch (e) {
      console.warn('knowledge.json not available, falling back to page content.');
      state.data = buildDomOnlyKB();
      if (state.data.length === 0) {
        addMessage("I'm running in local mode and couldn't index content. Try serving the site via a local server, or keep browsing the sections.");
        return;
      }
      state.passages = buildPassages(state.data);
      state.fuse = new Fuse(state.passages, {
        includeScore: true,
        shouldSort: true,
        threshold: 0.5,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
          { name: 'title', weight: 0.4 },
          { name: 'content', weight: 0.9 },
          { name: 'tags', weight: 0.3 },
          { name: 'q', weight: 0.9 },
          { name: 'a', weight: 0.7 },
        ],
      });
      addMessage("Tip: Running without knowledge.json. I indexed this page's sections and projects.");
    }
  }

  function normalizeKB(kb) {
    const items = [];

    if (kb.about) items.push({ type: 'section', title: kb.about.title || 'About', content: kb.about.content, href: kb.about.section || '#about', tags: kb.about.tags || [] });
    if (kb.skills) items.push({ type: 'section', title: kb.skills.title || 'Skills', content: kb.skills.content, href: kb.skills.section || '#skills', tags: kb.skills.tags || [] });

    if (Array.isArray(kb.projects)) {
      kb.projects.forEach(p => items.push({ type: 'project', title: p.title, content: p.content, href: p.url, tags: p.tags || [], media: p.media }));
    }

    if (kb.contact) {
      const parts = [];
      if (kb.contact.email) parts.push(`Email: ${kb.contact.email}`);
      if (kb.contact.linkedin) parts.push(`LinkedIn: ${kb.contact.linkedin}`);
      if (kb.contact.github) parts.push(`GitHub: ${kb.contact.github}`);
      if (kb.contact.kaggle) parts.push(`Kaggle: ${kb.contact.kaggle}`);
      if (kb.contact.whatsapp) parts.push(`WhatsApp: ${kb.contact.whatsapp}`);
      if (kb.contact.upwork) parts.push(`Upwork: ${kb.contact.upwork}`);
      const line = parts.join('. ') + '.';
      items.push({ type: 'contact', title: 'Contact', content: line, href: '#contact', tags: ['contact', 'email', 'linkedin', 'github', 'kaggle', 'whatsapp', 'upwork', 'location'] });
    }

    if (kb.resume) {
      const file = kb.resume.file || 'Zinal_Raval_Resume.pdf';
      const href = encodeURI(file);
      items.push({ type: 'resume', title: 'Resume', content: kb.resume.note || 'Download my resume.', href, tags: ['resume', 'cv', 'download'] });
    }

    if (kb.experience) {
      const text = kb.experience.content || '';
      items.push({ type: 'section', title: kb.experience.title || 'Experience', content: text, href: kb.experience.section || '#experience', tags: (kb.experience.tags || []).concat(['experience']) });
    }

    if (kb.certifications) {
      const text = kb.certifications.content || '';
      items.push({ type: 'section', title: kb.certifications.title || 'Certifications', content: text, href: kb.certifications.section || '#achievements', tags: (kb.certifications.tags || []).concat(['certifications']) });
    }

    if (Array.isArray(kb.faq)) {
      kb.faq.forEach(f => items.push({ type: 'faq', title: 'FAQ', q: f.q, a: f.a, content: `${f.q} ${f.a}`, tags: ['faq'] }));
    }

    // Lightly scrape existing DOM headings to enrich content
    try {
      const sections = qsa('section');
      sections.forEach(sec => {
        const h2 = qs('h2', sec);
        const p = qs('p', sec);
        if (h2 && p) {
          items.push({ type: 'dom', title: h2.textContent.trim(), content: p.textContent.trim(), href: '#' + (sec.id || ''), tags: ['section'] });
        }
      });
    } catch (_) { /* ignore */ }

    return items;
  }

  function buildDomOnlyKB() {
    const items = [];
    try {
      // About
      const aboutSec = qs('#about');
      if (aboutSec) {
        const h = qs('h1, h2', aboutSec);
        const ps = qsa('p', aboutSec).map(x => x.textContent.trim()).join(' ');
        items.push({ type: 'section', title: (h ? h.textContent.trim() : 'About'), content: ps, href: '#about', tags: ['about'] });
      }

      // Skills
      const skillsSec = qs('#skills');
      if (skillsSec) {
        const skills = qsa('.skills-cloud span', skillsSec).map(s => s.textContent.trim()).join(', ');
        items.push({ type: 'section', title: 'Skills', content: skills, href: '#skills', tags: ['skills'] });
      }

      // Projects
      qsa('.project-gallery .project-item').forEach(item => {
        const a = qs('a', item);
        const title = qs('h3', item);
        const p = qsa('p', item).map(x => x.textContent.trim()).join(' ');
        if (a && title) {
          items.push({ type: 'project', title: title.textContent.trim(), content: p, href: a.href, tags: ['project'] });
        }
      });

      // Contact
      const contactSec = qs('#contact');
      if (contactSec) {
        const emailA = qs('a[href^="mailto:"]', contactSec);
        const linkedinA = qs('a[href*="linkedin.com"]', contactSec);
        const githubA = qs('a[href*="github.com"]', contactSec);
        const upworkA = qs('a[href*="upwork.com"]', contactSec);
        const text = `Email: ${emailA ? emailA.href.replace('mailto:', '') : ''}. LinkedIn: ${linkedinA ? linkedinA.href : ''}. GitHub: ${githubA ? githubA.href : ''}. Upwork: ${upworkA ? upworkA.href : ''}.`;
        items.push({ type: 'contact', title: 'Contact', content: text, href: '#contact', tags: ['contact'] });
      }

      // Resume
      const resumeA = qsa('a').find(a => /resume/i.test(a.textContent || '')) || qsa('a').find(a => (a.getAttribute('href') || '').toLowerCase().endsWith('.pdf'));
      if (resumeA) {
        items.push({ type: 'resume', title: 'Resume', content: 'Download my resume.', href: resumeA.getAttribute('href'), tags: ['resume'] });
      }
    } catch (e) {
      console.error('DOM KB build failed', e);
    }
    return items;
  }

  function openChat() {
    if (state.isOpen) return;
    state.isOpen = true;
    state.lastActiveEl = document.activeElement;
    els.root.hidden = false;

    // Focus management
    state.focusables = qsa('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])', els.root)
      .filter(el => !el.hasAttribute('disabled'));
    const first = state.focusables[0];
    const last = state.focusables[state.focusables.length - 1];

    function trap(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    els.root.addEventListener('keydown', trap);
    els.root._trap = trap;

    setTimeout(() => { els.input.focus(); }, 0);

    // Smart greeting (time-of-day + first-run vs returning)
    if (!els.messages.dataset.greeted) {
      addMessage(buildGreetingHTML());
      els.messages.dataset.greeted = '1';
      try { localStorage.setItem('chat_seen', '1'); } catch (_) {}
    }
  }

  function closeChat() {
    if (!state.isOpen) return;
    state.isOpen = false;
    els.root.hidden = true;
    if (els.root._trap) els.root.removeEventListener('keydown', els.root._trap);
    if (state.lastActiveEl) state.lastActiveEl.focus();
  }

  function buildAnswer(query, results) {
    if (!results || results.length === 0) {
      return "I couldn't find an exact match. You can explore: <a href='#projects'>Projects</a>, <a href='#skills'>Skills</a>, or ask about the resume or contact.";
    }

    // Project-first bias for project-like queries
    const ql0 = String(query).toLowerCase();
    const projectTerms = /(project|projects|build|made|moneyverse|spam|classification|ar-dms|robotic|robotics|arm|nurse|face|swapping|recommender|segmentation|historiai|material|estimation)/i;
    if (!results[0]?.item || results[0].item.type !== 'project') {
      if (projectTerms.test(ql0)) {
        const firstProjectIdx = results.findIndex(r => r.item && r.item.type === 'project');
        if (firstProjectIdx > -1) {
          const proj = results[firstProjectIdx];
          results = [proj, ...results.filter((_, i) => i !== firstProjectIdx)];
        }
      }
    }

    const top = results[0];
    const items = results.slice(0, 6).map(r => r.item);

    // Suppress FAQ unless explicitly asked
    let filtered = items;
    const ql = query.toLowerCase();
    const wantsFAQ = /\bfaq\b/i.test(ql) || /^faq[:\s]/i.test(query);
    if (!wantsFAQ && items.some(it => it.type !== 'faq')) {
      filtered = items.filter(it => it.type !== 'faq');
    }

    const lis = [];
    // De-duplicate by title+snippet to avoid repeated lines
    const seen = new Set();
    function calculateRelevanceScore(item, query) {
      // Simple relevance scoring based on keyword matching
      const title = String(item.title || '').toLowerCase();
      const content = String(item.content || '').toLowerCase();
      const tags = Array.isArray(item.tags) ? item.tags.join(' ').toLowerCase() : '';
      
      const queryTerms = query.toLowerCase().split(/\s+/);
      let score = 0;
      
      // Define keyword weights
      const keywordWeights = {
        'rag': 5, 'llm': 4, 'langchain': 4, 'chatbot': 3, 
        'ai': 2, 'ml': 2, 'nlp': 3, 'computer vision': 3, 'cv': 3, 'deep learning': 3,
        'tensorflow': 4, 'pytorch': 4, 'fastapi': 3, 'docker': 2, 'kubernetes': 2
      };
      
      queryTerms.forEach(term => {
        // Exact matches get higher scores
        if (title.includes(term)) score += 3;
        if (content.includes(term)) score += 1;
        if (tags.includes(term)) score += 2;
        
        // Additional weight for technical terms
        if (keywordWeights[term]) {
          if (title.includes(term)) score += keywordWeights[term];
          if (content.includes(term)) score += keywordWeights[term] * 0.5;
          if (tags.includes(term)) score += keywordWeights[term] * 0.8;
        }
      });
      
      return score;
    }

    filtered.forEach(it => {
      const title = escapeHTML(it.title || (it.type === 'faq' ? it.q : ''));
      const raw = String(it.content || it.a || '');
      const snippet = raw.includes('http') ? raw : raw.slice(0, 180);
      const safe = escapeHTML(snippet);
      const key = `${title}|${safe}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (it.href) {
        lis.push(`<li><a href='${it.href}' target='${it.href.startsWith('http') ? '_blank' : '_self'}' rel='noopener'>${title}</a> — ${safe}</li>`);
      } else {
        lis.push(`<li>${title} — ${safe}</li>`);
      }
    });

    // If a project is among the filtered items, render its media (image/video) at the top
    let mediaBlock = '';
    const topProject = filtered.find(it => it.type === 'project');
    if (topProject && topProject.media) {
      const m = topProject.media;
      if (m.image) {
        const alt = escapeHTML(topProject.title || 'project image');
        mediaBlock = `<p><img src='${m.image}' alt='${alt}' style='max-width:100%;border-radius:8px;'></p>`;
      } else if (m.video) {
        const poster = m.poster ? ` poster='${m.poster}'` : '';
        mediaBlock = `<p><video controls${poster} style='max-width:100%;border-radius:8px;'><source src='${m.video}' type='video/mp4'></video></p>`;
      }
    }

    const q = query.toLowerCase();
    if (q.includes('resume') || q.includes('cv')) {
      const resume = state.data.find(d => d.type === 'resume');
      if (resume) lis.unshift(`<li><a href='${resume.href}' download>Download resume</a></li>`);
    }
    if (q.includes('contact') || q.includes('email') || q.includes('linkedin') || q.includes('github') || q.includes('kaggle') || q.includes('whatsapp') || q.includes('upwork')) {
      const contact = state.data.find(d => d.type === 'contact');
      if (contact) lis.unshift(`<li><a href='#contact'>Contact section</a> — ${escapeHTML(contact.content)}</li>`);
    }

    // Enhanced project search
    if (/project|portfolio|work|showcase/i.test(q)) {
      const projects = filtered.filter(r => r.type === 'project');
      if (projects.length > 0) {
        // Sort by relevance to query
        const relevantProjects = projects.sort((a, b) => {
          const aScore = calculateRelevanceScore(a, q);
          const bScore = calculateRelevanceScore(b, q);
          return bScore - aScore;
        });
        
        // Get top 3 most relevant projects
        const topProjects = relevantProjects.slice(0, 3);
        
        // Format the response with project cards
        let projectCards = topProjects.map(project => {
          const title = project.title || 'Project';
          const description = project.content || 'No description available';
          const link = project.href ? 
            `<a href="${project.href}" target="_blank" rel="noopener" class="project-link">View Project →</a>` : '';
            
          return `
            <div class="project-card">
              <h4>${escapeHTML(title)}</h4>
              <p>${escapeHTML(description)}</p>
              ${link}
            </div>
          `;
        }).join('');
        
        return `
          <div class="projects-container">
            <p>Here are some relevant projects:</p>
            ${projectCards}
          </div>
        `;
      }
    }

    return `${mediaBlock}<ul>${lis.join('')}</ul>`;
  }

  // Detect job posting queries (simple heuristic)
  function isJobPostingQuery(q) {
    const s = String(q).toLowerCase();
    return /(job|hiring|role|position|opening|vacancy|we\s+need|can\s+she\s+do|can\s+you\s+do)/i.test(s);
  }

  // Build tailored job-fit answer using local KB (projects + skills)
  function buildJobFitAnswer(query) {
    const ql = String(query).toLowerCase();
    // Keywords extraction for audio-focused roles, etc.
    const wantsAudio = /(audio|speech|asr|stt|tts|whisper|microphone|voice)/i.test(ql);
    const wantsNLP = /(nlp|language|text|rag|llm)/i.test(ql);
    const wantsCV = /(vision|opencv|image|segmentation|cnn)/i.test(ql);
    const wantsBackend = /(api|backend|fastapi|docker)/i.test(ql);

    // Find matching skills/sections
    const skillsItem = (state.data || []).find(d =>
      (d.title && d.title.toLowerCase().includes('skills')) ||
      (d.content && d.content.toLowerCase().includes('skills')) ||
      (Array.isArray(d.tags) && d.tags.join(' ').toLowerCase().includes('skills'))
    );
    const contactItem = (state.data || []).find(d => d.type === 'contact');

    // Pick relevant projects by content match
    const pickProjects = (state.data || []).filter(d => d.type === 'project').filter(p => {
      const text = `${p.title || ''} ${p.content || ''}`.toLowerCase();
      if (wantsAudio && /(whisper|audio|voice|speech|asr|tts)/i.test(text)) return true;
      if (wantsNLP && /(rag|langchain|llm|gpt|sbert|nlp)/i.test(text)) return true;
      if (wantsCV && /(opencv|segmentation|cnn|image|face)/i.test(text)) return true;
      if (wantsBackend && /(fastapi|docker|websocket|api)/i.test(text)) return true;
      // fallback: top few projects
      return false;
    }).slice(0, 3);

    // If no project matched, show 2 representative ones
    const fallbackProjects = pickProjects.length ? [] : (state.data || []).filter(d => d.type === 'project').slice(0, 2);
    const projects = pickProjects.concat(fallbackProjects);

    const bullets = [];
    if (wantsAudio) bullets.push('Audio/Speech: Whisper, TTS, ASR (from Skills)');
    if (wantsNLP) bullets.push('NLP/LLM: RAG, LangChain, GPT/LLaMA, SBERT');
    if (wantsCV) bullets.push('Computer Vision: OpenCV, CNNs, Segmentation');
    if (wantsBackend) bullets.push('Backend & APIs: FastAPI, Docker, WebSockets');

    const projLis = projects.map((p, i) => {
      const t = escapeHTML(p.title || 'Project');
      return p.href ? `<li><a href='${p.href}' target='${p.href.startsWith('http') ? '_blank' : '_self'}' rel='noopener'>${t}</a></li>` : `<li>${t}</li>`;
    }).join('');

    // Sources footer: skills + picked projects
    const sources = [];
    if (skillsItem) sources.push(skillsItem);
    projects.forEach(p => sources.push(p));
    const footerItems = sources.slice(0, 4).map((it, idx) => ({ n: idx + 1, title: it.title || it.q || it.type || 'Item', href: it.href || '' }));
    const citeHtml = footerItems.length
      ? '<br><small>Sources: ' + footerItems.map(c => {
          const t = `[${c.n}] ${escapeHTML(c.title)}`;
          return c.href ? `<a href='${c.href}' target='${c.href.startsWith('http') ? '_blank' : '_self'}' rel='noopener'>${t}</a>` : t;
        }).join(' · ') + '</small>'
      : '';

    const intro = wantsAudio
      ? 'Based on the audio-focused role, here is how Zinal matches and relevant work:'
      : 'Here is how Zinal matches this role and related work:';

    const html = `<small style="opacity:.7">Assistant</small> <p>${escapeHTML(intro)}</p>` +
      (bullets.length ? `<ul>${bullets.map(b => `<li>${escapeHTML(b)}</li>`).join('')}</ul>` : '') +
      (projects.length ? `<p><strong>Relevant projects:</strong></p><ul>${projLis}</ul>` : '') +
      (contactItem ? `<p><a href="#contact">Contact section</a> — ${escapeHTML(contactItem.content || '')}</p>` : '') +
      citeHtml;

    const plain = html.replace(/<[^>]+>/g, '');
    return { html, plain };
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Clean and format the response text
  function formatResponse(text) {
    if (!text) return '';
    
    // Format sources at the end
    text = text.replace(/Sources:\s*\[([^\]]+)\]/g, (match, sources) => {
      const sourceLinks = sources.split(',').map(s => {
        const [num, name] = s.trim().split(' ');
        return `<a href="#${name.toLowerCase()}">${name}</a>`;
      }).join(', ');
      return `<div class="sources"><strong>Sources:</strong> ${sourceLinks}</div>`;
    });
    
    // Fix common formatting issues
    return text
      .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
      .replace(/\s+\n/g, '\n')   // Remove trailing spaces before newlines
      .replace(/\n\s+\n/g, '\n\n') // Normalize spacing between paragraphs
      .replace(/\s{2,}/g, ' ')      // Replace multiple spaces with one
      .trim()
      .replace(/\n/g, '<br>');     // Convert newlines to <br> for HTML
  }

  function onSubmit(e) {
    e.preventDefault();
    const q = (els.input.value || '').trim();
    if (!q) return;

    // Add user message (only once)
    addMessage(escapeHTML(q), 'user');
    els.input.value = '';
    autoResizeTextarea();
    state.history.push({ role: 'user', content: q });
    
    // Track response source
    let responseSource = 'unknown';

    if (!state.fuse) {
      addMessage('Knowledge base not ready. Please try again in a moment.');
      return;
    }

    let results = state.fuse.search(q);
    // Keyword intent fallback if no results or weak results
    if (!results || results.length === 0 || (results[0].score ?? 1) > 0.6) {
      const kw = q.toLowerCase();
      const intents = [
        { test: (s) => /\b(trading|moneyverse)\b/.test(s), tag: 'trading' },
        { test: (s) => /\b(rag|retrieval|knowledge base)\b/.test(s), tag: 'rag' },
        { test: (s) => /\b(resume|cv)\b/.test(s), tag: 'resume' },
        { test: (s) => /\b(contact|email|linkedin|github|kaggle|whatsapp|upwork)\b/.test(s), tag: 'contact' },
        { test: (s) => /\b(skill|skills|stack|technology|technologies|tools)\b/.test(s), tag: 'skills' },
        { test: (s) => /\b(project|projects|work)\b/.test(s), tag: 'projects' },
        { test: (s) => /\b(about|intro|introduction|bio)\b/.test(s), tag: 'about' },
        { test: (s) => /\b(experience|work\s+experience|exp)\b/.test(s), tag: 'experience' },
        { test: (s) => /\b(achievement|achievements|awards|recognition)\b/.test(s), tag: 'achievements' },
      ];
      const hit = intents.find(it => it.test(kw));
      if (hit) {
        const filtered = state.data.filter(d =>
          (d.title && d.title.toLowerCase().includes(hit.tag)) ||
          (d.content && d.content.toLowerCase().includes(hit.tag)) ||
          (Array.isArray(d.tags) && d.tags.join(' ').toLowerCase().includes(hit.tag))
        );
        results = filtered.map(item => ({ item, score: 0.2 }));
      }
    }

    // Optional guided intents (intents.json): if present and a regex matches, seed a synthetic top result
    if ((!results || results.length === 0 || (results[0].score ?? 1) > 0.5) && Array.isArray(state.intents) && state.intents.length) {
      try {
        const match = state.intents.find(int => {
          return (int.patterns || []).some(p => {
            try { return new RegExp(p, 'i').test(q); } catch { return false; }
          });
        });
        if (match) {
          // Prefer mapping the intent to an actual KB item (project/section) for richer context
          let mapped = null;
          if (match.href) {
            const hrefLower = String(match.href).toLowerCase();
            mapped = (state.data || []).find(d => String(d.href || '').toLowerCase() === hrefLower);
          }
          if (!mapped && match.name) {
            const nameLower = String(match.name).toLowerCase();
            mapped = (state.data || []).find(d => String(d.title || '').toLowerCase().includes(nameLower));
          }
          const seed = mapped || { type: 'intent', title: match.name || 'Answer', content: match.answer || '', href: match.href || '', tags: (match.tags || []).concat(['intent']) };
          results = [{ item: seed, score: 0 }, ...(results || [])].slice(0, 6);
        }
      } catch (_) { /* ignore */ }
    }

    // If search is still weak/empty, inject known projects by title keywords for better answers
    if (!results || results.length === 0 || (results[0].score ?? 1) > 0.6) {
      const kw = q.toLowerCase();
      const wanted = [];
      if (/\bhistori(ai)?\b/.test(kw)) wanted.push('histori');
      if (/\bfood\s+classification\b/.test(kw)) wanted.push('food classification');
      if (/\bar[-\s]?dms\b/.test(kw)) wanted.push('ar-dms');
      if (/\bspam\b/.test(kw)) wanted.push('spam');
      const picks = [];
      wanted.forEach(w => {
        const it = (state.data || []).find(d => d.type === 'project' && (
          (d.title || '').toLowerCase().includes(w) || (d.content || '').toLowerCase().includes(w)
        ));
        if (it) picks.push(it);
      });
      if (picks.length) {
        const mapped = picks.map(item => ({ item, score: 0 })).concat(results || []).slice(0, 6);
        results = mapped;
      }
    }

    // Ensure LLM receives the most relevant project context when a project is mentioned
    try {
      const ql2 = q.toLowerCase();
      const mentionsProject = /\b(ar[-\s]?dms|moneyverse|trading|historiai|material|robotic\s+arm|robotic\s+nurse|face\s*swap|linkedin|rewriting|recommendation|segmentation|spam|food|movie)\b/i.test(ql2);
      if (mentionsProject && Array.isArray(results) && results.length) {
        const items = results.map(r => r.item);
        const pick = items.find(it => it.type === 'project' && (
          (it.title || '').toLowerCase().includes('ar-dms') ||
          (it.title || '').toLowerCase().includes('moneyverse') ||
          (it.title || '').toLowerCase().includes('histori') ||
          (it.title || '').toLowerCase().includes('material') ||
          (it.title || '').toLowerCase().includes('robotic') ||
          (it.title || '').toLowerCase().includes('face') ||
          (it.title || '').toLowerCase().includes('rewriting') ||
          (it.title || '').toLowerCase().includes('recommendation') ||
          (it.title || '').toLowerCase().includes('segmentation') ||
          (it.title || '').toLowerCase().includes('spam') ||
          (it.content || '').toLowerCase().includes('ar-dms') ||
          (it.content || '').toLowerCase().includes('moneyverse') ||
          (it.content || '').toLowerCase().includes('histori') ||
          (it.content || '').toLowerCase().includes('material')
        ));
        if (pick) {
          const reordered = [pick, ...items.filter(it => it !== pick)].slice(0, 6).map(it => ({ item: it, score: 0 }));
          results = reordered;
        }
      }
    } catch (_) { /* ignore */ }

    // Inject high-priority sections/items into context for LLM when explicitly requested
    try {
      const ensureFront = (predicate) => {
        const found = (state.data || []).find(predicate);
        if (!found) return;
        const exists = Array.isArray(results) && results.some(r => r.item === found);
        if (!exists) results = [{ item: found, score: 0 }, ...(results || [])].slice(0, 6);
      };
      const ql3 = q.toLowerCase();
      if (/\b(resume|cv)\b/i.test(ql3)) ensureFront(d => d.type === 'resume');
      if (/\b(contact|email|linkedin|github|kaggle|whatsapp|upwork)\b/i.test(ql3)) ensureFront(d => d.type === 'contact');
      if (/\b(skill|skills|stack|technology|technologies|tools)\b/i.test(ql3)) ensureFront(d => (d.title || '').toLowerCase() === 'skills' || d.href === '#skills');
      if (/\b(award|awards|achievement|achievements|recognition)\b/i.test(ql3)) ensureFront(d => (d.title || '').toLowerCase() === 'achievements' || d.href === '#achievements');
    } catch (_) { /* ignore */ }

    // Try LLM via serverless API first; gracefully fall back
    (async () => {
      showTyping();
      // If job posting intent, answer locally with tailored mapping and return
      if (isJobPostingQuery(q)) {
        responseSource = 'job_posting_matcher';
        const job = buildJobFitAnswer(q);
        hideTyping();
        addMessage(job.html, 'bot', responseSource);
        state.history.push({ role: 'assistant', content: (job.plain || '').trim() });
        return;
      }

      // Check cache first
      const cacheKey = q.toLowerCase().trim();
      if (state.cache.has(cacheKey)) {
        const cached = state.cache.get(cacheKey);
        hideTyping();
        addMessage(cached.html, 'bot', 'cached_llm');
        state.history.push({ role: 'assistant', content: (cached.plain || '').trim() });
        return;
      }

      // Set source for LLM responses
      responseSource = 'llm';

      const answer = await tryLLM(q, results);
      hideTyping();
      if (answer && answer.ok) {
        // Cache the response
        state.cache.set(cacheKey, { html: answer.html, plain: answer.plain });
        // If streaming path already rendered, don't render again
        if (!answer.rendered && answer.html) {
          addMessage(answer.html, 'bot', responseSource);
          state.history.push({ role: 'assistant', content: (answer.plain || '').trim() });
        }
        return;
      }
      responseSource = 'knowledge_base';
      let fallback = buildAnswer(q, results);
      fallback = highlightHTML(fallback, q);
      const prefix = (answer && answer.badge) ? answer.badge : '';
      addMessage(prefix + fallback, 'bot', responseSource);
      state.history.push({ role: 'assistant', content: fallback.replace(/<[^>]+>/g, '') });
    })();
  }

  // Validator to catch only grossly malformed HTML; sanitization is handled by DOMPurify in addMessage()
  function isValidLLMHtml(html) {
    if (!html || typeof html !== 'string') {
      console.warn('[chat] Invalid HTML: not a string or empty');
      return false;
    }
    
    // Try to fix common issues
    let fixedHtml = html
      // Fix unclosed tags
      .replace(/<li>(?![\s\S]*?<\/li>)/g, '<li>$&</li>')
      // Fix unclosed lists
      .replace(/<ul>(?![\s\S]*?<\/ul>)/g, '<ul>$&</ul>')
      // Remove any unclosed tags at the end
      .replace(/<[^>]*$/, '');
      
    // If we made fixes, log them
    if (fixedHtml !== html) {
      console.warn('[chat] Fixed HTML issues:', { original: html, fixed: fixedHtml });
      html = fixedHtml;
    }
    
    // Basic validation
    const s = html.toLowerCase();
    
    // Check for grossly malformed HTML
    if (/<[a-z][^>]*>[^<]*(<|$)/.test(s)) {
      console.warn('[chat] Rejected: unclosed tag detected');
      return false;
    }
    
    // Check for balanced tags (simplified to be less strict)
    const openTags = (s.match(/<([a-z]+)[^>]*>/g) || []).map(tag => tag.match(/<([a-z\-]+)/i)[1]);
    const closeTags = (s.match(/<\/([a-z\-]+)[^>]*>/g) || []).map(tag => tag.match(/\/([a-z\-]+)/i)[1]);
    
    // Only check if we have any tags at all
    if ((openTags.length > 0 || closeTags.length > 0) && openTags.length !== closeTags.length) {
      console.warn('[chat] Warning: unbalanced tags, but allowing anyway', { 
        openTags, 
        closeTags,
        diff: openTags.length - closeTags.length
      });
      // Don't reject for unbalanced tags - just log and continue
    }
    
    return true;
  }

  // LLM call with badges and logging (supports SSE streaming)
  async function tryLLM(query, results) {
    let contextItems = (results || []).slice(0, 6).map(r => r.item);
    const ql = String(query).toLowerCase();
    const wantsFAQ = /\bfaq\b/i.test(ql) || /^faq[:\s]/i.test(query);
    if (!wantsFAQ && contextItems.some(it => it.type !== 'faq')) {
      contextItems = contextItems.filter(it => it.type !== 'faq');
    }

    // Helper to deduplicate items by href+title for source footer
    const dedupeByHrefTitle = (arr) => {
      const seen = new Set();
      const out = [];
      for (const it of arr) {
        const key = `${String(it.title || it.q || it.type || 'Item')}|${String(it.href || '')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
      }
      return out;
    };

    // Canonicalize known profile URLs using contact item content
    const canonicalizeUrls = (html) => {
      try {
        const contact = (state.data || []).find(d => d.type === 'contact');
        if (!contact) return html;
        const text = String(contact.content || '');
        const get = (re) => (text.match(re) || [null])[0];
        const canon = {
          linkedin: get(/https?:\/\/[^\s]*linkedin[^\s]*/i),
          github: get(/https?:\/\/[^\s]*github[^\s]*/i),
          kaggle: get(/https?:\/\/[^\s]*kaggle[^\s]*/i),
          wa: get(/https?:\/\/wa\.me\/[0-9]+/i),
        };
        let out = String(html);
        if (canon.linkedin) out = out.replace(/https?:\/\/www?\.linkedin\.com\/[A-Za-z0-9_\-/.]+/gi, canon.linkedin);
        if (canon.github) out = out.replace(/https?:\/\/github\.com\/[A-Za-z0-9_\-/.]+/gi, canon.github);
        if (canon.kaggle) out = out.replace(/https?:\/\/(?:www\.)?kaggle\.com\/[A-Za-z0-9_\-/.]*/gi, canon.kaggle);
        if (canon.wa) out = out.replace(/https?:\/\/wa\.me\/\+?\d+/gi, canon.wa);
        return out;
      } catch { return html; }
    };
    try {
      console.debug('[chat] calling /api/chat (stream)', { query, contextItemsCount: contextItems.length, history: state.history.slice(-6).length });
      const resp = await fetch('/api/chat?stream=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({ query, contextItems, history: state.history.slice(-6) })
      });
      const status = resp.status;
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.error('[chat] /api/chat error', status, text);
        return { ok: false, badge: `<small style="opacity:.7">Assistant</small> ` };
      }

      const ct = String(resp.headers.get('content-type') || '');
      // If server streams SSE, render tokens live
      if (/text\/(event-stream|plain)/i.test(ct) && resp.body && resp.body.getReader) {
        let body = '';
        // Replace typing bubble with a live message container
        if (els._typing && els._typing.parentNode) {
          els._typing.parentNode.removeChild(els._typing);
          els._typing = null;
        }
        const liveDiv = document.createElement('div');
        liveDiv.className = 'msg bot';
        liveDiv.innerHTML = ' ';
        els.messages.appendChild(liveDiv);
        scrollMessagesToEnd();

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let doneAll = false;
        while (true) {
          const { value, done } = await reader.read();
          if (done) { doneAll = true; break; }
          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE lines
          const lines = chunk.split(/\n\n|\r\n\r\n/).filter(Boolean);
          for (const l of lines) {
            const line = l.trim();
            if (!line) continue;
            const dataMatch = line.split(/\n/).find(x => x.startsWith('data:'));
            if (!dataMatch) continue;
            const payload = dataMatch.replace(/^data:\s*/, '');
            if (payload === '[DONE]') continue;
            try {
              // Server sends JSON-stringified delta; if plain string, handle too
              const delta = JSON.parse(payload);
              if (typeof delta === 'string' && delta) {
                body += delta;
                if (window && window.DOMPurify) {
                  liveDiv.innerHTML = window.DOMPurify.sanitize(String(body), {
                    ALLOWED_TAGS: ['p','ul','li','strong','em','a','small','br','mark','img','video','source'],
                    ALLOWED_ATTR: ['href','target','rel','download','src','poster','controls','alt','type']
                  });
                } else {
                  liveDiv.innerHTML = body;
                }
                scrollMessagesToEnd();
              }
            } catch (_) { /* ignore */ }
          }
        }
        // Finalize: canonicalize, validate, add badge + sources, push history
        body = canonicalizeUrls(body);
        // Always try to display the response, even if validation fails
        const isValid = isValidLLMHtml(body);
        if (!isValid) {
          console.warn('[chat] HTML validation issues, but displaying anyway', { body });
          // Try to clean up any obvious issues
          body = body
            .replace(/<[^>]*(?=<|$)/g, '') // Remove unclosed tags at the end
            .replace(/<li>(?![\s\S]*?<\/li>)/g, '<li>$&</li>') // Fix unclosed list items
            .replace(/<ul>(?![\s\S]*?<\/ul>)/g, '<ul>$&</ul>'); // Fix unclosed lists
        }
        
        // Build sources footer (prioritize non-FAQ) with de-duplication
        const prioritized = dedupeByHrefTitle(contextItems.filter(it => it.type !== 'faq').concat(contextItems.filter(it => it.type === 'faq')));
        const footerItems = prioritized.slice(0, 4).map((it, idx) => ({
          n: idx + 1,
          title: it.title || it.q || it.type || 'Item',
          href: it.href || ''
        }));
        const citeHtml = footerItems.length
          ? '<br><small>Sources: ' + footerItems.map(c => {
              const t = `[${c.n}] ${escapeHTML(c.title)}`;
              return c.href ? `<a href='${c.href}' target='${c.href.startsWith('http') ? '_blank' : '_self'}' rel='noopener'>${t}</a>` : t;
            }).join(' · ') + '</small>'
          : '';
        // Prepend resume/contact if missing
        let prefix = '';
        const resumeItem = (state.data || []).find(d => d.type === 'resume');
        if ((/\b(resume|cv)\b/).test(ql) && resumeItem && resumeItem.href && !body.includes(String(resumeItem.href))) {
          prefix += `<p><a href='${resumeItem.href}' download>Download resume (PDF)</a></p>`;
        }
        const contactItem = (state.data || []).find(d => d.type === 'contact');
        const alreadyHasContact = /linkedin\.com|github\.com|kaggle\.com|wa\.me|upwork\.com|#contact|mailto:/i.test(body);
        if ((/\b(contact|email|linkedin|github|kaggle|whatsapp|upwork)\b/).test(ql) && contactItem && !alreadyHasContact) {
          prefix += `<p><a href='#contact'>Contact section</a> — ${escapeHTML(contactItem.content || '')}</p>`;
        }
        const badge = `<small style="opacity:.7">Assistant</small> `;
        const finalHtml = `${badge}${prefix}${body}${citeHtml}`;
        if (window && window.DOMPurify) {
          liveDiv.innerHTML = window.DOMPurify.sanitize(String(finalHtml), {
            ALLOWED_TAGS: ['p','ul','li','strong','em','a','small','br','mark','img','video','source'],
            ALLOWED_ATTR: ['href','target','rel','download','src','poster','controls','alt','type']
          });
        } else {
          liveDiv.innerHTML = finalHtml;
        }
        // Save assistant message to history (plain text)
        state.history.push({ role: 'assistant', content: finalHtml.replace(/<[^>]+>/g, '') });
        return { ok: true, html: finalHtml, plain: finalHtml.replace(/<[^>]+>/g, ''), rendered: true };
      }

      // Non-stream fallback (JSON)
      const data = await resp.json();
      let body = String(data.answer || '');
      body = canonicalizeUrls(body);
      if (!isValidLLMHtml(body)) {
        console.warn('[chat] LLM HTML rejected due to validity check, falling back to local.');
        return { ok: false, badge: `<small style=\"opacity:.7\">Assistant</small> ` };
      }
      const prioritized = dedupeByHrefTitle(contextItems.filter(it => it.type !== 'faq').concat(contextItems.filter(it => it.type === 'faq')));
      const footerItems = prioritized.slice(0, 4).map((it, idx) => ({ n: idx + 1, title: it.title || it.q || it.type || 'Item', href: it.href || '' }));
      const citeHtml = footerItems.length
        ? '<br><small>Sources: ' + footerItems.map(c => {
            const t = `[${c.n}] ${escapeHTML(c.title)}`;
            return c.href ? `<a href='${c.href}' target='${c.href.startsWith('http') ? '_blank' : '_self'}' rel='noopener'>${t}</a>` : t;
          }).join(' · ') + '</small>'
        : '';
      let prefix = '';
      const resumeItem = (state.data || []).find(d => d.type === 'resume');
      if ((/\b(resume|cv)\b/).test(ql) && resumeItem && resumeItem.href && !body.includes(String(resumeItem.href))) {
        prefix += `<p><a href='${resumeItem.href}' download>Download resume (PDF)</a></p>`;
      }
      const contactItem = (state.data || []).find(d => d.type === 'contact');
      const alreadyHasContact = /linkedin\.com|github\.com|kaggle\.com|wa\.me|upwork\.com|#contact|mailto:/i.test(body);
      if ((/\b(contact|email|linkedin|github|kaggle|whatsapp|upwork)\b/).test(ql) && contactItem && !alreadyHasContact) {
        prefix += `<p><a href='#contact'>Contact section</a> — ${escapeHTML(contactItem.content || '')}</p>`;
      }
      // Guard: deny-knowledge check
      const projectLike = /(project|projects|build|made|moneyverse|spam|classification|ar-dms|robotic|robotics|arm|nurse|face|swapping|recommender|segmentation|historiai|material|estimation)/i.test(String(query));
      const hasProjectContext = contextItems.some(it => it.type === 'project');
      const denies = /not\s+mentioned|no\s+(?:project|details)\s+(?:mentioned|found)/i.test(body);
      if (projectLike && hasProjectContext && denies) {
        return { ok: false, badge: `<small style=\"opacity:.7\">Assistant</small> ` };
      }
      const badge = `<small style="opacity:.7">Assistant</small> `;
      const html = `${badge}${prefix}${body}${citeHtml}`;
      const plain = html.replace(/<[^>]+>/g, '');
      return { ok: true, html, plain, rendered: false };
    } catch (e) {
      console.warn('LLM failed, falling back to local answer:', e);
      const badge = `<small style=\"opacity:.7\">Assistant</small> `;
      return { ok: false, badge };
    }
  }

  function autoResizeTextarea() {
    if (!els.input) return;
    els.input.style.height = 'auto';
    const max = 140; // px
    els.input.style.height = Math.min(els.input.scrollHeight, max) + 'px';
  }

  function renderSuggestions() {
    if (!els.sugs) return;
    els.sugs.innerHTML = '';

    const suggestions = buildSuggestions();
    suggestions.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = p;
      b.addEventListener('click', () => {
        els.input.value = p;
        autoResizeTextarea();
        els.form.requestSubmit();
      });
      els.sugs.appendChild(b);
    });
  }

  function buildSuggestions() {
    const out = [];
    // 1) Recent queries
    try {
      const raw = localStorage.getItem('chat_recent') || '[]';
      const recents = JSON.parse(raw).slice(0, 3);
      out.push(...recents);
    } catch (_) {}

    // 2) Top projects from knowledge
    const projects = (state.data || []).filter(d => d.type === 'project').slice(0, 2);
    projects.forEach(p => out.push(`Tell me about ${p.title}`));

    // 3) Core intents
    out.push('What are your core skills?');
    out.push('Share your resume');
    out.push('How can I contact you?');

    // 4) Optional guided prompts from intents.json
    if (Array.isArray(state.intents)) {
      state.intents.slice(0, 3).forEach(i => { if (i.prompt) out.push(i.prompt); });
    }

    // De-duplicate and cap to 6
    const uniq = Array.from(new Set(out.filter(Boolean).map(s => s.trim()))).slice(0, 6);
    return uniq;
  }

  function startVoiceRecognition() {
    // Check if already listening
    if (state.listening) {
      stopVoiceRecognition();
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      showVoiceFeedback('Voice recognition not supported in this browser. Try Chrome or Edge.', 'error');
      return;
    }

    // Check for HTTPS or localhost (required for microphone access)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      showVoiceFeedback('Voice recognition requires HTTPS. Please serve the site over HTTPS or use localhost.', 'error');
      return;
    }

    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.interimResults = true; // Show interim results
    recognition.maxAlternatives = 5;   // Get more alternatives for better accuracy
    recognition.continuous = true;     // Enable continuous listening

    // Store recognition in state so we can stop it later
    state.recognition = recognition;
    state.listening = true;

    recognition.onstart = () => {
      showVoiceFeedback('Listening... Speak now', 'listening');
      els.voiceBtn.classList.add('listening');
      els.voiceBtn.setAttribute('aria-label', 'Stop listening');
      els.voiceBtn.title = 'Click to stop listening';
      document.body.classList.add('voice-active');
    };

    recognition.onresult = (event) => {
      // Get the most confident result
      const result = event.results[event.resultIndex];
      const transcript = result[0].transcript.trim();
      
      // Update input field with interim results
      if (result.isFinal) {
        // If this is a final result, add a space for the next utterance
        els.input.value = transcript + ' ';
        // Auto-submit if there's enough content and a short pause
        if (transcript.length > 3 && !result[0].confidence || result[0].confidence > 0.7) {
          setTimeout(() => {
            if (els.input.value.trim()) {
              addMessage(`Voice input: "${escapeHTML(els.input.value.trim())}"`, 'user');
              els.form.requestSubmit();
              els.input.value = '';
              autoResizeTextarea();
            }
          }, 500);
        }
      } else {
        // Show interim results
        els.input.value = transcript;
      }
      autoResizeTextarea();
    };

    recognition.onerror = (event) => {
      console.error('Voice recognition error:', event.error, event.message || '');
      let errorMsg = 'Voice recognition failed. ';
      switch (event.error) {
        case 'not-allowed':
        case 'permission-denied':
          errorMsg = 'Microphone access denied. Please allow microphone permissions in your browser settings.';
          break;
        case 'service-not-allowed':
          errorMsg = 'Speech recognition service blocked. Please enable it in your browser settings.';
          break;
        case 'no-speech':
          // Don't show error for no-speech, just stop listening
          stopVoiceRecognition();
          return;
        case 'audio-capture':
          errorMsg = 'Microphone not found or not working. Please check your microphone.';
          break;
        case 'network':
          errorMsg = 'Network error. Please check your internet connection.';
          break;
        case 'language-not-supported':
          errorMsg = 'Language not supported. Try a different language.';
          break;
        default:
          errorMsg = 'Error with voice recognition. Please try again.';
      }
      showVoiceFeedback(errorMsg, 'error');
      stopVoiceRecognition();
    };

    recognition.onend = () => {
      if (state.listening) {
        // If we're still supposed to be listening, restart recognition
        try {
          recognition.start();
        } catch (e) {
          console.error('Failed to restart recognition:', e);
          stopVoiceRecognition();
        }
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
      showVoiceFeedback('Failed to start voice recognition. Please try again.', 'error');
      stopVoiceRecognition();
    }
  }

  function stopVoiceRecognition() {
    if (state.recognition) {
      try {
        state.recognition.stop();
      } catch (e) {
        console.error('Error stopping recognition:', e);
      }
      state.recognition = null;
    }
    state.listening = false;
    els.voiceBtn.classList.remove('listening');
    els.voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    els.voiceBtn.setAttribute('aria-label', 'Start voice input');
    els.voiceBtn.title = 'Click to speak';
    document.body.classList.remove('voice-active');
  }

  function showVoiceFeedback(message, type = 'info') {
    // Create or update feedback element
    let feedbackEl = document.getElementById('voice-feedback');
    if (!feedbackEl) {
      feedbackEl = document.createElement('div');
      feedbackEl.id = 'voice-feedback';
      document.body.appendChild(feedbackEl);
    }
    
    feedbackEl.textContent = message;
    feedbackEl.className = `voice-feedback ${type}`;
    
    // Auto-hide after 3 seconds for non-error messages
    if (type !== 'error') {
      clearTimeout(feedbackEl.hideTimer);
      feedbackEl.hideTimer = setTimeout(() => {
        feedbackEl.classList.add('fade-out');
        setTimeout(() => feedbackEl.remove(), 300);
      }, 3000);
    }
  }

  // Text-to-speech functionality
  function speakMessage(text) {
    // Cancel any ongoing speech
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      return;
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set voice preferences
    const voices = window.speechSynthesis.getVoices();
    const preferredVoices = voices.filter(voice => 
      voice.lang.startsWith('en-') && voice.name.includes('Female')
    );
    
    if (preferredVoices.length > 0) {
      utterance.voice = preferredVoices[0];
    } else if (voices.length > 0) {
      utterance.voice = voices[0];
    }
    
    // Set speech properties
    utterance.pitch = 1;
    utterance.rate = 1;
    utterance.volume = 1;
    
    // Handle speech events
    utterance.onstart = () => {
      document.body.classList.add('speaking');
    };
    
    utterance.onend = utterance.onerror = () => {
      document.body.classList.remove('speaking');
    };
    
    // Start speaking
    window.speechSynthesis.speak(utterance);
  }
  
  // Show temporary tooltip
  function showTemporaryTooltip(element, text) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = text;
    
    const rect = element.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.top + window.scrollY - 30}px`;
    
    document.body.appendChild(tooltip);
    
    // Remove after animation
    setTimeout(() => {
      tooltip.classList.add('fade-out');
      setTimeout(() => tooltip.remove(), 300);
    }, 1500);
  }

  function bindUI() {
    // Initialize speech synthesis voices when they become available
    if (window.speechSynthesis) {
      // Some browsers load voices asynchronously
      const loadVoices = () => {
        // This is just to ensure voices are loaded
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) {
          window.speechSynthesis.onvoiceschanged = loadVoices;
        } else {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
      
      loadVoices();
      
      // Re-check voices on page load
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    els.btn = qs('#chatbot-btn');
    els.root = qs('#chatbot');
    els.close = qs('.chatbot-close', els.root);
    els.messages = qs('#chatbot-messages');
    els.form = qs('#chatbot-form');
    els.input = qs('#chatbot-query');
    els.sugs = qs('#chatbot-suggestions');
    els.voiceBtn = qs('#voice-btn');

    if (!els.btn || !els.root) return;

    els.btn.addEventListener('click', openChat);
    if (els.close) els.close.addEventListener('click', closeChat);
    els.root.addEventListener('click', (e) => { if (e.target === els.root) closeChat(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.isOpen) closeChat(); });
    if (els.form) els.form.addEventListener('submit', onSubmit);
    if (els.voiceBtn) els.voiceBtn.addEventListener('click', startVoiceRecognition);

    if (els.input) {
      // Enter to send, Shift+Enter for newline
      els.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          els.form && els.form.requestSubmit();
        }
      });
      // Auto-resize
      els.input.addEventListener('input', autoResizeTextarea);
      autoResizeTextarea();
    }

    renderSuggestions();
  }

  function init() {
    bindUI();
    loadKnowledge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
