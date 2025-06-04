import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 8080;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CACHE_TTL = parseInt(process.env.CACHE_TTL || "300", 10) * 1000;

if (!GITHUB_TOKEN) {
  console.error("GitHub token missing. Set GITHUB_TOKEN in .env file.");
  process.exit(1);
}

const headers = {
  Authorization: `token ${GITHUB_TOKEN}`,
  "User-Agent": "Github-Contributor-Fetcher",
};

const cache = new Map();

const withCache = async (key, fetchFn) => {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }
  const value = await fetchFn();
  cache.set(key, { timestamp: now, value });
  return value;
};

const fetchAllRepos = async (org) => {
  const repos = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Failed to fetch repos: ${res.statusText}`);
    const data = await res.json();
    if (data.length === 0) break;
    repos.push(...data);
    page++;
  }
  return repos;
};

const fetchContributors = async (org, repo) => {
  const contributors = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${org}/${repo}/contributors?per_page=100&page=${page}`,
      { headers },
    );
    if (res.status === 409) return []; // empty repo
    if (!res.ok)
      throw new Error(`Failed to fetch contributors: ${res.statusText}`);
    const data = await res.json();
    if (data.length === 0) break;
    contributors.push(...data);
    page++;
  }
  return contributors;
};

// 🔷 NEW: User prompt form
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CommitBoard</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 3rem;
          background: #f8f8f8;
        }
        h1 {
          margin-bottom: 1rem;
        }
        form {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        input, select, button {
          padding: 0.5rem;
          margin: 0.5rem 0;
          width: 100%;
          font-size: 1rem;
        }
        button {
          background: #007bff;
          color: white;
          border: none;
          cursor: pointer;
        }
        button:hover {
          background: #0056b3;
        }
      </style>
    </head>
    <body>
      <h1>GitHub Org Contributors Viewer</h1>
      <form action="/org" method="GET">
        <label for="org">Organization Name:</label>
        <input type="text" name="org" id="org" placeholder="e.g. asyncapi" required />
        <label for="format">Return Format:</label>
        <select name="format" id="format">
          <option value="json">JSON</option>
          <option value="html">HTML Table</option>
        </select>
        <button type="submit">Submit</button>
      </form>
    </body>
    </html>
  `);
});

// 🔷 Redirects form to proper endpoint
app.get("/org", (req, res) => {
  const org = req.query.org;
  const html = req.query.format === "html";
  res.redirect(`/org/${org}${html ? "?html=true" : ""}`);
});

// 🔷 Main contributor API
app.get("/org/:orgName", async (req, res) => {
  const org = req.params.orgName.toLowerCase();
  const returnHTML = req.query.html === "true";

  try {
    const result = await withCache(org, async () => {
      const repos = await fetchAllRepos(org);
      const contributorMap = new Map();

      await Promise.all(
        repos.map(async (repo) => {
          const contributors = await fetchContributors(org, repo.name);
          for (const user of contributors) {
            const existing = contributorMap.get(user.login) || 0;
            contributorMap.set(user.login, existing + user.contributions);
          }
        }),
      );

      const aggregated = Array.from(contributorMap.entries())
        .map(([login, contributions]) => ({ login, contributions }))
        .sort((a, b) => b.contributions - a.contributions);

      return {
        count: aggregated.length,
        contributors: aggregated,
      };
    });

    if (returnHTML) {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>${org} Contributors</title>
          <style>
            body {
              font-family: "Segoe UI", sans-serif;
              background: #f9f9f9;
              padding: 2rem;
              color: #333;
            }
            h1 {
              text-align: center;
              margin-bottom: 1rem;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              background: white;
              box-shadow: 0 0 8px rgba(0,0,0,0.1);
            }
            th, td {
              padding: 0.75rem 1rem;
              border-bottom: 1px solid #ddd;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
            }
            tr:hover {
              background-color: #f9f9f9;
            }
            .count {
              margin-bottom: 1.5rem;
              text-align: center;
              font-size: 1.1rem;
            }
          </style>
        </head>
        <body>
          <h1>Top Contributors for <em>${org}</em></h1>
          <div class="count">Total unique contributors: <strong>${result.count}</strong></div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Username</th>
                <th>Contributions</th>
              </tr>
            </thead>
            <tbody>
              ${result.contributors
                .map(
                  (user, idx) => `
                    <tr>
                      <td>${idx + 1}</td>
                      <td><a href="https://github.com/${user.login}" target="_blank">${user.login}</a></td>
                      <td>${user.contributions}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </body>
        </html>
      `;
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } else {
      res.json(result);
    }
  } catch (err) {
    res.status(500).send(`<pre style="color:red;">Error: ${err.message}</pre>`);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
