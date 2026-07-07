const SYSTEM_PROMPT = `You are a PRD reviewer for a student builder program. Evaluate the PRD against these 4 criteria and return ONLY valid JSON — no markdown, no backticks, no preamble.

CRITERIA:
1. Problem Statement & Purpose — Is the problem specific, grounded in a real user need, with a defined target user?
2. Scope, Feasibility & Resources (3-Day Rule) — Can a small team build a working version in 3 days with free/accessible tools? Evaluate scope and resource dependencies together.
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY is not configured" });
  }

  const { prd } = req.body;
  if (!prd || typeof prd !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'prd' field in request body" });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Review this PRD:\n\n${prd}` },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `OpenRouter API error: ${errText}` });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
