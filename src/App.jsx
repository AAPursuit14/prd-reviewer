import { useState, useCallback } from "react";

const RATING_CONFIG = {
  pass: { icon: "ti-circle-check", label: "Meets standard", color: "#16a34a", bg: "#f0fdf4" },
  warning: { icon: "ti-alert-triangle", label: "Needs improvement", color: "#ca8a04", bg: "#fefce8" },
  fail: { icon: "ti-circle-x", label: "Does not meet standard", color: "#dc2626", bg: "#fef2f2" },
};

const VERDICT_CONFIG = {
  approved: { label: "Approved", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  approved_with_notes: { label: "Approved with notes", color: "#ca8a04", bg: "#fefce8", border: "#fde68a" },
  needs_revision: { label: "Needs revision", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

const MODE_CONFIG = {
  standard: { label: "Standard", color: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb" },
  capstone: { label: "Capstone", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
};

const BTN = {
  primary: {
    background: "#3b82f6", color: "#fff", border: "none",
    padding: "10px 20px", borderRadius: 8, fontWeight: 500, fontSize: 14,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
  },
  secondary: {
    background: "#fff", color: "#1a1a1a", border: "1.5px solid #ccc",
    padding: "10px 20px", borderRadius: 8, fontWeight: 500, fontSize: 14,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
  },
  danger: {
    background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fecaca",
    padding: "10px 20px", borderRadius: 8, fontWeight: 500, fontSize: 14,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
  },
  disabled: {
    background: "#f3f4f6", color: "#9ca3af", border: "1.5px solid #e5e7eb",
    padding: "10px 20px", borderRadius: 8, fontWeight: 500, fontSize: 14,
    cursor: "not-allowed", display: "inline-flex", alignItems: "center", gap: 6, opacity: 0.6,
  },
};

const LABEL_STYLE = { display: "block", fontSize: 13, fontWeight: 500, color: "#1a1a1a", marginBottom: 6 };
const HINT_STYLE = { display: "block", fontSize: 12, color: "#9ca3af", marginTop: 4 };
const INPUT_STYLE = { width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, border: "1.5px solid #ccc", borderRadius: 8, background: "#fff", color: "#1a1a1a", outline: "none" };
const TEXTAREA_STYLE = { ...INPUT_STYLE, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 };

function RatingBadge({ rating }) {
  const c = RATING_CONFIG[rating];
  if (!c) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: c.color, background: c.bg, padding: "4px 12px", borderRadius: 8 }}>
      <i className={`ti ${c.icon}`} style={{ fontSize: 15 }} />
      {c.label}
    </span>
  );
}

function VerdictBadge({ verdict }) {
  const c = VERDICT_CONFIG[verdict];
  if (!c) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: c.color, background: c.bg, border: `1px solid ${c.border}`, padding: "5px 14px", borderRadius: 8 }}>
      {c.label}
    </span>
  );
}

function ModeBadge({ mode }) {
  const c = MODE_CONFIG[mode] || MODE_CONFIG.standard;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: c.color, background: c.bg, border: `1px solid ${c.border}`, padding: "3px 10px", borderRadius: 99 }}>
      {c.label}
    </span>
  );
}

async function reviewPRD(text, mode) {
  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prd: text, mode: mode || "standard" }),
  });
  if (!res.ok) {
    let msg = `Review failed (${res.status})`;
    try {
      const errData = await res.json();
      if (errData.error) msg = errData.error;
    } catch {}
    throw new Error(msg);
  }
  return await res.json();
}

