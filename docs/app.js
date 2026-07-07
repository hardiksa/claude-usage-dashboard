// ═══════════════════════════════════════════════════════════════
// app.js — Claude Usage Leaderboard Application
// ═══════════════════════════════════════════════════════════════

let usageData = null;
let currentUser = null;
let googleToken = null;

// ── Google OAuth ─────────────────────────────────────────────────

function handleCredentialResponse(response) {
  // Decode the JWT ID token
  const tokenParts = response.credential.split(".");
  const payload = JSON.parse(atob(tokenParts[1]));

  const email = payload.email || "";
  const name = payload.name || email.split("@")[0];
  const picture = payload.picture || "";
  const domain = payload.hd || email.split("@")[1] || "";

  // Check allowed domain
  if (domain !== CONFIG.ALLOWED_DOMAIN && !email.endsWith("@" + CONFIG.ALLOWED_DOMAIN)) {
    alert(`Access denied. This dashboard is restricted to @${CONFIG.ALLOWED_DOMAIN} accounts.\n\nYour email: ${email}`);
    return;
  }

  currentUser = { email, name, picture };
  googleToken = response.credential;

  // Show dashboard
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");

  // Display user badge
  const badge = document.getElementById("current-user");
  badge.innerHTML = picture
    ? `<img src="${picture}" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:6px">${name}`
    : name;

  // Load data
  loadData();
}

function signOut() {
  googleToken = null;
  currentUser = null;
  google.accounts.id.disableAutoSelect();
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
}

// ── Data Loading ─────────────────────────────────────────────────

