const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000; // 💡 WICHTIG: Anpassung für Render

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) console.error('❌ Fehler bei DB-Verbindung:', err.message);
  else console.log('✅ Verbunden mit SQLite-Datenbank');
});

// Datenbank initialisieren
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

  db.get("SELECT COUNT(*) AS count FROM slots", (err, row) => {
    if (!err && row.count === 0) {
      const stmt = db.prepare("INSERT INTO slots (datetime, booked) VALUES (?, 0)");
      const now = new Date();
      for (let i = 1; i <= 5; i++) {
        const date = new Date(now.getTime() + i * 3600000);
        stmt.run(date.toISOString());
      }
      stmt.finalize(() => console.log("✅ Dummy-Slots eingefügt."));
    }
  });
});

// Verfügbare Slots
app.get('/api/slots', (req, res) => {
  db.all("SELECT * FROM slots WHERE booked = 0", (err, rows) => {
    if (err) return res.status(500).json({ error: 'Fehler beim Abrufen' });
    res.json(rows);
  });
});

// Slot buchen
app.post('/api/book', (req, res) => {
  const { slotId, name, email, phone, height, weight } = req.body;

  if (!slotId || !name || !email || !phone || !height || !weight) {
    return res.status(400).json({ message: 'Alle Buchungsfelder müssen ausgefüllt sein' });
  }

  db.serialize(() => {
    db.run("UPDATE slots SET booked = 1 WHERE id = ?", [slotId], function (err) {
      if (err || this.changes === 0) {
        return res.status(500).json({ message: 'Fehler bei der Buchung' });
      }

      db.run(`
        INSERT INTO bookings (slotId, name, email, phone, height, weight)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [slotId, name, email, phone, height, weight],
        (err) => {
          if (err) console.error('❌ Fehler beim Speichern:', err.message);
        }
      );

      res.json({ message: '✅ Termin erfolgreich gebucht!' });
    });
  });
});

// Admin: Alle Slots
app.get('/admin/slots', (req, res) => {
  db.all("SELECT * FROM slots ORDER BY datetime ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: 'Fehler beim Abrufen' });
    res.json(rows);
  });
});

// Admin: Buchungen
app.get('/admin/bookings', (req, res) => {
  db.all("SELECT * FROM bookings ORDER BY createdAt DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: 'Fehler beim Abrufen' });
    res.json(rows);
  });
});

// Excel-Export
app.get('/admin/bookings/export', async (req, res) => {
  const query = `
    SELECT 
      bookings.name, bookings.email, bookings.phone,
      bookings.height, bookings.weight, bookings.createdAt,
      slots.datetime AS slotTime
    FROM bookings
    JOIN slots ON bookings.slotId = slots.id
    ORDER BY bookings.createdAt DESC
  `;

  db.all(query, async (err, rows) => {
    if (err) return res.status(500).json({ error: 'Fehler beim Exportieren' });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Buchungen');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 20 },
      { header: 'E-Mail', key: 'email', width: 25 },
      { header: 'Telefon', key: 'phone', width: 18 },
      { header: 'Größe (cm)', key: 'height', width: 12 },
      { header: 'Gewicht (kg)', key: 'weight', width: 12 },
      { header: 'Slot-Zeit', key: 'slotTime', width: 22 },
      { header: 'Buchungszeit', key: 'createdAt', width: 22 }
    ];

    function formatGermanDate(dateString) {
      const d = new Date(dateString);
      const pad = n => n.toString().padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    rows.forEach(row => {
      row.slotTime = formatGermanDate(row.slotTime);
      row.createdAt = formatGermanDate(row.createdAt);
      worksheet.addRow(row);
    });

    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCE5FF' }
      };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' }
      };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="buchungen.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  });
});

// Slot hinzufügen
app.post('/add-slot', (req, res) => {
  const { datetime, count } = req.body;
  const slotCount = parseInt(count) || 1;

  if (!datetime) return res.status(400).json({ message: 'Kein Datum übergeben' });

  const stmt = db.prepare("INSERT INTO slots (datetime, booked) VALUES (?, 0)");
  for (let i = 0; i < slotCount; i++) {
    stmt.run(datetime);
  }
  stmt.finalize((err) => {
    if (err) return res.status(500).json({ message: 'Fehler beim Hinzufügen' });
    res.json({ message: `${slotCount} Slot(s) hinzugefügt` });
  });
});

// Serientermine
app.post('/add-series', (req, res) => {
  const { startDate, time, days, count } = req.body;
  if (!startDate || !time || !days || !count) return res.status(400).json({ message: 'Ungültige Daten' });

  const stmt = db.prepare("INSERT INTO slots (datetime, booked) VALUES (?, 0)");

  for (let i = 0; i < days; i++) {
    const date = new Date(`${startDate}T${time}`);
    date.setDate(date.getDate() + i);
    for (let j = 0; j < count; j++) {
      stmt.run(date.toISOString());
    }
  }

  stmt.finalize((err) => {
    if (err) return res.status(500).json({ message: 'Fehler bei Serienterminen' });
    res.json({ message: 'Serientermine hinzugefügt' });
  });
});

// Slots löschen
app.post('/admin/delete', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ message: 'Ungültige ID-Liste' });
  }

  const placeholders = ids.map(() => '?').join(',');

  db.serialize(() => {
    db.run(`DELETE FROM bookings WHERE slotId IN (${placeholders})`, ids, (err) => {
      if (err) return res.status(500).json({ message: 'Fehler beim Löschen der Buchungen' });

      db.run(`DELETE FROM slots WHERE id IN (${placeholders})`, ids, function (err) {
        if (err) return res.status(500).json({ message: 'Fehler beim Löschen der Slots' });
        res.json({ message: 'Termine & Buchungen gelöscht' });
      });
    });
  });
});

// 🟢 Server starten
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});
