const API_BASE_URL = 'http://localhost:3000/api';

const form = document.getElementById('bookingForm');
const firstNameInput = document.getElementById('first_name');
const lastNameInput = document.getElementById('last_name');
const countryCodeSelect = document.getElementById('country_code');
const phoneInput = document.getElementById('phone');
const dateInput = document.getElementById('appointment_date');
const timeSelect = document.getElementById('appointment_time');
const birthYearInput = document.getElementById('birth_year');
const submitBtn = form.querySelector('button[type="submit"]');
const submitSpinner = document.getElementById('submitSpinner');
const successBox = document.getElementById('bookingSuccess');
const errorBox = document.getElementById('bookingError');

const WEEKEND_DAYS = [0, 6]; // Sunday, Saturday

// Today (browser-local) as a UX hint only — the backend is the source of
// truth for "future" and "clinic open" checks, in the clinic's own timezone.
const today = new Date();
const oneMonthOut = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
dateInput.min = today.toISOString().split('T')[0];
dateInput.max = oneMonthOut.toISOString().split('T')[0];
birthYearInput.max = String(today.getFullYear());

[...COUNTRY_CODES]
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach((country) => {
    const option = document.createElement('option');
    option.value = country.dial;
    option.textContent = `${isoToFlagEmoji(country.iso2)} ${country.name} (${country.dial})`;
    if (country.iso2 === 'CH') option.selected = true;
    countryCodeSelect.appendChild(option);
  });

function setFieldValidity(input, isValid) {
  input.classList.toggle('is-invalid', !isValid);
  return isValid;
}

// Parses a YYYY-MM-DD string as a clinic-local calendar date (no UTC shift),
// mirroring how the backend reads the same string in generateSlots.ts.
function parseDateOnly(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isWeekend(dateStr) {
  return WEEKEND_DAYS.includes(parseDateOnly(dateStr).getDay());
}

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

  if (!dateInput.value) {
    setFieldValidity(dateInput, true);
    setTimeOptions([], 'Pick a date first');
    return;
  }

  if (isWeekend(dateInput.value)) {
    setFieldValidity(dateInput, false);
    dateInput.value = '';
    setTimeOptions([], 'Pick a date first');
    showError('Clinic is closed on Saturdays and Sundays. Please choose another date.');
    return;
  }

  setFieldValidity(dateInput, true);
  loadSlotsForDate(dateInput.value);
});

function validateForm() {
  let isValid = true;

  isValid = setFieldValidity(firstNameInput, firstNameInput.value.trim().length >= 3) && isValid;
  isValid = setFieldValidity(lastNameInput, lastNameInput.value.trim().length >= 3) && isValid;

  const localPhone = phoneInput.value.trim().replace(/^0+/, '');
  const fullPhone = `${countryCodeSelect.value}${localPhone}`;
  isValid = setFieldValidity(phoneInput, /^\+[0-9]{9,15}$/.test(fullPhone)) && isValid;

  const dateValid = Boolean(dateInput.value) && !isWeekend(dateInput.value) && dateInput.value <= dateInput.max;
  isValid = setFieldValidity(dateInput, dateValid) && isValid;

  isValid = setFieldValidity(timeSelect, Boolean(timeSelect.value)) && isValid;

  return isValid;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessages();

  if (!validateForm()) {
    showError('Please fix the highlighted fields before submitting.');
    return;
  }

  const localPhone = phoneInput.value.trim().replace(/^0+/, '');

  const payload = {
    first_name: firstNameInput.value.trim(),
    last_name: lastNameInput.value.trim(),
    phone: `${countryCodeSelect.value}${localPhone}`,
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
    countryCodeSelect.value = '+41';
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
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
