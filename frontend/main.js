import { initScanner, loadActivityOptions } from './scanner.js';

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : `http://${window.location.hostname}:5000/api`);

document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('.nav-links li');
  const views = document.querySelectorAll('.view');

  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  const btnLoginTrigger = document.getElementById('btn-login-trigger');
  const btnLogout = document.getElementById('btn-logout');
  const loginModal = document.getElementById('login-modal');
  const loginForm = document.getElementById('login-form');
  const navUsers = document.getElementById('nav-users');
  const navReports = document.getElementById('nav-reports');
  const navAdmins = document.getElementById('nav-admins');
  const navActivities = document.getElementById('nav-activities');
  const navTerminals = document.getElementById('nav-terminals');

  let loadedAttendanceRecords = [];

  const paginationState = {
    users: { currentPage: 1, pageSize: 10 },
    reports: { currentPage: 1, pageSize: 10 },
    activities: { currentPage: 1, pageSize: 10 },
    terminals: { currentPage: 1, pageSize: 10 },
    admins: { currentPage: 1, pageSize: 10 },
    bitacora: { currentPage: 1, pageSize: 10 }
  };

  function renderTableWithPagination(key, data, tbodySelector, paginationContainerId, renderRowFn) {
    const state = paginationState[key];
    const totalDocs = data.length;
    const pageSize = state.pageSize || 10;
    const totalPages = Math.ceil(totalDocs / pageSize) || 1;

    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    const startIndex = (state.currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalDocs);
    const pageData = data.slice(startIndex, endIndex);

    const tbody = document.querySelector(tbodySelector);
    if (!tbody) return;
    tbody.innerHTML = '';

    if (pageData.length === 0) {
      const colCount = document.querySelectorAll(`${tbodySelector.split(' ')[0]} thead th`).length || 4;
      tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align: center;">No hay registros disponibles</td></tr>`;
    } else {
      pageData.forEach(item => {
        const row = renderRowFn(item);
        tbody.appendChild(row);
      });
    }

    const pagContainer = document.getElementById(paginationContainerId);
    if (!pagContainer) return;
    pagContainer.innerHTML = '';

    if (totalPages <= 1) {
      pagContainer.className = '';
      return;
    }

    pagContainer.className = 'pagination-controls';

    // Botón Anterior
    const btnPrev = document.createElement('button');
    btnPrev.className = `btn btn-secondary btn-sm`;
    btnPrev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    btnPrev.disabled = state.currentPage === 1;
    if (state.currentPage === 1) btnPrev.classList.add('disabled');
    btnPrev.addEventListener('click', () => {
      state.currentPage--;
      renderTableWithPagination(key, data, tbodySelector, paginationContainerId, renderRowFn);
    });

    // Info
    const infoSpan = document.createElement('span');
    infoSpan.className = 'pagination-info';
    infoSpan.textContent = `Página ${state.currentPage} de ${totalPages} (${totalDocs} registros)`;

    // Botón Siguiente
    const btnNext = document.createElement('button');
    btnNext.className = `btn btn-secondary btn-sm`;
    btnNext.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    btnNext.disabled = state.currentPage === totalPages;
    if (state.currentPage === totalPages) btnNext.classList.add('disabled');
    btnNext.addEventListener('click', () => {
      state.currentPage++;
      renderTableWithPagination(key, data, tbodySelector, paginationContainerId, renderRowFn);
    });

    pagContainer.appendChild(btnPrev);
    pagContainer.appendChild(infoSpan);
    pagContainer.appendChild(btnNext);
  }

  const checkTerminalAuthorization = async () => {
    const token = localStorage.getItem('terminalToken');
    const authContainer = document.getElementById('authorized-scanner-container');
    const unauthContainer = document.getElementById('unauthorized-scanner-container');
    const btnAuthorize = document.getElementById('btn-authorize-device');
    const btnDeauthorize = document.getElementById('btn-deauthorize-device');
    const nameDisplay = document.getElementById('active-terminal-name-display');
    const nameLabel = document.getElementById('current-terminal-label');
    const adminToken = localStorage.getItem('adminToken');

    if (!token) {
      if (authContainer) authContainer.style.display = 'none';
      if (unauthContainer) unauthContainer.style.display = 'block';
      if (nameDisplay) nameDisplay.style.display = 'none';
      if (nameLabel) nameLabel.textContent = '-';
      if (adminToken) {
        if (btnAuthorize) btnAuthorize.style.display = 'flex';
        if (btnDeauthorize) btnDeauthorize.style.display = 'none';
      }
      return;
    }

    try {
      const res = await fetch(`${API_URL}/terminals/validate`, {
        headers: { 'x-terminal-token': token }
      });
      const data = await res.json();

      if (res.ok && data.isValid) {
        if (authContainer) authContainer.style.display = 'block';
        if (unauthContainer) unauthContainer.style.display = 'none';
        if (nameDisplay) nameDisplay.style.display = 'block';
        if (nameLabel) nameLabel.textContent = data.terminalName || '-';
        if (adminToken) {
          if (btnAuthorize) btnAuthorize.style.display = 'none';
          if (btnDeauthorize) btnDeauthorize.style.display = 'flex';
        }
      } else {
        // Token is invalid or revoked
        localStorage.removeItem('terminalToken');
        localStorage.removeItem('terminalName');
        if (authContainer) authContainer.style.display = 'none';
        if (unauthContainer) unauthContainer.style.display = 'block';
        if (nameDisplay) nameDisplay.style.display = 'none';
        if (nameLabel) nameLabel.textContent = '-';
        if (adminToken) {
          if (btnAuthorize) btnAuthorize.style.display = 'flex';
          if (btnDeauthorize) btnDeauthorize.style.display = 'none';
        }
        alert('Este dispositivo ha sido revocado o suspendido por el administrador.');
        window.location.reload(); // Reload to stop scanner stream and clear active memory
      }
    } catch (err) {
      // Offline fallback: trust local token to support offline/intermittent connections
      if (authContainer) authContainer.style.display = 'block';
      if (unauthContainer) unauthContainer.style.display = 'none';
      if (nameDisplay) nameDisplay.style.display = 'block';
      if (nameLabel) nameLabel.textContent = localStorage.getItem('terminalName') || '-';
      if (adminToken) {
        if (btnAuthorize) btnAuthorize.style.display = 'none';
        if (btnDeauthorize) btnDeauthorize.style.display = 'flex';
      }
    }
  };

  const checkLogin = () => {
    const token = localStorage.getItem('adminToken');
    const btnAuthorize = document.getElementById('btn-authorize-device');
    const btnDeauthorize = document.getElementById('btn-deauthorize-device');

    if (token) {
      navUsers.style.display = 'flex';
      navReports.style.display = 'flex';
      navActivities.style.display = 'flex';
      navTerminals.style.display = 'flex';
      navAdmins.style.display = 'flex';
      const navBitacora = document.getElementById('nav-bitacora');
      if (navBitacora) navBitacora.style.display = 'flex';
      btnLoginTrigger.style.display = 'none';
      btnLogout.style.display = 'flex';
    } else {
      navUsers.style.display = 'none';
      navReports.style.display = 'none';
      navActivities.style.display = 'none';
      navTerminals.style.display = 'none';
      navAdmins.style.display = 'none';
      const navBitacora = document.getElementById('nav-bitacora');
      if (navBitacora) navBitacora.style.display = 'none';
      btnLoginTrigger.style.display = 'flex';
      btnLogout.style.display = 'none';
      if (btnAuthorize) btnAuthorize.style.display = 'none';
      if (btnDeauthorize) btnDeauthorize.style.display = 'none';
      // Force to scanner view
      const scannerTab = document.querySelector('[data-view="scanner-view"]');
      if (scannerTab) scannerTab.click();
    }
    checkTerminalAuthorization();
  };


  const getAuthHeaders = (isFormData = false) => {
    const token = localStorage.getItem('adminToken');
    const headers = { 'Authorization': `Bearer ${token}` };
    if (!isFormData) headers['Content-Type'] = 'application/json';
    return headers;
  };

  btnLoginTrigger.addEventListener('click', () => loginModal.classList.add('active'));
  document.getElementById('btn-close-login').addEventListener('click', () => loginModal.classList.remove('active'));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Ingresando...';

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('adminToken', data.token);
        loginModal.classList.remove('active');
        loginForm.reset();
        checkLogin();
      } else {
        alert(data.message);
      }
    } catch (error) {
      alert('Error de conexión');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  btnLogout.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    checkLogin();
  });

  const btnAuthorize = document.getElementById('btn-authorize-device');
  const btnDeauthorize = document.getElementById('btn-deauthorize-device');

  if (btnAuthorize) {
    btnAuthorize.addEventListener('click', async () => {
      const name = prompt('Ingresa un nombre descriptivo para identificar esta terminal (ej. Recepción, Comedor):');
      if (!name || !name.trim()) return;

      try {
        const res = await fetch(`${API_URL}/terminals`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ name: name.trim() })
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem('terminalToken', data.terminal.token);
          localStorage.setItem('terminalName', data.terminal.name);
          alert('¡Este navegador ha sido autorizado como Terminal Checador con éxito!');
          checkTerminalAuthorization();
        } else {
          alert('Error al autorizar: ' + data.message);
        }
      } catch (err) {
        alert('Error de conexión al servidor');
      }
    });
  }

  if (btnDeauthorize) {
    btnDeauthorize.addEventListener('click', () => {
      if (confirm('¿Estás seguro de que deseas quitar la autorización a este dispositivo? Ya no podrá registrar asistencias.')) {
        localStorage.removeItem('terminalToken');
        localStorage.removeItem('terminalName');
        alert('Autorización removida.');
        checkTerminalAuthorization();
      }
    });
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation(); // Avoid immediately triggering click-outside
      sidebar.classList.toggle('open');
    });
  }

  const menuClose = document.getElementById('menu-close');
  if (menuClose) {
    menuClose.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.remove('open');
    });
  }

  // Click outside sidebar on mobile closes it
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    }
  });

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const targetViewId = link.getAttribute('data-view');
      const activeView = document.querySelector('.view.active-view');
      if (activeView && activeView.id === targetViewId) {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
        }
        return;
      }

      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      views.forEach(view => {
        view.classList.remove('active-view');
        if (view.id === targetViewId) view.classList.add('active-view');
      });
      if (targetViewId === 'users-view') loadUsers();
      else if (targetViewId === 'reports-view') { loadReports(); startPresencePolling(); }
      else if (targetViewId === 'admins-view') loadAdmins();
      else if (targetViewId === 'activities-view') loadActivities();
      else if (targetViewId === 'terminals-view') loadTerminals();
      else if (targetViewId === 'bitacora-view') loadAuditLogs();
      else if (targetViewId === 'scanner-view') loadActivityOptions();

      // Detener el polling de presencia si salimos de la vista de Reportes
      if (targetViewId !== 'reports-view') stopPresencePolling();

      // Close sidebar on mobile
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
      }
    });
  });

  initScanner();
  checkLogin();

  // Excel Upload
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('excel-file');

  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault(); uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
  });

  async function handleFileUpload(file) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) return alert('Solo Excel (.xlsx, .xls)');
    uploadArea.innerHTML = `<i class="fa-solid fa-spinner fa-spin fa-3x"></i><p>Procesando...</p>`;
    const formData = new FormData(); formData.append('file', file);
    try {
      const res = await fetch(`${API_URL}/users/upload`, { method: 'POST', headers: getAuthHeaders(true), body: formData });
      const data = await res.json();
      if (res.ok) { alert(data.message); loadUsers(); } else alert('Error: ' + data.message);
    } catch (err) { alert('Error de conexión'); }
    resetUploadArea();
  }

  function resetUploadArea() {
    uploadArea.innerHTML = `
      <i class="fa-solid fa-cloud-arrow-up fa-3x"></i>
      <h3>Subir Archivo Excel</h3>
      <p>Soporta columnas: Nombre, Área, Puesto, Tipo</p>
      <input type="file" id="excel-file" accept=".xlsx, .xls" style="display: none;">
      <a href="/plantilla_empleados.xlsx" download class="btn btn-secondary" style="margin-top: 1rem;" onclick="event.stopPropagation();">
        <i class="fa-solid fa-file-excel"></i> Descargar Plantilla
      </a>
    `;
    document.getElementById('excel-file').addEventListener('change', e => {
      if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
    });
  }

  // Users CRUD
  window.editUser = function (userStr) {
    const user = JSON.parse(decodeURIComponent(userStr));
    document.getElementById('modal-title').textContent = 'Editar Empleado';
    document.getElementById('employee-id').value = user._id;
    document.getElementById('employee-name').value = user.name;
    const identifierField = document.getElementById('employee-identifier');
    if (identifierField) {
      identifierField.value = user.identifier || '';
      identifierField.readOnly = true;
    }
    document.getElementById('employee-area').value = user.area || '';
    document.getElementById('employee-position').value = user.position || '';
    document.getElementById('employee-type').value = user.employeeType || 'Base';
    openModal();
  };

  window.toggleStatus = async function (id, currentStatus) {
    if (!confirm(`¿Estás seguro de ${currentStatus ? 'desactivar' : 'activar'} a este empleado?`)) return;
    try {
      const res = await fetch(`${API_URL}/users/${id}/status`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !currentStatus })
      });
      if (res.ok) loadUsers();
      else alert('Error al cambiar estado');
    } catch (err) { console.error(err); alert('Error de conexión'); }
  };

  window.viewQR = function (userStr) {
    const user = JSON.parse(decodeURIComponent(userStr));
    document.getElementById('qr-modal-name').textContent = user.name;
    document.getElementById('qr-modal-id').textContent = 'ID: ' + user.identifier;
    document.getElementById('qr-modal-img').src = user.qrCode;
    document.getElementById('qr-modal').classList.add('active');

    const btnDownload = document.getElementById('btn-download-qr');
    btnDownload.onclick = () => {
      const a = document.createElement('a');
      a.href = user.qrCode;
      a.download = `QR_${user.name.replace(/\s+/g, '_')}.png`;
      a.click();
    };
  };

  async function loadUsers() {
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const res = await fetch(`${API_URL}/users`, { headers: getAuthHeaders() });
      const users = await res.json();
      tbody.innerHTML = '';
      if (users.length === 0) return tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No hay empleados registrados</td></tr>';

      renderTableWithPagination('users', users, '#users-table tbody', 'users-pagination', user => {
        const tr = document.createElement('tr');
        if (!user.isActive) tr.classList.add('user-inactive');

        const userStr = encodeURIComponent(JSON.stringify(user));

        tr.innerHTML = `
          <td><strong>${user.name}</strong><br><small style="color: var(--text-muted)">${user.identifier}</small></td>
          <td>${user.area || '-'}<br><small style="color: var(--text-muted)">${user.position || '-'}</small></td>
          <td><span class="badge badge-neutral">${user.employeeType || 'Base'}</span></td>
          <td>
            <span class="badge ${user.isActive ? 'badge-entrada' : 'badge-salida'}">
              ${user.isActive ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td>
            <img src="${user.qrCode}" class="qr-img" alt="QR" style="width:50px;height:50px; cursor:pointer;" onclick="viewQR(decodeURIComponent('${userStr}'))" title="Clic para ver en grande"/>
          </td>
          <td>
            <button class="btn-icon" title="Editar" onclick="editUser('${userStr}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon ${user.isActive ? 'delete' : 'activate'}" title="${user.isActive ? 'Desactivar' : 'Activar'}" onclick="toggleStatus('${user._id}', ${user.isActive})">
              <i class="fa-solid ${user.isActive ? 'fa-user-minus' : 'fa-user-check'}"></i>
            </button>
          </td>
        `;
        return tr;
      });
    } catch (err) { tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error al cargar</td></tr>'; }
  }

  // Modal logic
  const modal = document.getElementById('employee-modal');
  const btnNew = document.getElementById('btn-new-employee');
  const btnClose = document.getElementById('btn-close-modal');
  const btnCancel = document.getElementById('btn-cancel-modal');
  const form = document.getElementById('employee-form');

  const openModal = () => modal.classList.add('active');
  const closeModal = () => {
    modal.classList.remove('active');
    form.reset();
    document.getElementById('employee-id').value = '';
    const identifierField = document.getElementById('employee-identifier');
    if (identifierField) identifierField.readOnly = false;
  };

  document.getElementById('btn-regenerate-qrs').addEventListener('click', async () => {
    if (!confirm('¿Regenerar los QRs de todos los empleados? Esta acción no se puede deshacer.')) return;
    const btn = document.getElementById('btn-regenerate-qrs');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Regenerando...';
    try {
      const res = await fetch(`${API_URL}/users/regenerate-qrs`, { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) { alert(data.message); loadUsers(); }
      else throw new Error(data.message);
    } catch (err) { alert('Error: ' + err.message); }
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Regenerar QRs';
  });

  btnNew.addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Nuevo Empleado';
    openModal();
  });
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  // QR Modal Close
  document.getElementById('btn-close-qr-modal').addEventListener('click', () => {
    document.getElementById('qr-modal').classList.remove('active');
  });

  // Photo Modal
  document.getElementById('btn-close-photo-modal').addEventListener('click', () => {
    document.getElementById('photo-modal').classList.remove('active');
  });

  window.viewPhoto = function (photoUrl, userName) {
    document.getElementById('photo-modal-name').textContent = userName;
    document.getElementById('photo-modal-img').src = photoUrl;
    document.getElementById('photo-modal').classList.add('active');
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('employee-id').value;
    const body = {
      name: document.getElementById('employee-name').value,
      identifier: document.getElementById('employee-identifier')?.value,
      area: document.getElementById('employee-area').value,
      position: document.getElementById('employee-position').value,
      employeeType: document.getElementById('employee-type').value,
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/users/${id}` : `${API_URL}/users`;

    try {
      const res = await fetch(url, {
        method, headers: getAuthHeaders(), body: JSON.stringify(body)
      });
      if (res.ok) { closeModal(); loadUsers(); }
      else { const data = await res.json(); alert(data.message); }
    } catch (err) { alert('Error de conexión'); }
  });

  const filterStart = document.getElementById('filter-start-date');
  const filterEnd = document.getElementById('filter-end-date');

  function applyLocalReportFilter() {
    let filtered = loadedAttendanceRecords;
    const startVal = filterStart?.value;
    const endVal = filterEnd?.value;

    if (startVal) {
      const startDate = new Date(startVal + "T00:00:00");
      filtered = filtered.filter(r => new Date(r.timestamp) >= startDate);
    }
    if (endVal) {
      const endDate = new Date(endVal + "T23:59:59");
      filtered = filtered.filter(r => new Date(r.timestamp) <= endDate);
    }

    const tbody = document.querySelector('#reports-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No hay registros para el rango de fechas seleccionado</td></tr>';
      document.getElementById('reports-pagination').innerHTML = '';
      return;
    }

    renderTableWithPagination('reports', filtered, '#reports-table tbody', 'reports-pagination', record => {
      const date = new Date(record.timestamp);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${record.user?.name || 'Desconocido'}</strong><br><small style="color: var(--text-muted)">${record.user?.area || '-'} / ${record.user?.position || '-'}</small></td>
        <td>${record.user?.identifier || '-'}</td>
        <td><span class="badge ${(record.type === 'Entrada' || record.type === 'Inicio') ? 'badge-entrada' : 'badge-salida'}">${record.type}</span></td>
        <td><span class="badge badge-neutral">${record.activity || 'Jornada Laboral'}</span></td>
        <td><strong>${record.terminalName || 'Web App / Desconocido'}</strong></td>
        <td>${date.toLocaleString()}</td>
        <td>${record.photo ? `<img src="${record.photo}" class="photo-img" style="cursor: pointer; width: 50px; height: 50px; object-fit: cover; border-radius: 4px;" onclick="viewPhoto('${record.photo}', '${record.user?.name || 'Desconocido'}')" title="Ver en grande"/>` : '-'}</td>
      `;
      return tr;
    });
  }

  if (filterStart) filterStart.addEventListener('change', applyLocalReportFilter);
  if (filterEnd) filterEnd.addEventListener('change', applyLocalReportFilter);

  async function loadReports() {
    const tbody = document.querySelector('#reports-table tbody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      updatePresenceWidget();
      const res = await fetch(`${API_URL}/attendance`, { headers: getAuthHeaders() });
      const records = await res.json();
      tbody.innerHTML = '';
      if (records.length === 0) return tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No hay registros</td></tr>';

      loadedAttendanceRecords = records;
      applyLocalReportFilter();
    } catch (err) { tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger);">Error</td></tr>'; }
  }

  let cachedPresenceData = null;
  let presencePollingInterval = null;

  function startPresencePolling() {
    stopPresencePolling(); // Evitar intervalos duplicados
    presencePollingInterval = setInterval(() => {
      const activeView = document.querySelector('.view.active-view');
      if (activeView && activeView.id === 'reports-view') {
        updatePresenceWidget();
      } else {
        stopPresencePolling();
      }
    }, 30000); // Cada 30 segundos
  }

  function stopPresencePolling() {
    if (presencePollingInterval) {
      clearInterval(presencePollingInterval);
      presencePollingInterval = null;
    }
  }

  async function updatePresenceWidget() {
    const presenceCountEl = document.getElementById('presence-count');
    if (!presenceCountEl) return;
    try {
      const res = await fetch(`${API_URL}/presence/status`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        cachedPresenceData = data;
        presenceCountEl.textContent = data.insideCount;
        
        const modalInsideEl = document.getElementById('modal-inside-count');
        const modalOutsideEl = document.getElementById('modal-outside-count');
        if (modalInsideEl) modalInsideEl.textContent = data.insideCount;
        if (modalOutsideEl) modalOutsideEl.textContent = data.outsideCount;
      }
    } catch (err) {
      console.error('Error al actualizar presencia:', err);
    }
  }

  const presenceModal = document.getElementById('presence-modal');
  const btnViewPresenceDetail = document.getElementById('btn-view-presence-detail');
  const btnClosePresenceModal = document.getElementById('btn-close-presence-modal');
  const tabInside = document.getElementById('tab-inside');
  const tabOutside = document.getElementById('tab-outside');
  let currentPresenceTab = 'inside';

  if (btnViewPresenceDetail) {
    btnViewPresenceDetail.addEventListener('click', async () => {
      presenceModal.classList.add('active');
      currentPresenceTab = 'inside';
      
      tabInside.classList.replace('btn-secondary', 'btn-primary');
      tabOutside.classList.replace('btn-primary', 'btn-secondary');
      
      await updatePresenceWidget();
      renderPresenceList();
    });
  }

  if (btnClosePresenceModal) {
    btnClosePresenceModal.addEventListener('click', () => {
      presenceModal.classList.remove('active');
    });
  }

  if (tabInside) {
    tabInside.addEventListener('click', () => {
      currentPresenceTab = 'inside';
      tabInside.classList.replace('btn-secondary', 'btn-primary');
      tabOutside.classList.replace('btn-primary', 'btn-secondary');
      renderPresenceList();
    });
  }

  if (tabOutside) {
    tabOutside.addEventListener('click', () => {
      currentPresenceTab = 'outside';
      tabOutside.classList.replace('btn-secondary', 'btn-primary');
      tabInside.classList.replace('btn-primary', 'btn-secondary');
      renderPresenceList();
    });
  }

  function renderPresenceList() {
    const tbody = document.querySelector('#presence-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!cachedPresenceData) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Cargando...</td></tr>';
      return;
    }

    const list = currentPresenceTab === 'inside' ? cachedPresenceData.insideList : cachedPresenceData.outsideList;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No hay personal ${currentPresenceTab === 'inside' ? 'dentro' : 'fuera'} del edificio</td></tr>`;
      return;
    }

    list.forEach(user => {
      const tr = document.createElement('tr');
      
      let movementTime = 'Sin registros hoy';
      let movementType = 'Inactivo / Fuera';

      if (user.lastRecord) {
        movementTime = new Date(user.lastRecord.timestamp).toLocaleString();
        
        if (user.lastRecord.type === 'Entrada') {
          movementType = `<span class="badge badge-entrada">Entrada</span>`;
        } else if (user.lastRecord.type === 'Salida') {
          movementType = `<span class="badge badge-salida">Salida</span>`;
        } else if (user.lastRecord.type === 'Inicio') {
          movementType = `<span class="badge badge-entrada">Entrada</span>`;
        } else if (user.lastRecord.type === 'Fin') {
          movementType = `<span class="badge badge-salida">Salida</span>`;
        }
      }

      tr.innerHTML = `
        <td><strong>${user.name}</strong><br><small style="color: var(--text-muted)">${user.identifier}</small></td>
        <td>${user.area || '-'}<br><small style="color: var(--text-muted)">${user.position || '-'}</small></td>
        <td>${movementTime}</td>
        <td>${movementType}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  const btnExportFiltered = document.getElementById('btn-export-filtered');
  if (btnExportFiltered) {
    btnExportFiltered.addEventListener('click', async () => {
      const startDate = document.getElementById('filter-start-date').value;
      const endDate = document.getElementById('filter-end-date').value;

      const originalText = btnExportFiltered.innerHTML;
      btnExportFiltered.disabled = true;
      btnExportFiltered.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

      try {
        const res = await fetch(`${API_URL}/audit/export`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ startDate, endDate })
        });
        const data = await res.json();
        if (res.ok) {
          // Descargar archivo de respaldo de Cloudinary automáticamente
          const a = document.createElement('a');
          a.href = data.backupUrl;
          a.download = `Reporte_Asistencias_${startDate || 'todas'}_a_${endDate || 'todas'}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          alert(`Exportación exitosa. Se descargó el reporte con ${data.count} registros y se guardó una copia de seguridad en la nube.`);
          loadReports(); // Recargar reportes para actualizar bitácora si procede
        } else {
          alert('Error al exportar: ' + data.message);
        }
      } catch (err) {
        alert('Error de conexión al servidor al exportar');
      } finally {
        btnExportFiltered.disabled = false;
        btnExportFiltered.innerHTML = originalText;
      }
    });
  }

  const btnPurgeRange = document.getElementById('btn-purge-range');
  if (btnPurgeRange) {
    btnPurgeRange.addEventListener('click', async () => {
      const startDate = document.getElementById('filter-start-date').value;
      const endDate = document.getElementById('filter-end-date').value;

      if (!startDate || !endDate) {
        alert('Por favor, selecciona tanto la Fecha Inicial como la Fecha Final para realizar la eliminación física.');
        return;
      }

      const doubleConfirm = confirm(`¿Estás COMPLETAMENTE SEGURO de que deseas eliminar permanentemente todas las asistencias y fotos de Cloudinary del rango: ${startDate} al ${endDate}?\n\nEsta acción no se puede deshacer.`);
      if (!doubleConfirm) return;

      const keyPrompt = prompt("ADVERTENCIA DE SEGURIDAD:\nEsta acción borrará de forma irreversible los archivos físicos de fotografías en el servidor y los documentos en la base de datos.\n\nPara proceder, escribe la palabra BORRAR en mayúsculas:");
      if (keyPrompt !== 'BORRAR') {
        alert('Confirmación incorrecta. Acción cancelada.');
        return;
      }

      const originalText = btnPurgeRange.innerHTML;
      btnPurgeRange.disabled = true;
      btnPurgeRange.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Eliminando...';

      try {
        const res = await fetch(`${API_URL}/attendance/purge`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
          body: JSON.stringify({ startDate, endDate })
        });
        const data = await res.json();
        if (res.ok) {
          alert(data.message);
          // Limpiar inputs
          document.getElementById('filter-start-date').value = '';
          document.getElementById('filter-end-date').value = '';
          loadReports(); // Recargar reportes
        } else {
          alert('Error al borrar: ' + data.message);
        }
      } catch (err) {
        alert('Error de conexión al servidor al borrar');
      } finally {
        btnPurgeRange.disabled = false;
        btnPurgeRange.innerHTML = originalText;
      }
    });
  }

  async function loadAuditLogs() {
    const tbody = document.querySelector('#bitacora-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const res = await fetch(`${API_URL}/audit`, { headers: getAuthHeaders() });
      const logs = await res.json();
      tbody.innerHTML = '';
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No hay registros de auditoría</td></tr>';
        document.getElementById('bitacora-pagination').innerHTML = '';
        return;
      }

      renderTableWithPagination('bitacora', logs, '#bitacora-table tbody', 'bitacora-pagination', log => {
        const date = new Date(log.timestamp);
        const tr = document.createElement('tr');

        let actionBadge = '';
        if (log.action === 'Exportar') {
          actionBadge = `<span class="badge badge-exportar"><i class="fa-solid fa-file-excel"></i> Exportar</span>`;
        } else if (log.action === 'Eliminar') {
          actionBadge = `<span class="badge badge-eliminar"><i class="fa-solid fa-trash-can"></i> Eliminar</span>`;
        }

        let backupBtn = '';
        if (log.backupUrl) {
          backupBtn = `<br><a href="${log.backupUrl}" target="_blank" class="btn btn-secondary btn-xs" style="margin-top: 0.5rem;"><i class="fa-solid fa-cloud-arrow-down"></i> Descargar Respaldo</a>`;
        }

        tr.innerHTML = `
          <td><strong>${log.username}</strong></td>
          <td>${actionBadge}</td>
          <td>${log.details}${backupBtn}</td>
          <td>${date.toLocaleString()}</td>
        `;
        return tr;
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">Error al cargar bitácora</td></tr>';
    }
  }

  // Admins CRUD
  const adminModal = document.getElementById('admin-modal');
  const passwordModal = document.getElementById('password-modal');
  const adminForm = document.getElementById('admin-form');
  const passwordForm = document.getElementById('password-form');

  document.getElementById('btn-new-admin').addEventListener('click', () => {
    adminModal.classList.add('active');
  });
  document.getElementById('btn-close-admin').addEventListener('click', () => {
    adminModal.classList.remove('active'); adminForm.reset();
  });
  document.getElementById('btn-close-password').addEventListener('click', () => {
    passwordModal.classList.remove('active'); passwordForm.reset();
  });

  window.changeAdminPassword = (id) => {
    document.getElementById('password-admin-id').value = id;
    passwordModal.classList.add('active');
  };

  window.deleteAdmin = async (id) => {
    if (!confirm('¿Eliminar administrador?')) return;
    try {
      const res = await fetch(`${API_URL}/auth/admins/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) loadAdmins(); else alert(data.message);
    } catch (e) { alert('Error de conexión'); }
  };

  adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    try {
      const res = await fetch(`${API_URL}/auth/admins`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        adminModal.classList.remove('active'); adminForm.reset(); loadAdmins();
      } else alert(data.message);
    } catch (err) { alert('Error'); }
  });

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('password-admin-id').value;
    const newPassword = document.getElementById('new-password').value;
    try {
      const res = await fetch(`${API_URL}/auth/admins/${id}/password`, {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        passwordModal.classList.remove('active'); passwordForm.reset(); alert('Contraseña actualizada');
      } else alert(data.message);
    } catch (err) { alert('Error'); }
  });

  async function loadAdmins() {
    const tbody = document.querySelector('#admins-table tbody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const res = await fetch(`${API_URL}/auth/admins`, { headers: getAuthHeaders() });
      const admins = await res.json();
      tbody.innerHTML = '';
      if (admins.length === 0) return tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No hay administradores</td></tr>';

      renderTableWithPagination('admins', admins, '#admins-table tbody', 'admins-pagination', admin => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${admin.username}</strong></td>
          <td>${admin._id}</td>
          <td>
            <button class="btn-icon" title="Cambiar Contraseña" onclick="changeAdminPassword('${admin._id}')"><i class="fa-solid fa-key"></i></button>
            <button class="btn-icon delete" title="Eliminar" onclick="deleteAdmin('${admin._id}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        `;
        return tr;
      });
    } catch (err) { tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--danger);">Error</td></tr>'; }
  }

  // Activities CRUD
  const activityModal = document.getElementById('activity-modal');
  const activityForm = document.getElementById('activity-form');
  const btnNewActivity = document.getElementById('btn-new-activity');
  const btnCloseActivity = document.getElementById('btn-close-activity');

  const photoModal = document.getElementById('photo-modal');
  if (photoModal) {
    photoModal.addEventListener('click', (e) => {
      if (e.target === photoModal) {
        photoModal.classList.remove('active');
      }
    });
  }

  const qrModal = document.getElementById('qr-modal');
  if (qrModal) {
    qrModal.addEventListener('click', (e) => {
      if (e.target === qrModal) {
        qrModal.classList.remove('active');
      }
    });
  }

  const openActivityModal = () => activityModal.classList.add('active');
  const closeActivityModal = () => {
    activityModal.classList.remove('active');
    activityForm.reset();
    document.getElementById('activity-id').value = '';
    document.getElementById('activity-outside').checked = false;
    document.getElementById('activity-modal-title').textContent = 'Nueva Actividad';
  };

  if (btnNewActivity) btnNewActivity.addEventListener('click', openActivityModal);
  if (btnCloseActivity) btnCloseActivity.addEventListener('click', closeActivityModal);

  window.editActivity = (id, name, isActive, marcaFueraEdificio) => {
    document.getElementById('activity-modal-title').textContent = 'Editar Actividad';
    document.getElementById('activity-id').value = id;
    document.getElementById('activity-name').value = name;
    document.getElementById('activity-status').value = isActive.toString();
    document.getElementById('activity-outside').checked = marcaFueraEdificio === true;
    openActivityModal();
  };

  window.deleteActivity = async (id) => {
    if (!confirm('¿Seguro que deseas eliminar esta actividad?')) return;
    try {
      const res = await fetch(`${API_URL}/activities/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        loadActivities();
        loadActivityOptions();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Error de conexión');
    }
  };

  activityForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('activity-id').value;
    const name = document.getElementById('activity-name').value;
    const isActive = document.getElementById('activity-status').value === 'true';
    const marcaFueraEdificio = document.getElementById('activity-outside').checked;

    const body = { name, isActive, marcaFueraEdificio };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/activities/${id}` : `${API_URL}/activities`;

    try {
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        closeActivityModal();
        loadActivities();
        loadActivityOptions();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Error de conexión');
    }
  });

  async function loadActivities() {
    const tbody = document.querySelector('#activities-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const res = await fetch(`${API_URL}/activities/all?t=${Date.now()}`, { headers: getAuthHeaders(), cache: 'no-store' });
      const activities = await res.json();
      tbody.innerHTML = '';
      if (activities.length === 0) {
        return tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay actividades registradas</td></tr>';
      }

      renderTableWithPagination('activities', activities, '#activities-table tbody', 'activities-pagination', act => {
        const tr = document.createElement('tr');
        if (!act.isActive) tr.classList.add('user-inactive');

        tr.innerHTML = `
          <td><strong>${act.name}</strong></td>
          <td>
            <span class="badge ${act.isActive ? 'badge-entrada' : 'badge-salida'}">
              ${act.isActive ? 'Activa' : 'Inactiva'}
            </span>
          </td>
          <td style="text-align: center;">
            <span class="badge ${act.marcaFueraEdificio ? 'badge-salida' : 'badge-neutral'}">
              ${act.marcaFueraEdificio ? 'Sí' : 'No'}
            </span>
          </td>
          <td><small style="color: var(--text-muted)">${act._id}</small></td>
          <td>
            <button class="btn-icon" title="Editar" onclick="editActivity('${act._id}', '${act.name.replace(/'/g, "\\'")}', ${act.isActive}, ${act.marcaFueraEdificio || false})">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon delete" title="Eliminar" onclick="deleteActivity('${act._id}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        `;
        return tr;
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger);">Error al cargar actividades</td></tr>';
    }
  }

  async function loadTerminals() {
    const tbody = document.querySelector('#terminals-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const res = await fetch(`${API_URL}/terminals`, { headers: getAuthHeaders() });
      const terminals = await res.json();
      tbody.innerHTML = '';
      if (terminals.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No hay terminales registradas</td></tr>';
        return;
      }

      renderTableWithPagination('terminals', terminals, '#terminals-table tbody', 'terminals-pagination', term => {
        const date = new Date(term.createdAt);
        const lastActiveDate = term.lastActive ? new Date(term.lastActive).toLocaleString() : 'Nunca';
        const tr = document.createElement('tr');

        const maskedToken = term.token.slice(0, 4) + '...' + term.token.slice(-4);

        tr.innerHTML = `
          <td><strong>${term.name}</strong></td>
          <td>
            <span class="badge ${term.isActive ? 'badge-entrada' : 'badge-salida'}">
              ${term.isActive ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td>${lastActiveDate}</td>
          <td>${date.toLocaleString()}</td>
          <td><code>${maskedToken}</code></td>
          <td>
            <button class="btn-icon" title="${term.isActive ? 'Desactivar' : 'Activar'}" onclick="toggleTerminalStatus('${term._id}', ${term.isActive})">
              <i class="fa-solid ${term.isActive ? 'fa-ban' : 'fa-circle-check'}"></i>
            </button>
            <button class="btn-icon delete" title="Eliminar/Revocar" onclick="deleteTerminal('${term._id}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        `;
        return tr;
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error al cargar terminales</td></tr>';
    }
  }

  window.toggleTerminalStatus = async function (id, currentStatus) {
    if (!confirm(`¿Estás seguro de ${currentStatus ? 'desactivar' : 'activar'} esta terminal?`)) return;
    try {
      const res = await fetch(`${API_URL}/terminals/${id}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !currentStatus })
      });
      if (res.ok) {
        loadTerminals();
        const data = await res.json();
        // Si desactivamos esta misma terminal, inhabilitamos inmediatamente el escáner local
        const myToken = localStorage.getItem('terminalToken');
        if (data.terminal.token === myToken && !data.terminal.isActive) {
          alert('Esta terminal física ha sido desactivada por el administrador.');
          localStorage.removeItem('terminalToken');
          localStorage.removeItem('terminalName');
          checkTerminalAuthorization();
        }
      } else {
        alert('Error al cambiar estado');
      }
    } catch (err) {
      alert('Error de conexión');
    }
  };

  window.deleteTerminal = async function (id) {
    if (!confirm('¿Estás seguro de revocar y eliminar por completo esta terminal? Todos sus accesos serán denegados de inmediato.')) return;
    try {
      const res = await fetch(`${API_URL}/terminals/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        loadTerminals();
      } else {
        alert('Error al eliminar terminal');
      }
    } catch (err) {
      alert('Error de conexión');
    }
  };
});
