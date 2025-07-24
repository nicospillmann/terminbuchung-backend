const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 📁 Öffentlich zugängliche Dateien (index.html, script.js, style.css etc.)
app.use(express.static(path.join(__dirname, 'public')));

// 🔐 Admin-Login konfigurieren
const adminAuth = basicAuth({
  users: { 'ksanispl': 'Katana@1998' },
  challenge: true,
  unauthorizedResponse: () => 'Zugriff verweigert – Adminbereich geschützt.',
});

// 🔐 Nur Admin-Zugriff für diese Routen
app.use([
  '/admin.html',
  '/admin-table.html',
  '/admin-view.html',
  '/admin/bookings',
  '/admin/slots',
  '/admin/bookings/export',
  '/admin/delete',
  '/add-slot',
  '/add-series'
], adminAuth);

// 📦 SQLite DB-Verbindung
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('❌ Fehler beim Verbinden zur SQLite-Datenbank:', err.message);
  } else {
    console.log('📦 Verbunden mit SQLite-Datenbank.');
  }
});

// Tabellen anlegen
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      datetime TEXT NOT NULL,
      booked INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slotId INTEGER,
      name TEXT,
      email TEXT,
      phone TEXT,
      height INTEGER,
      weight INTEGER,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// 📅 Alle verfügbaren Slots abrufen
app.get('/slots', (req, res) => {
  db.all('SELECT * FROM slots ORDER BY datetime ASC', [], (err, rows) => {
    if (err) {
      console.error('❌ Fehler beim Abrufen der Slots:', err.message);
      res.status(500).json({ error: 'Fehler beim Abrufen der Slots' });
    } else {
      res.json(rows);
    }
  });
});

// 📋 Buchung eines Termins
app.post('/book', (req, res) => {
  const { slotId, name, email, phone, height, weight } = req.body;
  db.run('INSERT INTO bookings (slotId, name, email, phone, height, weight) VALUES (?, ?, ?, ?, ?, ?)',
    [slotId, name, email, phone, height, weight],
    function (err) {
      if (err) {
        console.error('❌ Fehler beim Einfügen der Buchung:', err.message);
        res.status(500).json({ error: 'Fehler bei der Buchung' });
      } else {
        db.run('UPDATE slots SET booked = 1 WHERE id = ?', [slotId]);
        res.json({ message: '✅ Buchung erfolgreich', bookingId: this.lastID });
      }
    });
});

// 📋 Alle Buchungen anzeigen (Admin)
app.get('/admin/bookings', (req, res) => {
  db.all(`
    SELECT bookings.*, slots.datetime FROM bookings
    JOIN slots ON bookings.slotId = slots.id
    ORDER BY slots.datetime ASC
  `, [], (err, rows) => {
    if (err) {
      console.error('❌ Fehler beim Abrufen der Buchungen:', err.message);
      res.status(500).json({ error: 'Fehler beim Abrufen der Buchungen' });
    } else {
      res.json(rows);
    }
  });
});

// ➕ Einzelnen Slot hinzufügen
app.post('/add-slot', (req, res) => {
  const { datetime } = req.body;
  db.run('INSERT INTO slots (datetime, booked) VALUES (?, 0)', [datetime], function (err) {
    if (err) {
      console.error('❌ Fehler beim Hinzufügen des Slots:', err.message);
      res.status(500).json({ error: 'Fehler beim Hinzufügen des Slots' });
    } else {
      res.json({ message: '✅ Slot hinzugefügt', slotId: this.lastID });
    }
  });
});

// ➕ Mehrere Slots in Serie hinzufügen
app.post('/add-series', (req, res) => {
  const { datetimes } = req.body; // Array von Datumsstrings
  const stmt = db.prepare('INSERT INTO slots (datetime, booked) VALUES (?, 0)');
  datetimes.forEach(datetime => stmt.run(datetime));
  stmt.finalize(err => {
    if (err) {
      console.error('❌ Fehler beim Hinzufügen mehrerer Slots:', err.message);
      res.status(500).json({ error: 'Fehler beim Hinzufügen der Slots' });
    } else {
      res.json({ message: '✅ Slots hinzugefügt' });
    }
  });
});

// ❌ Slot löschen
app.post('/admin/delete', (req, res) => {
  const { slotId } = req.body;
  db.run('DELETE FROM slots WHERE id = ?', [slotId], function (err) {
    if (err) {
      console.error('❌ Fehler beim Löschen:', err.message);
      res.status(500).json({ error: 'Fehler beim Löschen' });
    } else {
      db.run('DELETE FROM bookings WHERE slotId = ?', [slotId]);
      res.json({ message: '✅ Slot gelöscht' });
    }
  });
});

// ⬇️ Export als Excel-Datei
app.get('/admin/bookings/export', async (req, res) => {
  db.all(`
    SELECT bookings.*, slots.datetime FROM bookings
    JOIN slots ON bookings.slotId = slots.id
    ORDER BY slots.datetime ASC
  `, [], async (err, rows) => {
    if (err) {
      console.error('❌ Fehler beim Exportieren:', err.message);
      return res.status(500).send('Fehler beim Exportieren');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Buchungen');

    worksheet.columns = [
      { header: 'Datum/Zeit', key: 'datetime', width: 20 },
      { header: 'Name', key: 'name', width: 20 },
      { header: 'E-Mail', key: 'email', width: 25 },
      { header: 'Telefon', key: 'phone', width: 15 },
      { header: 'Größe (cm)', key: 'height', width: 15 },
      { header: 'Gewicht (kg)', key: 'weight', width: 15 },
      { header: 'Buchungszeitpunkt', key: 'createdAt', width: 20 },
    ];

    rows.forEach(row => worksheet.addRow(row));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="buchungen.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  });
});

// 🌐 Server starten
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf http://localhost:${PORT}`);
});