function buildCSV(reviews) {
  const headers = ["Review Type", "Product", "Builder/Team", "Problem statement", "Scope and feasibility", "Technical clarity", "User and feature alignment", "Verdict", "What works", "What needs work", "Next steps"];
  const rows = reviews.map((r) => {
    const ratings = r.result.criteria.map((c) => `${RATING_CONFIG[c.rating]?.label || c.rating}: ${c.notes}`);
    return [
      MODE_CONFIG[r.mode]?.label || "Standard",
      r.result.product_name, r.label, ...ratings,
      VERDICT_CONFIG[r.result.verdict]?.label || r.result.verdict,
      r.result.summary?.what_works || "", r.result.summary?.what_needs_work || "",
      r.result.action_items.join("; "),
    ];
  });
  return [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

// Shared form component used by both submit tabs
function SubmitForm({ queue, setQueue, currentText, setCurrentText, currentLabel, setCurrentLabel, mode, processing, progress, onReviewAll, headerText, headerIcon }) {
  const addToQueue = () => {
    const trimmed = currentText.trim();
    if (!trimmed) return;
    if (trimmed.length < 50) {
      alert("PRD content is too short. A reviewable PRD should include a problem statement, features, target users, and tech stack.");
      return;
    }
    const label = currentLabel.trim() || `PRD ${queue.length + 1}`;
    setQueue((q) => [...q, { id: Date.now(), label, text: trimmed, mode }]);
    setCurrentText("");
    setCurrentLabel("");
  };

  const removeFromQueue = (id) => setQueue((q) => q.filter((item) => item.id !== id));
  const canAdd = currentText.trim().length > 0;

  return (
    <div>
      <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <i className={`ti ${headerIcon}`} style={{ fontSize: 18, color: "#3b82f6" }} />
          <span style={{ fontSize: 15, fontWeight: 500 }}>{headerText}</span>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL_STYLE}>Builder or team name</label>
          <input type="text" value={currentLabel} onChange={(e) => setCurrentLabel(e.target.value)} placeholder="e.g. Team Alpha, Jane Doe" style={INPUT_STYLE} />
          <span style={HINT_STYLE}>Optional. Defaults to "PRD 1", "PRD 2", etc.</span>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={LABEL_STYLE}>PRD content</label>
          <textarea value={currentText} onChange={(e) => setCurrentText(e.target.value)} placeholder="Paste the full PRD text here — include problem statement, features, tech stack, and target users." rows={10} style={TEXTAREA_STYLE} />
          <span style={HINT_STYLE}>Paste the entire PRD document. The more detail, the better the review.</span>
        </div>
        <button onClick={addToQueue} style={canAdd ? BTN.primary : BTN.disabled} disabled={!canAdd}>
          <i className="ti ti-plus" style={{ fontSize: 16 }} /> Add to queue
        </button>
      </div>

      {queue.length > 0 && (
        <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 12, padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-stack-2" style={{ fontSize: 18, color: "#3b82f6" }} />
              <span style={{ fontSize: 15, fontWeight: 500 }}>{queue.length} PRD{queue.length > 1 ? "s" : ""} ready for review</span>
            </div>
            <button onClick={onReviewAll} disabled={processing} style={processing ? BTN.disabled : BTN.primary}>
              <i className="ti ti-player-play" style={{ fontSize: 16 }} />
              {processing ? `Reviewing ${progress.current}/${progress.total}...` : "Review all"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {queue.map((item, idx) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f8f8f6", border: "0.5px solid #e5e7eb", borderRadius: 8, fontSize: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 99, background: "#eff6ff", color: "#3b82f6", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>{idx + 1}</span>
                  <span style={{ fontWeight: 500 }}>{item.label}</span>
                </div>
                <button onClick={() => removeFromQueue(item.id)} style={{ ...BTN.danger, padding: "6px 10px", fontSize: 13 }}>
                  <i className="ti ti-x" style={{ fontSize: 15 }} /> Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {queue.length === 0 && !processing && (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#9ca3af", fontSize: 14, border: "1.5px dashed #e5e7eb", borderRadius: 12 }}>
          <i className="ti ti-stack-2" style={{ fontSize: 36, display: "block", marginBottom: 10, opacity: 0.5 }} />
          Queue is empty. Add PRDs above and they will appear here.
        </div>
      )}
    </div>
  );
}

export default function App() {
  // Standard tab state
  const [stdQueue, setStdQueue] = useState([]);
  const [stdText, setStdText] = useState("");
  const [stdLabel, setStdLabel] = useState("");

  // Capstone tab state
  const [capQueue, setCapQueue] = useState([]);
  const [capText, setCapText] = useState("");
  const [capLabel, setCapLabel] = useState("");

  // Shared state
  const [reviews, setReviews] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState("standard");
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const runReviews = useCallback(async (queue, clearQueue) => {
    if (queue.length === 0) return;
    setProcessing(true);
    setProgress({ current: 0, total: queue.length });
    setActiveTab("results");
    for (let i = 0; i < queue.length; i++) {
      setProgress({ current: i + 1, total: queue.length });
      const item = queue[i];
      try {
        const result = await reviewPRD(item.text, item.mode);
        setReviews((prev) => [...prev, { id: item.id, label: item.label, mode: item.mode, result, error: null }]);
      } catch (e) {
        setReviews((prev) => [...prev, { id: item.id, label: item.label, mode: item.mode, result: null, error: e.message }]);
      }
    }
    clearQueue([]);
    setProcessing(false);
  }, []);

  const removeReview = useCallback((id) => {
    setReviews((prev) => prev.filter((r) => r.id !== id));
    if (expandedId === id) setExpandedId(null);
  }, [expandedId]);

  const clearReviews = useCallback(() => {
    setReviews([]);
    setExpandedId(null);
  }, []);

  const completedReviews = reviews.filter((r) => r.result);
  const failedReviews = reviews.filter((r) => r.error);

  const downloadCSV = useCallback(() => {
    const csv = buildCSV(completedReviews);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prd_reviews.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [completedReviews]);

  const tabs = [
    { key: "standard", label: "Submit PRDs", icon: "ti-file-plus", count: stdQueue.length },
    { key: "capstone", label: "Capstone PRD Submitted", icon: "ti-trophy", count: capQueue.length },
    { key: "results", label: "PRD Results", icon: "ti-list-check", count: reviews.length },
  ];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 4px" }}>PRD Reviewer</h1>
        <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Add PRDs to the queue, review them all at once, and export results.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1.5px solid #e5e7eb", marginBottom: "1.5rem", overflowX: "auto" }}>
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "12px 16px", fontSize: 14, fontWeight: 500,
            cursor: "pointer", background: "none", border: "none", whiteSpace: "nowrap",
            borderBottom: activeTab === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
            color: activeTab === tab.key ? "#3b82f6" : "#9ca3af", marginBottom: -2,
          }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize: 17 }} />
            {tab.label}
            {tab.count > 0 && (
              <span style={{ background: activeTab === tab.key ? "#eff6ff" : "#f3f4f6", color: activeTab === tab.key ? "#3b82f6" : "#6b7280", fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 99, minWidth: 20, textAlign: "center" }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Standard submit tab */}
      {activeTab === "standard" && (
        <SubmitForm
          queue={stdQueue} setQueue={setStdQueue}
          currentText={stdText} setCurrentText={setStdText}
          currentLabel={stdLabel} setCurrentLabel={setStdLabel}
          mode="standard" processing={processing} progress={progress}
          onReviewAll={() => runReviews(stdQueue, setStdQueue)}
          headerText="Add a PRD to the review queue"
          headerIcon="ti-file-text"
        />
      )}

      {/* Capstone submit tab */}
      {activeTab === "capstone" && (
        <div>
          <div style={{ padding: "12px 16px", marginBottom: "1rem", background: "#f5f3ff", borderRadius: 8, fontSize: 13, color: "#7c3aed", border: "1px solid #ddd6fe", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <i className="ti ti-info-circle" style={{ fontSize: 17, marginTop: 1, flexShrink: 0 }} />
            <span>Capstone PRDs are reviewed with the same rubric, but Criterion 2 (Scope, Feasibility & Resources) accounts for $20–$50 in API credits available to the team. Paid API dependencies within that budget are acceptable.</span>
          </div>
          <SubmitForm
            queue={capQueue} setQueue={setCapQueue}
            currentText={capText} setCurrentText={setCapText}
            currentLabel={capLabel} setCurrentLabel={setCapLabel}
            mode="capstone" processing={processing} progress={progress}
            onReviewAll={() => runReviews(capQueue, setCapQueue)}
            headerText="Add a Capstone PRD to the review queue"
            headerIcon="ti-trophy"
          />
        </div>
      )}

      {/* Results tab */}
      {activeTab === "results" && (
        <div>
          {/* Stats bar */}
          {reviews.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginBottom: "1rem", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px", padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <i className="ti ti-circle-check" style={{ fontSize: 22, color: "#16a34a" }} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#16a34a" }}>{completedReviews.length}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Successful</div>
                </div>
              </div>
              <div style={{ flex: "1 1 140px", padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <i className="ti ti-alert-circle" style={{ fontSize: 22, color: "#dc2626" }} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#dc2626" }}>{failedReviews.length}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Failed</div>
                </div>
              </div>
              <div style={{ flex: "1 1 140px", padding: "12px 16px", background: "#f8f8f6", border: "1px solid #e5e7eb", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <i className="ti ti-files" style={{ fontSize: 22, color: "#6b7280" }} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#1a1a1a" }}>{reviews.length}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Total</div>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {reviews.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: "1rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
              {completedReviews.length > 0 && (
                <button onClick={downloadCSV} style={BTN.secondary}>
                  <i className="ti ti-download" style={{ fontSize: 16 }} />
                  Download CSV
                </button>
              )}
              <button onClick={clearReviews} style={BTN.danger}>
                <i className="ti ti-trash" style={{ fontSize: 16 }} /> Clear all
              </button>
            </div>
          )}

          {processing && (
            <div style={{ padding: "14px 18px", marginBottom: "1rem", background: "#eff6ff", borderRadius: 8, fontSize: 14, color: "#3b82f6", display: "flex", alignItems: "center", gap: 10, border: "1px solid #bfdbfe" }}>
              <i className="ti ti-loader" style={{ fontSize: 18, animation: "spin 1s linear infinite" }} />
              Reviewing PRD {progress.current} of {progress.total}...
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          )}

          {reviews.length === 0 && !processing && (
            <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#9ca3af", fontSize: 14, border: "1.5px dashed #e5e7eb", borderRadius: 12 }}>
              <i className="ti ti-list-check" style={{ fontSize: 36, display: "block", marginBottom: 10, opacity: 0.5 }} />
              No reviews yet. Submit PRDs and hit "Review all" to see results here.
            </div>
          )}

          {/* Review cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reviews.map((review) => (
              <div key={review.id} style={{ border: "1.5px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                <div onClick={() => setExpandedId(expandedId === review.id ? null : review.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 500, fontSize: 15 }}>{review.label}</span>
                    <ModeBadge mode={review.mode} />
                    {review.result && <VerdictBadge verdict={review.result.verdict} />}
                    {review.error && <span style={{ fontSize: 13, color: "#dc2626", display: "flex", alignItems: "center", gap: 4 }}><i className="ti ti-alert-circle" style={{ fontSize: 15 }} /> Review failed</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {review.result && (
                      <div style={{ display: "flex", gap: 6 }}>
                        {review.result.criteria.map((c, i) => {
                          const cfg = RATING_CONFIG[c.rating];
                          return <i key={i} className={`ti ${cfg?.icon}`} style={{ fontSize: 18, color: cfg?.color }} />;
                        })}
                      </div>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); removeReview(review.id); }}
                      style={{ ...BTN.danger, padding: "5px 10px", fontSize: 12 }} title="Remove from results">
                      <i className="ti ti-x" style={{ fontSize: 14 }} /> Remove
                    </button>
                    <i className={`ti ti-chevron-${expandedId === review.id ? "up" : "down"}`} style={{ fontSize: 18, color: "#9ca3af" }} />
                  </div>
                </div>

                {expandedId === review.id && review.result && (
                  <div style={{ borderTop: "1.5px solid #e5e7eb", padding: "18px 18px 16px" }}>
                    <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 16, marginTop: 0, color: "#6b7280" }}>{review.result.product_name}</p>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                      {review.result.criteria.map((c, i) => (
                        <div key={i} style={{ padding: "12px 14px", background: "#f8f8f6", borderRadius: 8, border: "0.5px solid #e5e7eb" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                            <RatingBadge rating={c.rating} />
                          </div>
                          <p style={{ fontSize: 13, color: "#6b7280", margin: 0, lineHeight: 1.6 }}>{c.notes}</p>
                        </div>
                      ))}
                    </div>

                    {review.result.summary && (
                      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 280px", padding: "14px 16px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <i className="ti ti-circle-check" style={{ fontSize: 16, color: "#16a34a" }} />
                            <span style={{ fontSize: 13, fontWeight: 500, color: "#16a34a" }}>What works</span>
                          </div>
                          <p style={{ fontSize: 13, color: "#1a1a1a", margin: 0, lineHeight: 1.6 }}>{review.result.summary.what_works}</p>
                        </div>
                        <div style={{ flex: "1 1 280px", padding: "14px 16px", background: "#fefce8", borderRadius: 8, border: "1px solid #fde68a" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: "#ca8a04" }} />
                            <span style={{ fontSize: 13, fontWeight: 500, color: "#ca8a04" }}>What needs work</span>
                          </div>
                          <p style={{ fontSize: 13, color: "#1a1a1a", margin: 0, lineHeight: 1.6 }}>{review.result.summary.what_needs_work}</p>
                        </div>
                      </div>
                    )}

                    <div style={{ borderTop: "1.5px solid #e5e7eb", paddingTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <i className="ti ti-checklist" style={{ fontSize: 16, color: "#3b82f6" }} />
                        <span style={{ fontSize: 14, fontWeight: 500 }}>Next steps</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {review.result.action_items.map((item, i) => (
                          <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "#6b7280", lineHeight: 1.6, padding: "8px 12px", background: "#f8f8f6", borderRadius: 8, border: "0.5px solid #e5e7eb" }}>
                            <i className="ti ti-arrow-right" style={{ fontSize: 14, marginTop: 3, flexShrink: 0, color: "#3b82f6" }} />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {expandedId === review.id && review.error && (
                  <div style={{ borderTop: "1.5px solid #e5e7eb", padding: 18, fontSize: 13, color: "#dc2626" }}>{review.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