async function loadData() {
  try {
    const resp = await fetch(CONFIG.DATA_PATH + "?t=" + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    usageData = await resp.json();
    renderAll();
  } catch (err) {
    console.error("Failed to load data:", err);
    document.getElementById("last-updated").textContent =
      "⚠️ No data yet. The GitHub Action will generate data once the ANTHROPIC_ADMIN_API_KEY secret is configured.";
  }
}

// ── Formatting Helpers ────────────────────────────────────────────

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function fmtMoney(n) {
  return "$" + n.toFixed(2);
}

function fmtFull(n) {
  return n.toLocaleString();
}

function colorForIndex(i) {
  return CONFIG.AVATAR_COLORS[i % CONFIG.AVATAR_COLORS.length];
}

function initials(name) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── Render: All ───────────────────────────────────────────────────

function renderAll() {
  renderSummary();
  renderLeaderboard();
  renderTrends();
  renderBadges();

  const dt = new Date(usageData.generated_at);
  document.getElementById("last-updated").textContent =
    `Last updated: ${dt.toLocaleString()}`;
}

// ── Render: Summary Cards ────────────────────────────────────────

function renderSummary() {
  const s = usageData.summary;
  const users = usageData.users;

  document.getElementById("total-tokens").textContent = fmt(s.total_tokens);
  document.getElementById("total-cost").textContent = fmtMoney(s.total_cost);
  document.getElementById("active-users").textContent =
    users.filter(u => u.total_tokens > 0).length;
  document.getElementById("total-calls").textContent = fmt(s.total_api_calls);
  document.getElementById("total-sessions").textContent = fmt(s.total_sessions);
}

// ── Render: Leaderboard Table ────────────────────────────────────

function renderLeaderboard() {
  const tbody = document.getElementById("leaderboard-body");
  const sortBy = document.getElementById("sort-by").value;
  const users = [...usageData.users];

  // Filter out users with zero activity if sorting by tokens
  const filtered = users.filter(u => u.total_tokens > 0 || u.api_calls > 0 || u.claude_code_sessions > 0);

  // Sort by selected metric
  filtered.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

  const maxVal = Math.max(...filtered.map(u => u[sortBy] || 0), 1);

  tbody.innerHTML = filtered.map((u, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "rank-other";
    const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
    const val = u[sortBy] || 0;
    const pct = (val / maxVal * 100).toFixed(1);
    const color = colorForIndex(i);

    // Gradient colors for bars
    const barColors = ["#d97757", "#60a5fa", "#4ade80", "#c084fc", "#fbbf24", "#34d399"];
    const barColor = barColors[i % barColors.length];

    return `
      <tr>
        <td class="col-rank"><span class="rank-badge ${rankClass}">${rankEmoji}</span></td>
        <td>
          <div class="user-cell">
            <div class="avatar" style="background:${color}">${initials(u.name)}</div>
            <span>${u.name}</span>
          </div>
        </td>
        <td class="col-email" style="color:var(--text-muted)">${u.email}</td>
        <td class="num"><strong>${fmt(u.total_tokens)}</strong></td>
        <td class="num">${fmt(u.input_tokens)}</td>
        <td class="num">${fmt(u.output_tokens)}</td>
        <td class="num">${fmt(u.cache_read_tokens)}</td>
        <td class="num">${fmtMoney(u.estimated_cost)}</td>
        <td class="num">${fmt(u.api_calls)}</td>
        <td class="num">${fmt(u.claude_code_sessions)}</td>
        <td class="num">${fmt(u.claude_code_commits)}</td>
        <td class="bar-cell">
          <div class="usage-bar">
            <div class="usage-bar-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// ── Render: Trends ───────────────────────────────────────────────

function renderTrends() {
  const users = [...usageData.users]
    .filter(u => u.total_tokens > 0)
    .sort((a, b) => b.total_tokens - a.total_tokens);

  // Bar chart — all users by tokens
  const barChart = document.getElementById("bar-chart");
  const maxTokens = Math.max(...users.map(u => u.total_tokens), 1);

  barChart.innerHTML = users.map((u, i) => {
    const pct = (u.total_tokens / maxTokens * 100).toFixed(1);
    const colors = ["#d97757", "#60a5fa", "#4ade80", "#c084fc", "#fbbf24", "#34d399"];
    const color = colors[i % colors.length];
    return `
      <div class="bar-row">
        <div class="bar-label" title="${u.email}">${u.name}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${color}">${fmt(u.total_tokens)}</div>
        </div>
      </div>
    `;
  }).join("");

  // Comparison chart — top 5 by different metrics
  const top5 = users.slice(0, 5);
  const comparisonChart = document.getElementById("comparison-chart");
  const metrics = [
    { key: "input_tokens", label: "Input", color: "#60a5fa" },
    { key: "output_tokens", label: "Output", color: "#4ade80" },
    { key: "cache_read_tokens", label: "Cache", color: "#c084fc" },
  ];

  const allVals = top5.flatMap(u => metrics.map(m => u[m.key] || 0));
  const maxVal = Math.max(...allVals, 1);

  comparisonChart.innerHTML = top5.map((u, i) => {
    return `
      <div class="comparison-bar">
        ${metrics.map(m => {
          const v = u[m.key] || 0;
          const h = (v / maxVal * 200).toFixed(0);
          return `<div class="comparison-bar-fill" style="height:${h}px;background:${m.color}" title="${m.label}: ${fmtFull(v)}"></div>`;
        }).join("")}
        <div class="comparison-label">${u.name.split(" ")[0]}</div>
      </div>
    `;
  }).join("");
}

// ── Render: Badges ───────────────────────────────────────────────

function renderBadges() {
  const users = [...usageData.users]
    .filter(u => u.total_tokens > 0)
    .sort((a, b) => b.total_tokens - a.total_tokens);

  const grid = document.getElementById("badges-grid");
  const badges = [];

  // 🥇 Heavy Hitter — most total tokens
  if (users.length > 0) {
    badges.push({
      icon: "🥇",
      title: "Heavy Hitter",
      desc: "Most tokens consumed (30 days)",
      winner: users[0].name,
      value: fmt(users[0].total_tokens) + " tokens",
    });
  }

  // ⚡ Most Output — highest output tokens
  const mostOutput = [...users].sort((a, b) => b.output_tokens - a.output_tokens)[0];
  if (mostOutput) {
    badges.push({
      icon: "⚡",
      title: "Output Machine",
      desc: "Most output tokens generated",
      winner: mostOutput.name,
      value: fmt(mostOutput.output_tokens) + " output tokens",
    });
  }

  // 🧠 Cache Master — most cache reads (efficiency)
  const cacheMaster = [...users].sort((a, b) => b.cache_read_tokens - a.cache_read_tokens)[0];
  if (cacheMaster && cacheMaster.cache_read_tokens > 0) {
    badges.push({
      icon: "🧠",
      title: "Cache Master",
      desc: "Most cache reads (prompt efficiency)",
      winner: cacheMaster.name,
      value: fmt(cacheMaster.cache_read_tokens) + " cache tokens",
    });
  }

  // 💰 Big Spender — highest cost
  const bigSpender = [...users].sort((a, b) => b.estimated_cost - a.estimated_cost)[0];
  if (bigSpender && bigSpender.estimated_cost > 0) {
    badges.push({
      icon: "💰",
      title: "Big Spender",
      desc: "Highest estimated cost",
      winner: bigSpender.name,
      value: fmtMoney(bigSpender.estimated_cost),
    });
  }

  // 🔧 Code Warrior — most Claude Code sessions
  const codeWarrior = [...users].sort((a, b) => b.claude_code_sessions - a.claude_code_sessions)[0];
  if (codeWarrior && codeWarrior.claude_code_sessions > 0) {
    badges.push({
      icon: "🔧",
      title: "Code Warrior",
      desc: "Most Claude Code sessions",
      winner: codeWarrior.name,
      value: fmt(codeWarrior.claude_code_sessions) + " sessions",
    });
  }

  // 📝 Commit King — most commits via Claude Code
  const commitKing = [...users].sort((a, b) => b.claude_code_commits - a.claude_code_commits)[0];
  if (commitKing && commitKing.claude_code_commits > 0) {
    badges.push({
      icon: "📝",
      title: "Commit King",
      desc: "Most commits with Claude Code",
      winner: commitKing.name,
      value: fmt(commitKing.claude_code_commits) + " commits",
    });
  }

  // Token milestone badges
  for (const milestone of CONFIG.BADGES.token_milestones) {
    const achievers = users.filter(u => u.total_tokens >= milestone.tokens);
    if (achievers.length > 0) {
      badges.push({
        icon: milestone.icon,
        title: milestone.label,
        desc: `${milestone.tokens >= 1_000_000 ? "1M+" : (milestone.tokens / 1000) + "K+"} tokens`,
        winner: achievers.map(a => a.name).join(", "),
        value: `${achievers.length} member${achievers.length > 1 ? "s" : ""}`,
      });
    }
  }

  // 🔥 Most Active — most API calls
  const mostActive = [...users].sort((a, b) => b.api_calls - a.api_calls)[0];
  if (mostActive && mostActive.api_calls > 0) {
    badges.push({
      icon: "🔥",
      title: "Most Active",
      desc: "Most API calls made",
      winner: mostActive.name,
      value: fmt(mostActive.api_calls) + " calls",
    });
  }

  grid.innerHTML = badges.map(b => `
    <div class="badge-card">
      <div class="badge-icon">${b.icon}</div>
      <div class="badge-info">
        <h4>${b.title}</h4>
        <p>${b.desc}</p>
        <div class="badge-winner">🏆 ${b.winner}</div>
        <p style="margin-top:4px;color:var(--accent)">${b.value}</p>
      </div>
    </div>
  `).join("");
}

// ── Tab Switching ────────────────────────────────────────────────

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  event.target.classList.add("active");
  document.getElementById("tab-" + tabName).classList.add("active");
}

// ── Init ─────────────────────────────────────────────────────────

// If Google script is already loaded, initialize
window.addEventListener("load", () => {
  if (typeof google !== "undefined" && google.accounts) {
    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });
    google.accounts.id.renderButton(
      document.querySelector(".g_id_signin"),
      { theme: "outline", size: "large", shape: "rectangular" }
    );
    google.accounts.id.prompt();
  }
});
