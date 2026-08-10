if (!getToken()) {
  window.location.href = './login.html';
}

const patientsBody = document.getElementById('patientsBody');
const errorBox = document.getElementById('dashboardError');
const patientFilterForm = document.getElementById('patientFilterForm');
const patientSearchFilter = document.getElementById('patientSearchFilter');

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('d-none');
}

function hideError() {
  errorBox.classList.add('d-none');
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

function renderPatientRows(patients) {
  if (patients.length === 0) {
    patientsBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No patients found.</td></tr>';
    return;
  }

  patientsBody.innerHTML = patients
    .map((patient) => `
      <tr>
        <td>${escapeHtml(patient.medical_record_number)}</td>
        <td>${escapeHtml(patient.first_name)} ${escapeHtml(patient.last_name)}</td>
        <td>${escapeHtml(patient.phone)}</td>
        <td>${patient.email ? escapeHtml(patient.email) : '—'}</td>
        <td>${patient.age}</td>
        <td>${escapeHtml(patient.gender)}</td>
        <td>${formatRegisteredDate(patient.created_at)}</td>
      </tr>
    `)
    .join('');
}

async function loadPatients() {
  hideError();
  patientsBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Loading patients…</td></tr>';

  const params = new URLSearchParams();
  if (patientSearchFilter.value.trim()) params.set('search', patientSearchFilter.value.trim());

  const query = params.toString();

  try {
    const { data } = await adminFetch(`/admin/patients${query ? `?${query}` : ''}`);
    renderPatientRows(data);
  } catch (error) {
    patientsBody.innerHTML = '';
    showError(error.message);
  }
}

patientFilterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadPatients();
});

document.getElementById('clearPatientFiltersBtn').addEventListener('click', () => {
  patientSearchFilter.value = '';
  loadPatients();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  window.location.href = './login.html';
});

loadPatients();
