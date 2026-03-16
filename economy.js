const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "economy.json");

// ─── Load / Save ──────────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

// ─── API ──────────────────────────────────────────────────────────────────────

/** Get or create a player record */
function getPlayer(userId, username) {
  const db = loadDB();
  if (!db[userId]) {
    db[userId] = { id: userId, username, points: 0, wins: 0 };
    saveDB(db);
  }
  return db[userId];
}

/** Add points (and optionally a win) to a player */
function addPoints(userId, username, amount, isWin = true) {
  const db = loadDB();
  if (!db[userId]) {
    db[userId] = { id: userId, username, points: 0, wins: 0 };
  }
  db[userId].points += amount;
  db[userId].username = username; // keep name up to date
  if (isWin) db[userId].wins += 1;
  saveDB(db);
  return db[userId];
}

/** Get top N players sorted by points */
function getTop(n = 10) {
  const db = loadDB();
  return Object.values(db)
    .sort((a, b) => b.points - a.points)
    .slice(0, n);
}

module.exports = { getPlayer, addPoints, getTop };
