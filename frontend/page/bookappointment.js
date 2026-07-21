const API_BASE_URL = 'http://localhost:3000/api';

const form = document.getElementById('bookingForm');
const dateInput = document.getElementById('appointment_date');
const timeSelect = document.getElementById('appointment_time');
const birthYearInput = document.getElementById('birth_year');
const submitBtn = form.querySelector('button[type="submit"]');
const submitSpinner = document.getElementById('submitSpinner');
const successBox = document.getElementById('bookingSuccess');
const errorBox = document.getElementById('bookingError');

// Today (browser-local) as a UX hint only — the backend is the source of
// truth for "future" and "clinic open" checks, in the clinic's own timezone.
const today = new Date();
dateInput.min = today.toISOString().split('T')[0];
birthYearInput.max = String(today.getFullYear());

function hideMessages() {
  successBox.classList.add('d-none');
  errorBox.classList.add('d-none');
}

function showSuccess(message) {
  successBox.textContent = message;
  successBox.classList.remove('d-none');
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('d-none');
}

function setTimeOptions(options, placeholder) {
  timeSelect.innerHTML = '';
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  placeholderOption.selected = true;
  timeSelect.appendChild(placeholderOption);

  options.forEach((time) => {
    const option = document.createElement('option');
    option.value = time;
    option.textContent = time.slice(0, 5);
    timeSelect.appendChild(option);
  });

  timeSelect.disabled = options.length === 0;
}

async function loadSlotsForDate(date) {
  timeSelect.disabled = true;
  setTimeOptions([], 'Loading available times…');

  try {
    const response = await fetch(`${API_BASE_URL}/available-slots?date=${date}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Could not load available times');
    }

    setTimeOptions(data.data, data.data.length === 0 ? 'No available times for this date' : 'Select a time');
  } catch (error) {
    setTimeOptions([], 'Could not load available times');
    showError(error.message);
  }
}

dateInput.addEventListener('change', () => {
  hideMessages();
  if (dateInput.value) {
    loadSlotsForDate(dateInput.value);
  } else {
    setTimeOptions([], 'Pick a date first');
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessages();

  const payload = {
    first_name: document.getElementById('first_name').value.trim(),
    last_name: document.getElementById('last_name').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    birth_year: Number(birthYearInput.value),
    gender: document.getElementById('gender').value,
    appointment_date: dateInput.value,
    appointment_time: timeSelect.value,
  };

  const email = document.getElementById('email').value.trim();
  if (email) payload.email = email;

  const visitReason = document.getElementById('visit_reason').value.trim();
  if (visitReason) payload.visit_reason = visitReason;

  const notes = document.getElementById('notes').value.trim();
  if (notes) payload.notes = notes;

  submitBtn.disabled = true;
  submitSpinner.classList.remove('d-none');

  try {
    const response = await fetch(`${API_BASE_URL}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      if (Array.isArray(data.errors)) {
        throw new Error(data.errors.map((issue) => issue.message).join(' '));
      }
      throw new Error(data.message || 'Booking failed');
    }

    showSuccess(data.message || 'Appointment booked successfully!');
    form.reset();
    setTimeOptions([], 'Pick a date first');
  } catch (error) {
    showError(error.message);
    // The slot may have just been taken by someone else — refresh the list.
    if (dateInput.value) loadSlotsForDate(dateInput.value);
  } finally {
    submitBtn.disabled = false;
    submitSpinner.classList.add('d-none');
  }
});
