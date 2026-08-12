if (!getToken()) {
  window.location.href = './login.html';
}

const STATUS_BADGE_CLASS = {
  Pending: 'bg-warning text-dark',
  Confirmed: 'bg-success',
  Cancelled: 'bg-secondary',
  Completed: 'bg-primary',
  NoShow: 'bg-dark',
};

const errorBox = document.getElementById('profileError');
const profileContent = document.getElementById('profileContent');
const upcomingAppointmentsBody = document.getElementById('upcomingAppointmentsBody');
const pastAppointmentsBody = document.getElementById('pastAppointmentsBody');

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('d-none');
}

// appointment_date is a plain 'YYYY-MM-DD' calendar date with no time-of-day meaning —
// format it in UTC so it never shifts a day depending on the viewer's own timezone.
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTime(timeString) {
  return timeString.slice(0, 5);
}

// created_at is a real timestamp (not a pure calendar date), so the
// viewer's own local timezone is the correct, meaningful one to show it in.
function formatRegisteredDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function renderAppointmentRows(tbody, appointments, emptyMessage) {
  if (appointments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">${emptyMessage}</td></tr>`;
    return;
  }

  tbody.innerHTML = appointments
    .map((appointment) => `
      <tr>
        <td>${formatDate(appointment.appointment_date)}</td>
        <td>${formatTime(appointment.appointment_time)}</td>
        <td>${appointment.visit_reason ? escapeHtml(appointment.visit_reason) : '—'}</td>
        <td><span class="badge ${STATUS_BADGE_CLASS[appointment.status] || 'bg-secondary'}">${appointment.status}</span></td>
      </tr>
    `)
    .join('');
}

function renderProfile({ patient, upcomingAppointments, pastAppointments }) {
  document.getElementById('patientName').textContent = `${patient.first_name} ${patient.last_name}`;
  document.getElementById('patientMrn').textContent = patient.medical_record_number;
  document.getElementById('patientPhone').textContent = patient.phone;
  document.getElementById('patientEmail').textContent = patient.email || '—';
  document.getElementById('patientAge').textContent = patient.age;
  document.getElementById('patientGender').textContent = patient.gender;
  document.getElementById('patientRegistered').textContent = formatRegisteredDate(patient.created_at);

  renderAppointmentRows(upcomingAppointmentsBody, upcomingAppointments, 'No upcoming appointments.');
  renderAppointmentRows(pastAppointmentsBody, pastAppointments, 'No past appointments.');

  profileContent.classList.remove('d-none');
}

async function loadProfile() {
  const patientId = new URLSearchParams(window.location.search).get('id');

  if (!patientId) {
    showError('No patient specified.');
    return;
  }

  try {
    const { data } = await adminFetch(`/admin/patients/${patientId}`);
    renderProfile(data);
  } catch (error) {
    showError(error.message);
  }
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  window.location.href = './login.html';
});

loadProfile();
