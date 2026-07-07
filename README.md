# 🧠 Claude Usage Leaderboard

A gamified dashboard that ranks your team's Claude AI token usage with leaderboards, trends, and badges.

**Built for:** 23-user org on Claude (admin: hardik@vmukti.com)  
**Hosting:** GitHub Pages (free)  
**Auth:** Google OAuth (restricted to @vmukti.com)  
**Data pipeline:** GitHub Actions → Anthropic Admin API (every 30 min)

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GitHub Actions  │────▶│  data/usage.json │────▶│  GitHub Pages    │
│  (every 30 min)  │     │  (committed)     │     │  (static site)   │
└────────┬─────────┘     └──────────────────┘     └────────┬────────┘
         │                                                 │
         ▼                                                 ▼
┌─────────────────┐                               ┌─────────────────┐
│  Anthropic      │                               │  Google OAuth   │
│  Admin API      │                               │  (@vmukti.com)  │
└─────────────────┘                               └─────────────────┘
```

**No backend server needed.** GitHub Actions fetches data from the Anthropic Admin API and commits it as JSON. The static dashboard (HTML/CSS/JS) reads the JSON and renders the leaderboard. Google OAuth gates access.

---

## What You Get

### 🏆 Leaderboard Tab
- Ranked table of all 23 users by token consumption
- Sortable by: Total Tokens, Input, Output, Cache Read, Cost, API Calls, Sessions, Commits
- Visual share bars
- Gold/Silver/Bronze rank badges

### 📈 Trends Tab
- Horizontal bar chart — all users by token usage
- Top 5 comparison chart (Input vs Output vs Cache tokens)

### 🏅 Badges Tab
- **Heavy Hitter** — most total tokens
- **Output Machine** — most output tokens
- **Cache Master** — most cache reads (efficiency)
- **Big Spender** — highest estimated cost
- **Code Warrior** — most Claude Code sessions
- **Commit King** — most commits via Claude Code
- **Most Active** — most API calls
- **Token Milestones** — 1M / 500K / 100K / 10K clubs

---

## Setup Guide (15 minutes)

### Step 1: Create the GitHub Repo

```bash
# Create a new repo on GitHub (can be private for extra privacy)
# Then push this code:
cd claude-usage-dashboard
git init
git add .
git commit -m "Initial commit: Claude usage leaderboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/claude-usage-dashboard.git
git push -u origin main
```

### Step 2: Get Your Anthropic Admin API Key

1. Log in to the [Anthropic Console](https://console.anthropic.com/) as **hardik@vmukti.com** (admin)
2. Go to **Settings → API Keys**
3. Click **Create Admin Key**
4. Copy the key (starts with `sk-ant-admin...`)

### Step 3: Add the API Key as a GitHub Secret

1. Go to your repo → **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `ANTHROPIC_ADMIN_API_KEY`
4. Value: paste your admin API key
5. Click **Add secret**

### Step 4: Create a Google OAuth Client ID

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Go to **APIs & Services → OAuth consent screen**
   - User type: **Internal** (if on Google Workspace) or **External**
   - App name: `Claude Usage Dashboard`
   - Support email: `hardik@vmukti.com`
   - Authorized domains: `your-username.github.io`
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://your-username.github.io`
   - Click **Create**
5. Copy the **Client ID** (looks like `123456789-abcdef.apps.googleusercontent.com`)

### Step 5: Configure the Dashboard

Edit `docs/config.js` and replace `YOUR_GOOGLE_CLIENT_ID`:

```javascript
const CONFIG = {
  GOOGLE_CLIENT_ID: "123456789-abcdef.apps.googleusercontent.com",
  ALLOWED_DOMAIN: "vmukti.com",
  // ...
};
```

Commit and push:
```bash
git add docs/config.js
git commit -m "Configure Google OAuth client ID"
git push
```

### Step 6: Enable GitHub Pages

