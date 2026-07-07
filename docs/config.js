// ═══════════════════════════════════════════════════════════════
// config.js — Dashboard Configuration
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // Replace with your Google OAuth 2.0 Client ID
  GOOGLE_CLIENT_ID: "YOUR_GOOGLE_CLIENT_ID",

  // Allowed email domain (only these emails can see the dashboard)
  ALLOWED_DOMAIN: "vmukti.com",

  // Path to usage data (relative to docs/)
  DATA_PATH: "../data/usage.json",

  // Badge thresholds
  BADGES: {
    token_milestones: [
      { tokens: 1_000_000, label: "1M Club", icon: "🪙" },
      { tokens: 500_000, label: "500K Club", icon: "💎" },
      { tokens: 100_000, label: "100K Club", icon: "⭐" },
      { tokens: 10_000, label: "10K Club", icon: "🔥" },
    ],
  },

  // Avatar color palette
  AVATAR_COLORS: [
    "#d97757", "#60a5fa", "#4ade80", "#c084fc",
    "#f87171", "#fbbf24", "#34d399", "#f472b6",
    "#22d3ee", "#a78bfa", "#fb923c", "#a3e635",
  ],
};

// Also set the Google client ID on the DOM element
document.addEventListener("DOMContentLoaded", () => {
  const onload = document.getElementById("g_id_onload");
  if (onload) {
    onload.setAttribute("data-client_id", CONFIG.GOOGLE_CLIENT_ID);
  }
});
