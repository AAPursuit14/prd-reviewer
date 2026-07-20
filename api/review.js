const BASE_PROMPT = `You are a PRD reviewer for a student builder program. Evaluate the PRD against these 4 criteria and return ONLY valid JSON — no markdown, no backticks, no preamble, no safety labels, no extra text before or after the JSON.

CRITERIA:
1. Problem Statement & Purpose — Is the problem specific, grounded in a real user need, with a defined target user?
2. Scope, Feasibility & Resources (3-Day Rule) — Can a small team build a working version in 3 days with free/accessible tools? Evaluate scope and resource dependencies together.
RESOURCE_RULE_PLACEHOLDER
3. Technical Clarity — Is the tech stack specified and appropriate? Can a developer start building from this document?
4. User Definition & Core Feature Alignment — Do features serve the stated user and problem?

RATING SCALE:
- "pass" = Meets Standard
- "warning" = Needs Improvement  
- "fail" = Does Not Meet Standard

APPROVAL LOGIC:
- 4 pass → "approved"
- 3 pass + 1 warning → "approved_with_notes"
- 2 or fewer pass, or any fail → "needs_revision"

Respond with this exact JSON structure:
{
  "product_name": "string",
  "criteria": [
    {"name": "Problem statement and purpose", "rating": "pass|warning|fail", "notes": "1-2 sentences referencing specific parts of the PRD"},
    {"name": "Scope, feasibility and resources", "rating": "pass|warning|fail", "notes": "..."},
    {"name": "Technical clarity", "rating": "pass|warning|fail", "notes": "..."},
    {"name": "User and feature alignment", "rating": "pass|warning|fail", "notes": "..."}
  ],
  "verdict": "approved|approved_with_notes|needs_revision",
  "summary": {
    "what_works": "2-3 sentences highlighting the strongest parts of this PRD — what the Builder got right and should keep.",
    "what_needs_work": "2-3 sentences summarizing the key issues holding this PRD back. Be specific about what is missing or unclear."
  },
  "action_items": ["specific next step 1", "specific next step 2"]
}`;

const STANDARD_RESOURCE_RULE = `For Criterion 2, the team must use only free-tier tools, open-source libraries, or publicly available APIs. No paid services, proprietary datasets, specialized hardware, or real user data collection are allowed. A project that would take 3 days with a paid API the team cannot access does not pass.`;

const CAPSTONE_RESOURCE_RULE = `For Criterion 2, this is a CAPSTONE project. The team has access to $20–$50 in API credits to use toward their build. Paid API dependencies are acceptable IF the estimated cost falls within that $20–$50 budget for development and initial testing. Flag any dependency that would clearly exceed this budget. Free-tier tools and open-source libraries are still preferred where possible, but paid APIs (such as OpenAI, Claude, hosted databases, or cloud services with usage-based pricing) are allowed within the budget. Specialized hardware and real user data collection that requires IRB or consent infrastructure are still not acceptable.`;

function getSystemPrompt(mode) {
  const rule = mode === "capstone" ? CAPSTONE_RESOURCE_RULE : STANDARD_RESOURCE_RULE;
  return BASE_PROMPT.replace("RESOURCE_RULE_PLACEHOLDER", rule);
}

function extractJSON(text) {
  let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in model response");
  }
  return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
}

function validateReview(parsed) {
  if (!parsed.product_name || typeof parsed.product_name !== "string") {
    throw new Error("Missing or invalid product_name");
  }
  if (!Array.isArray(parsed.criteria) || parsed.criteria.length !== 4) {
    throw new Error("Missing or invalid criteria array");
  }
  const validRatings = ["pass", "warning", "fail"];
  for (const c of parsed.criteria) {
    if (!c.name || !validRatings.includes(c.rating) || !c.notes) {
      throw new Error("Invalid criterion entry: " + JSON.stringify(c));
    }
  }
  const validVerdicts = ["approved", "approved_with_notes", "needs_revision"];
  if (!validVerdicts.includes(parsed.verdict)) {
    throw new Error("Invalid verdict: " + parsed.verdict);
  }
  if (!Array.isArray(parsed.action_items) || parsed.action_items.length === 0) {
    throw new Error("Missing or empty action_items");
  }
  return parsed;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY is not configured" });
  }

  const { prd, mode, provider } = req.body;

  if (!prd || typeof prd !== "string") {
    return res.status(400).json({ error: "Missing or invalid PRD content. Please paste text." });
  }

  const trimmed = prd.trim();

  if (trimmed.length === 0) {
    return res.status(400).json({ error: "PRD content is empty. Please paste the full PRD text." });
  }

  if (trimmed.length < 50) {
    return res.status(400).json({ error: "PRD content is too short to review. A PRD should include a problem statement, features, target users, and tech stack." });
  }

  const nonTextRatio = (trimmed.match(/[^\x20-\x7E\n\r\t]/g) || []).length / trimmed.length;
  if (nonTextRatio > 0.3) {
    return res.status(400).json({ error: "The submitted content does not appear to be a text document. Please paste the PRD as plain text." });
  }

  const reviewMode = mode === "capstone" ? "capstone" : "standard";
  const systemPrompt = getSystemPrompt(reviewMode);

  // Determine which provider to use
  const useAnthropic = provider === "anthropic";

  if (useAnthropic) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured. Add it in Vercel → Settings → Environment Variables." });
    }
  }

  const fetchUrl = useAnthropic
    ? "https://api.anthropic.com/v1/messages"
    : "https://openrouter.ai/api/v1/chat/completions";

  const fetchHeaders = useAnthropic
    ? {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      }
    : {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      };

  const fetchBody = useAnthropic
    ? {
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: `Review this PRD:\n\n${trimmed}` }],
      }
    : {
        model: "openrouter/free",
        max_tokens: 1500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Review this PRD:\n\n${trimmed}` },
        ],
      };

  try {
    const response = await fetch(fetchUrl, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify(fetchBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      const providerName = useAnthropic ? "Anthropic" : "OpenRouter";
      return res.status(response.status).json({ error: `${providerName} API error (${response.status}): ${errText}` });
    }

    const data = await response.json();

    // Anthropic returns data.content[].text, OpenRouter returns data.choices[].message.content
    const raw = useAnthropic
      ? (data.content?.map((b) => b.text || "").join("") || "")
      : (data.choices?.[0]?.message?.content || "");

    if (!raw || raw.trim().length === 0) {
      return res.status(502).json({ error: "The AI model returned an empty response. Try again." });
    }

    const parsed = extractJSON(raw);
    const validated = validateReview(parsed);

    return res.status(200).json(validated);
  } catch (err) {
    if (err.message.includes("JSON") || err.message.includes("Unexpected token")) {
      return res.status(502).json({ error: "The AI model returned a response that could not be parsed. This can happen with free models. Please try again." });
    }
    if (err.message.includes("Missing") || err.message.includes("Invalid")) {
      return res.status(502).json({ error: "The AI model returned an incomplete review. Please try again." });
    }
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
