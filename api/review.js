const SYSTEM_PROMPT = `You are a PRD reviewer for a student builder program. Evaluate the PRD against these 4 criteria and return ONLY valid JSON — no markdown, no backticks, no preamble, no safety labels, no extra text before or after the JSON.

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

// Extract a JSON object from a string that may contain extra text before/after it
function extractJSON(text) {
  // Remove markdown code fences
  let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  // Find the first { and the last } — the JSON object lives between them
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in model response");
  }

  const jsonString = cleaned.substring(firstBrace, lastBrace + 1);
  return JSON.parse(jsonString);
}

// Validate that the parsed review has the expected structure
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

  const { prd } = req.body;

  // --- Input validation ---
  if (!prd || typeof prd !== "string") {
    return res.status(400).json({ error: "Missing or invalid PRD content. Please paste text." });
  }

  const trimmed = prd.trim();

  // Reject empty or whitespace-only submissions
  if (trimmed.length === 0) {
    return res.status(400).json({ error: "PRD content is empty. Please paste the full PRD text." });
  }

  // Reject very short submissions (likely not a real PRD)
  if (trimmed.length < 50) {
    return res.status(400).json({ error: "PRD content is too short to review. A PRD should include a problem statement, features, target users, and tech stack." });
  }

  // Reject if content appears to be non-text (binary, base64, or code dumps with no natural language)
  const nonTextRatio = (trimmed.match(/[^\x20-\x7E\n\r\t]/g) || []).length / trimmed.length;
  if (nonTextRatio > 0.3) {
    return res.status(400).json({ error: "The submitted content does not appear to be a text document. Please paste the PRD as plain text." });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openrouter/free",
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Review this PRD:\n\n${trimmed}` },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `OpenRouter API error (${response.status}): ${errText}` });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";

    if (!raw || raw.trim().length === 0) {
      return res.status(502).json({ error: "The AI model returned an empty response. Try again — free models can be intermittent." });
    }

    const parsed = extractJSON(raw);
    const validated = validateReview(parsed);

    return res.status(200).json(validated);
  } catch (err) {
    // Distinguish between JSON parsing failures and other errors
    if (err.message.includes("JSON") || err.message.includes("Unexpected token")) {
      return res.status(502).json({ error: "The AI model returned a response that could not be parsed. This can happen with free models. Please try again." });
    }
    if (err.message.includes("Missing") || err.message.includes("Invalid")) {
      return res.status(502).json({ error: "The AI model returned an incomplete review. Please try again." });
    }
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
