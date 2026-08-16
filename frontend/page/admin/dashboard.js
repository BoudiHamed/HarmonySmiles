const STATUS_BADGE_CLASS = {
  Pending: "bg-warning text-dark",
  Confirmed: "bg-success",
  Cancelled: "bg-secondary",
  Completed: "bg-primary",
  NoShow: "bg-dark",
};

const tbody = document.getElementById("appointmentsBody");
const errorBox = document.getElementById("dashboardError");
const filterForm = document.getElementById("filterForm");
const statusFilter = document.getElementById("statusFilter");
const searchFilter = document.getElementById("searchFilter");
const dateRangeFilter = document.getElementById("dateRangeFilter");

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("d-none");
}

function hideError() {
  errorBox.classList.add("d-none");
}

// appointment_date is a UTC-midnight timestamp representing a calendar date
// with no time-of-day meaning — format it in UTC so it never shifts a day
// depending on the viewer's own timezone.
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(timeString) {
  return timeString.slice(0, 5);
}

// UX-only approximation (browser-local clock vs. the clinic's own timezone) used to
// disable the Complete button early; the backend is the real enforcement boundary.
function hasAppointmentStarted(appointment) {
  const appointmentDateTime = new Date(
    `${appointment.appointment_date}T${appointment.appointment_time}`,
  );
  return Date.now() >= appointmentDateTime.getTime();
}

function renderRows(appointments) {
  if (appointments.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center text-muted py-4">No appointments found.</td></tr>';
    return;
  }

  tbody.innerHTML = appointments
    .map(
      (appointment) => `
      <tr data-id="${appointment.id}">
        <td>${formatDate(appointment.appointment_date)}</td>
        <td>${formatTime(appointment.appointment_time)}</td>
<td>
          <a href="patient-profile.html?id=${appointment.patient_id}" class="patient-name-link">${escapeHtml(appointment.first_name)} ${escapeHtml(appointment.last_name)}</a>
        </td>
                <td>${escapeHtml(appointment.phone)}</td>
        <td>${escapeHtml(appointment.medical_record_number)}</td>
        <td>${appointment.visit_reason ? escapeHtml(appointment.visit_reason) : "—"}</td>
        <td><span class="badge ${STATUS_BADGE_CLASS[appointment.status] || "bg-secondary"}">${escapeHtml(appointment.status)}</span></td>
        <td class="text-end">
          <select class="form-select form-select-sm d-inline-block w-auto" data-action-select>
            <option value="" selected disabled>Actions…</option>
            <option value="confirm" ${appointment.status !== "Pending" ? "disabled" : ""}>Confirm</option>
            <option value="cancel" ${["Cancelled", "Completed", "NoShow"].includes(appointment.status) ? "disabled" : ""}>Cancel</option>
            <option value="complete" ${appointment.status === "Completed" || !hasAppointmentStarted(appointment) ? "disabled" : ""}>Complete</option>
            <option value="no-show" ${appointment.status === "NoShow" || !hasAppointmentStarted(appointment) ? "disabled" : ""}>No Show</option>
            <option value="delete">Delete</option>
          </select>
        </td>
      </tr>
    `,
    )
    .join("");
}

async function loadAppointments() {
  hideError();
  tbody.innerHTML =
    '<tr><td colspan="8" class="text-center text-muted py-4">Loading appointments…</td></tr>';

  const params = new URLSearchParams();
  if (statusFilter.value) params.set("status", statusFilter.value);
  if (searchFilter.value.trim())
    params.set("search", searchFilter.value.trim());
  if (dateRangeFilter.value) params.set("date_range", dateRangeFilter.value);

  const query = params.toString();

  try {
    const { data } = await adminFetch(
      `/admin/appointments${query ? `?${query}` : ""}`,
    );
    renderRows(data);
  } catch (error) {
    tbody.innerHTML = "";
    showError(error.message);
  }
}

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadAppointments();
});

dateRangeFilter.addEventListener("change", () => {
  loadAppointments();
});

// Applies immediately on change, same as dateRangeFilter, instead of waiting for Search.
// Picking a status is also a deliberate override — don't let the default "Today & Forward"
// time filter silently hide statuses (Completed/NoShow/old Cancelled) that live in the past.
statusFilter.addEventListener("change", () => {
  if (statusFilter.value) {
    dateRangeFilter.value = "";
  }
  loadAppointments();
});

document.getElementById("clearFiltersBtn").addEventListener("click", () => {
  statusFilter.value = "";
  searchFilter.value = "";
  dateRangeFilter.value = "";
  loadAppointments();
});

tbody.addEventListener("change", async (event) => {
  const select = event.target.closest("select[data-action-select]");
  if (!select) return;

  const row = select.closest("tr");
  const id = row.dataset.id;
  const action = select.value;
  select.value = ""; // reset to the placeholder right away so it never looks "stuck"

  if (!action) return;

  if (
    action === "delete" &&
    !window.confirm(
      "Delete this appointment permanently? This cannot be undone.",
    )
  ) {
    return;
  }

  hideError();

  try {
    if (action === "confirm") {
      await adminFetch(`/admin/appointments/${id}/confirm`, {
        method: "PATCH",
      });
    } else if (action === "cancel") {
      await adminFetch(`/admin/appointments/${id}/cancel`, { method: "PATCH" });
    } else if (action === "complete") {
      await adminFetch(`/admin/appointments/${id}/complete`, { method: "PATCH" });
    } else if (action === "no-show") {
      await adminFetch(`/admin/appointments/${id}/no-show`, { method: "PATCH" });
    } else if (action === "delete") {
      await adminFetch(`/admin/appointments/${id}`, { method: "DELETE" });
    }

    loadAppointments();
  } catch (error) {
    showError(error.message);
  }
});

loadAppointments();