1. Go to repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / Folder: `/docs`
4. Click **Save**
5. Wait 1-2 minutes — your dashboard will be live at:
   ```
   https://YOUR_USERNAME.github.io/claude-usage-dashboard/
   ```

### Step 7: Trigger the First Data Fetch

1. Go to repo → **Actions**
2. Select **"Fetch Claude Usage Data"** workflow
3. Click **Run workflow** (manual trigger)
4. Wait for it to complete (~30 seconds)
5. Check that `data/usage.json` was committed

### Step 8: Open the Dashboard

Visit your GitHub Pages URL. You'll see the Google sign-in screen. Sign in with any @vmukti.com email to view the leaderboard.

---

## How It Works

### Data Pipeline (GitHub Actions)
- Runs every 30 minutes via cron
- Calls three Anthropic Admin API endpoints:
  - `GET /v1/organizations/users` — fetches all 23 users
  - `GET /v1/organizations/usage_report/messages` — Messages API token usage
  - `GET /v1/organizations/usage_report/claude_code` — Claude Code per-user metrics
- Aggregates data per-user
- Commits `data/usage.json` to the repo

### Frontend (Static Dashboard)
- Single-page HTML/CSS/JS app
- No build tools, no frameworks, no npm
- Google Identity Services (GIS) handles OAuth
- Only @vmukti.com emails can access
- Three tabs: Leaderboard, Trends, Badges

### Privacy
- The API key is stored as a GitHub Secret — never exposed in the frontend
- Google OAuth restricts access to @vmukti.com only
- For extra privacy: make the repo **private** (GitHub Pro gives private Pages)

---

## File Structure

```
claude-usage-dashboard/
├── .github/workflows/
│   └── fetch-usage.yml          # GitHub Action (every 30 min)
├── scripts/
│   └── fetch_usage.py           # Python data fetcher
├── data/
│   └── usage.json               # Generated data (auto-committed)
├── docs/                        # GitHub Pages root
│   ├── index.html               # Dashboard HTML
│   ├── style.css                # Dark theme styles
│   ├── app.js                   # Dashboard logic + Google OAuth
│   └── config.js                # Configuration (OAuth client ID, domain)
└── README.md
```

---

## Customization

### Change the allowed domain
Edit `docs/config.js`:
```javascript
ALLOWED_DOMAIN: "yourcompany.com",
```

### Add a new badge
Edit `docs/app.js` → `renderBadges()` function.

### Change refresh frequency
Edit `.github/workflows/fetch-usage.yml`:
```yaml
schedule:
  - cron: "0 */1 * * *"  # Every hour instead of 30 min
```

### Change data retention (30 days default)
Edit `scripts/fetch_usage.py`:
```python
messages_usage = fetch_usage_messages(days=90)  # 90 days
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No data after first run | Check Actions tab for errors. Ensure `ANTHROPIC_ADMIN_API_KEY` secret is set. |
| Google sign-in not appearing | Verify `GOOGLE_CLIENT_ID` in `config.js`. Ensure authorized origin matches your Pages URL. |
| "Access denied" on login | Your email must end with @vmukti.com. Check `ALLOWED_DOMAIN` in config.js. |
| Dashboard shows but no users | Your org plan may not have API/Claude Code usage yet. Check Anthropic Console analytics. |
| Usage data seems incomplete | The Admin API covers API + Claude Code usage. Claude.ai chat usage is in Console analytics (not API). |

---

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/organizations/me` | Org info |
| `GET /v1/organizations/users` | List all users (email, name, role) |
| `GET /v1/organizations/usage_report/messages` | Per-model/API-key token usage |
| `GET /v1/organizations/usage_report/claude_code` | Per-user Claude Code metrics (sessions, commits, tokens) |

---

## License

MIT — do whatever you want with it.

---

## Support

Built for **vmukti.com** · 23 users · Admin: hardik@vmukti.com

For questions, check the Troubleshooting section or open an issue.
