// Vercel Serverless Function: /api/chat
// Uses GROQ_API_KEY from Vercel environment variables

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });
      return;
    }

    const envModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    const envMax = Number(process.env.GROQ_MAX_TOKENS || 900);
    const { query, contextItems = [], history = [], model = envModel, max_tokens = envMax } = req.body || {};
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Missing query' });
      return;
    }

    // Build RAG prompt from contextItems
    const sources = contextItems
      .slice(0, 6)
      .map((it, i) => `#${i + 1} Title: ${it.title || it.q || it.type || 'Item'}\nURL: ${it.href || ''}\nText: ${it.content || it.a || ''}`)
      .join('\n\n');

    const systemPrompt = `System: You are Zinal Raval’s AI Portfolio Assistant.

Answer shaping:
- Prioritize clarity, impact, and relevance to the user’s ask.
- When summarizing a project, mention the concrete problem, approach, and outcome in 1–2 sentences.
- Prefer action verbs and measurable outcomes where present in Sources (e.g., "achieved", "enabled").
- For questions about capabilities or experience (e.g., "Can you do trading-related projects?"), respond as an assistant, e.g., "Yes, Zinal can work on trading-related projects."

Hard rules (grounding):
- Answer using ONLY the provided Sources. If info is missing, say so and suggest the most relevant section.
- Do not invent facts, acronyms, repositories, or project names.
- Preserve exact names/casing from Sources (e.g., "scikit-learn", "LLaMA", "FAISS").
- Copy emails, URLs, and filenames VERBATIM from Sources. Do not reconstruct or guess. If a href is present, use that exact value.
- Use inline numeric citations like [1], [2] that map to the numbered Sources items.
- Prefer fully qualified external URLs (http/https). Otherwise, use section anchors (e.g., #skills).
- If multiple sources conflict, state the ambiguity briefly and prefer the most specific project/source.

Site structure (from index.html):
- When linking to on-page sections, use these exact anchors if present in Sources:
  #about, #skills, #projects, #achievements, #experience, #contact.
- If providing a resume link and a local href is present in Sources, use it exactly as provided (e.g., 'Zinal Raval.pdf') and do not rename it. If the resume link appears on-page, you may present it as a direct <a> link as described below.
- When referencing a project that has a GitHub URL in Sources, include that URL as the Repository link.

Output format (strict HTML only):
- Start with one concise paragraph: <p>…</p>
- Optionally add up to 3–5 bullets: <ul><li>…</li></ul>
- Allowed tags: p, ul, li, strong, em, a, br, small. No markdown. Close all tags.
- Do NOT output raw HTML attribute text like: a href="…" in plain text. Always render proper <a> elements.
- Keep it concise; prefer complete short sentences over truncation. Never end mid-tag. Answers should generally fit within ~6-10 sentences total.
- Lists MUST be valid: open with <ul>, each item in <li>…</li>, and close </ul>. Do not emit bare "-" bullets.
- Never output stray angle bracket placeholders like "<>" or fragments like "li>". If unsure, prefer a single <p> over a broken list.

Deterministic behaviors:
- Resume: If asked, begin with a single canonical link from the resume Source item: <p><a href='RESUME_HREF' download>Download resume (PDF)</a></p>. Then one short sentence if needed. Do not mention or guess any other filenames.
- Contact: Output email and profile URLs as proper <a> tags, exactly as in Sources. Do not alter characters.
- Terminology: Expand "RAG" as "Retrieval-Augmented Generation". Do NOT call it "Reinforcement". Use exact tech names from Sources.
- Skills: Group into 3–4 compact bullets — AI/ML/NLP, Backend & APIs, Databases, DevOps/Cloud — using items present in Sources.

Citations & omissions:
- If a statement has no support in the provided Sources, omit it or explicitly state it is not available in Sources.
- If any required element (email, URL, resume href) is absent from Sources, say it’s not provided and stop rather than guessing.
- Do NOT include FAQ content or wording unless the user explicitly asks for "FAQ" or a specific FAQ question; keep answers focused on the requested section (resume, contact, skills, project, achievements, experience).

Query type guidance:
- Resume/CV → Start with the canonical resume link. Keep it brief.
- Contact → Include email and key profiles as links, copied verbatim. Keep it brief.
- Skills → Grouped bullets as above; no unrelated content.
- Project → Follow the project template and prefer impact-oriented summary.
- Achievements/Experience → Pull concise items from Sources; avoid repetition.

Output:
- Return ONLY the main HTML answer with inline citations. Do NOT append a "Sources" list; the client will render sources.`;

    const userPrompt = `User Question: ${query}\n\nSources:\n${sources}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6),
      { role: 'user', content: userPrompt },
    ];

    const wantsStream = (req.query && req.query.stream === '1') || /text\/event-stream/i.test(String(req.headers['accept'] || ''));

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        top_p: 0.1,
        max_tokens,
        stream: true,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      res.status(502).json({ error: 'Groq API error', detail: t });
      return;
    }

    // If client wants SSE, proxy deltas as SSE
    if (wantsStream && resp.body?.getReader) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      // Immediately flush headers
      if (res.flushHeaders) res.flushHeaders();

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let doneAll = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) { doneAll = true; break; }
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split(/\n/).map(l => l.trim()).filter(Boolean);
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.replace(/^data:\s*/, '');
            if (payload === '[DONE]') {
              // signal end
              res.write(`event: done\n`);
              res.write(`data: [DONE]\n\n`);
              continue;
            }
            try {
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta?.content || '';
              if (delta) {
                res.write(`data: ${JSON.stringify(delta)}\n\n`);
              }
            } catch (_) { /* ignore parse errors */ }
          }
        }
      } catch (e) {
        // best-effort end
      } finally {
        if (!doneAll) {
          res.write(`event: done\n`);
          res.write(`data: [DONE]\n\n`);
        }
        res.end();
      }
      return; // already responded via stream
    }

    // Aggregate full content for non-stream clients
    let content = '';
    if (resp.body?.getReader) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split(/\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.replace(/^data:\s*/, '');
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content || '';
            if (delta) content += delta;
          } catch (_) { /* ignore parse errors */ }
        }
      }
    } else {
      const data = await resp.json();
      content = data?.choices?.[0]?.message?.content || '';
    }

    // Build citations from provided context (client also builds footer; this is kept for parity)
    const citations = contextItems.slice(0, 4).map(it => ({ title: it.title || it.q || it.type, href: it.href || '' }));
    res.status(200).json({ answer: content, citations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
}
