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

const tbody = document.getElementById('appointmentsBody');
const errorBox = document.getElementById('dashboardError');
const filterForm = document.getElementById('filterForm');
const statusFilter = document.getElementById('statusFilter');
const searchFilter = document.getElementById('searchFilter');
const dateRangeFilter = document.getElementById('dateRangeFilter');

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('d-none');
}

function hideError() {
  errorBox.classList.add('d-none');
}

// appointment_date is a UTC-midnight timestamp representing a calendar date
// with no time-of-day meaning — format it in UTC so it never shifts a day
// depending on the viewer's own timezone.
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

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function renderRows(appointments) {
  if (appointments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No appointments found.</td></tr>';
    return;
  }

  tbody.innerHTML = appointments
    .map((appointment) => `
      <tr data-id="${appointment.id}">
        <td>${formatDate(appointment.appointment_date)}</td>
        <td>${formatTime(appointment.appointment_time)}</td>
        <td>${escapeHtml(appointment.first_name)} ${escapeHtml(appointment.last_name)}</td>
        <td>${escapeHtml(appointment.phone)}</td>
        <td>${escapeHtml(appointment.medical_record_number)}</td>
        <td>${appointment.visit_reason ? escapeHtml(appointment.visit_reason) : '—'}</td>
        <td><span class="badge ${STATUS_BADGE_CLASS[appointment.status] || 'bg-secondary'}">${appointment.status}</span></td>
        <td class="text-end">
          <div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-outline-success" data-action="confirm" ${appointment.status === 'Confirmed' ? 'disabled' : ''}>Confirm</button>
            <button type="button" class="btn btn-outline-secondary" data-action="cancel" ${appointment.status === 'Cancelled' ? 'disabled' : ''}>Cancel</button>
            <button type="button" class="btn btn-outline-danger" data-action="delete">Delete</button>
          </div>
        </td>
      </tr>
    `)
    .join('');
}

async function loadAppointments() {
  hideError();
  tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Loading appointments…</td></tr>';

  const params = new URLSearchParams();
  if (statusFilter.value) params.set('status', statusFilter.value);
  if (searchFilter.value.trim()) params.set('search', searchFilter.value.trim());
  if (dateRangeFilter.value) params.set('date_range', dateRangeFilter.value);

  const query = params.toString();

  try {
    const { data } = await adminFetch(`/admin/appointments${query ? `?${query}` : ''}`);
    renderRows(data);
  } catch (error) {
    tbody.innerHTML = '';
    showError(error.message);
  }
}

filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadAppointments();
});

dateRangeFilter.addEventListener('change', () => {
  loadAppointments();
});

document.getElementById('clearFiltersBtn').addEventListener('click', () => {
  statusFilter.value = '';
  searchFilter.value = '';
  dateRangeFilter.value = '';
  loadAppointments();
});

tbody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const row = button.closest('tr');
  const id = row.dataset.id;
  const action = button.dataset.action;

  if (action === 'delete' && !window.confirm('Delete this appointment permanently? This cannot be undone.')) {
    return;
  }

  hideError();

  try {
    if (action === 'confirm') {
      await adminFetch(`/admin/appointments/${id}/confirm`, { method: 'PATCH' });
    } else if (action === 'cancel') {
      await adminFetch(`/admin/appointments/${id}/cancel`, { method: 'PATCH' });
    } else if (action === 'delete') {
      await adminFetch(`/admin/appointments/${id}`, { method: 'DELETE' });
    }

    loadAppointments();
  } catch (error) {
    showError(error.message);
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  window.location.href = './login.html';
});

loadAppointments();
