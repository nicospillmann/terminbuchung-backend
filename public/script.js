document.addEventListener('DOMContentLoaded', async () => {
  const tableContainer = document.getElementById('slotTableContainer');
  const calendarContainer = document.getElementById('calendarContainer');
  const tableBody = document.getElementById('slotTableBody');

  const bookingSection = document.getElementById('bookingSection');
  const bookingForm = document.getElementById('bookingForm');
  const backButton = document.getElementById('backButton');
  const status = document.getElementById('status');

  const toggleTableBtn = document.getElementById('toggleTable');
  const toggleCalendarBtn = document.getElementById('toggleCalendar');

  // Buchungs-Formular anzeigen
  window.showBookingForm = function (slotId) {
    document.getElementById('selectedSlotId').value = slotId;
    tableContainer.classList.add('hidden');
    calendarContainer.classList.add('hidden');
    bookingSection.classList.remove('hidden');
  };

  // Lade nur freie Slots vom Server
  async function loadSlots() {
    const response = await fetch('/api/slots'); // ✅ Öffentliche Route ohne Auth
    const slots = await response.json();

    // Tabelle leeren
    tableBody.innerHTML = '';

    // Tabelle füllen
    slots.forEach(slot => {
      const tr = document.createElement('tr');
      tr.className = slot.booked ? 'booked' : 'free';
      tr.innerHTML = `
        <td>${new Date(slot.datetime).toLocaleString('de-DE')}</td>
        <td>
          ${slot.booked ? 'Gebucht' : `<button onclick="showBookingForm(${slot.id})">Buchen</button>`}
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // Kalender füllen
    calendarContainer.innerHTML = '';
    slots.forEach(slot => {
      const div = document.createElement('div');
      div.className = `calendar-day ${slot.booked ? 'booked' : 'free'}`;
      div.innerHTML = `
        <strong>${new Date(slot.datetime).toLocaleDateString('de-DE')}</strong><br>
        ${new Date(slot.datetime).toLocaleTimeString('de-DE')}<br>
        ${!slot.booked ? `<button onclick="showBookingForm(${slot.id})">Buchen</button>` : 'Gebucht'}
      `;
      calendarContainer.appendChild(div);
    });
  }

  // Formular absenden
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      slotId: document.getElementById('selectedSlotId').value,
      name: `${document.getElementById('firstName').value} ${document.getElementById('lastName').value}`,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      height: document.getElementById('height').value,
      weight: document.getElementById('weight').value,
    };

    if (!data.slotId || !data.name.trim() || !data.email || !data.phone || !data.height || !data.weight) {
      alert("❗ Bitte alle Felder ausfüllen.");
      return;
    }

    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    status.textContent = result.message;
    bookingForm.reset();
    await loadSlots(); // aktualisiere Anzeige
  });

  backButton.addEventListener('click', () => {
    bookingSection.classList.add('hidden');
    tableContainer.classList.remove('hidden');
    status.textContent = '';
  });

  toggleTableBtn.addEventListener('click', () => {
    tableContainer.classList.remove('hidden');
    calendarContainer.classList.add('hidden');
    bookingSection.classList.add('hidden');
  });

  toggleCalendarBtn.addEventListener('click', () => {
    tableContainer.classList.add('hidden');
    calendarContainer.classList.remove('hidden');
    bookingSection.classList.add('hidden');
  });

  await loadSlots();
});
