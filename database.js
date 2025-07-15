const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bookings.db');

function initDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      datetime TEXT NOT NULL,
      available INTEGER DEFAULT 1
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id INTEGER,
      name TEXT,
      email TEXT
    );
  `);
}

function getSlots() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM slots`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => ({ ...r, available: !!r.available })));
    });
  });
}

function bookSlot(slotId, name, email) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT available FROM slots WHERE id = ?`, [slotId], (err, row) => {
      if (err || !row || !row.available) return resolve(false);

      db.run(`UPDATE slots SET available = 0 WHERE id = ?`, [slotId]);
      db.run(`INSERT INTO bookings (slot_id, name, email) VALUES (?, ?, ?)`, [slotId, name, email]);
      resolve(true);
    });
  });
}

module.exports = { initDB, getSlots, bookSlot };
