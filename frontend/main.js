import { initScanner } from './scanner.js';

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

  const checkLogin = () => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      navUsers.style.display = 'flex';
      navReports.style.display = 'flex';
      navAdmins.style.display = 'flex';
      btnLoginTrigger.style.display = 'none';
      btnLogout.style.display = 'flex';
    } else {
      navUsers.style.display = 'none';
      navReports.style.display = 'none';
      navAdmins.style.display = 'none';
      btnLoginTrigger.style.display = 'flex';
      btnLogout.style.display = 'none';
      // Force to scanner view
      const scannerTab = document.querySelector('[data-view="scanner-view"]');
      if (scannerTab) scannerTab.click();
    }
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

  if(menuToggle) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const targetViewId = link.getAttribute('data-view');
      views.forEach(view => {
        view.classList.remove('active-view');
        if (view.id === targetViewId) view.classList.add('active-view');
      });
      if (targetViewId === 'users-view') loadUsers();
      else if (targetViewId === 'reports-view') loadReports();
      else if (targetViewId === 'admins-view') loadAdmins();
      
      // Close sidebar on mobile
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
      }
    });
  });

  initScanner();

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
    uploadArea.innerHTML = `<i class="fa-solid fa-cloud-arrow-up fa-3x"></i><h3>Subir Archivo Excel</h3><p>Soporta columnas: Nombre, Área, Puesto, Tipo</p><input type="file" id="excel-file" accept=".xlsx, .xls" style="display: none;">`;
    document.getElementById('excel-file').addEventListener('change', e => {
      if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
    });
  }

  // Users CRUD
  window.editUser = function(userStr) {
    const user = JSON.parse(decodeURIComponent(userStr));
    document.getElementById('modal-title').textContent = 'Editar Empleado';
    document.getElementById('employee-id').value = user._id;
    document.getElementById('employee-name').value = user.name;
    document.getElementById('employee-area').value = user.area || '';
    document.getElementById('employee-position').value = user.position || '';
    document.getElementById('employee-type').value = user.employeeType || 'Base';
    openModal();
  };

  window.toggleStatus = async function(id, currentStatus) {
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

  window.viewQR = function(userStr) {
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

      users.forEach(user => {
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
        tbody.appendChild(tr);
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
  const closeModal = () => { modal.classList.remove('active'); form.reset(); document.getElementById('employee-id').value = ''; };

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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('employee-id').value;
    const body = {
      name: document.getElementById('employee-name').value,
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

  async function loadReports() {
    const tbody = document.querySelector('#reports-table tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const res = await fetch(`${API_URL}/attendance`, { headers: getAuthHeaders() });
      const records = await res.json();
      tbody.innerHTML = '';
      if (records.length === 0) return tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay registros</td></tr>';
      records.forEach(record => {
        const date = new Date(record.timestamp);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${record.user?.name || 'Desconocido'}</strong><br><small style="color: var(--text-muted)">${record.user?.area || '-'} / ${record.user?.position || '-'}</small></td>
          <td>${record.user?.identifier || '-'}</td>
          <td><span class="badge ${record.type === 'Entrada' ? 'badge-entrada' : 'badge-salida'}">${record.type}</span></td>
          <td>${date.toLocaleString()}</td>
          <td>${record.photo ? `<img src="${record.photo}" class="photo-img"/>` : '-'}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) { tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger);">Error</td></tr>'; }
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
    if(!confirm('¿Eliminar administrador?')) return;
    try {
      const res = await fetch(`${API_URL}/auth/admins/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      const data = await res.json();
      if(res.ok) loadAdmins(); else alert(data.message);
    } catch(e) { alert('Error de conexión'); }
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
      if(res.ok) {
        adminModal.classList.remove('active'); adminForm.reset(); loadAdmins();
      } else alert(data.message);
    } catch(err) { alert('Error'); }
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
      if(res.ok) {
        passwordModal.classList.remove('active'); passwordForm.reset(); alert('Contraseña actualizada');
      } else alert(data.message);
    } catch(err) { alert('Error'); }
  });

  async function loadAdmins() {
    const tbody = document.querySelector('#admins-table tbody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const res = await fetch(`${API_URL}/auth/admins`, { headers: getAuthHeaders() });
      const admins = await res.json();
      tbody.innerHTML = '';
      if(admins.length === 0) return tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No hay administradores</td></tr>';
      
      admins.forEach(admin => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${admin.username}</strong></td>
          <td>${admin._id}</td>
          <td>
            <button class="btn-icon" title="Cambiar Contraseña" onclick="changeAdminPassword('${admin._id}')"><i class="fa-solid fa-key"></i></button>
            <button class="btn-icon delete" title="Eliminar" onclick="deleteAdmin('${admin._id}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) { tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--danger);">Error</td></tr>'; }
  }
});
