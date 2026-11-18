/* ============================================================
   admin-shared.js  —  Helper functions used by every admin page
   ---------------------------------------------------------------
   Load this file FIRST on every admin page.
   ============================================================ */


/* ---- API base path ----
   Admin pages are inside /admin/ so we go up one level. */
var API_BASE = '../api/';


/* ---- Admin session keys ---- */
var ADMIN_SESSION = {
    name: 'poolside_admin_name',
    email: 'poolside_admin_email',
    role: 'poolside_admin_role'
};


/* ============================================================
   API HELPER
   ============================================================ */
function callApi(file, data, callback) {
    fetch(API_BASE + file, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(function(response) { return response.json(); })
        .then(function(result) { callback(result); })
        .catch(function(err) {
            console.error('API error:', err);
            callback({ ok: false, error: 'Connection error. Is XAMPP running?' });
        });
}


/* ============================================================
   BASIC HELPERS
   ============================================================ */
function getFieldValue(fieldId) {
    var field = document.getElementById(fieldId);
    return field ? field.value : '';
}

function setElementText(elementId, text) {
    var el = document.getElementById(elementId);
    if (el) el.textContent = text;
}

function formatAsPesos(amount) {
    return '\u20B1' + Number(amount).toLocaleString();
}

/* ============================================================
   ADMIN SESSION HELPERS
   ============================================================ */
function saveAdminSession(name, email, role) {
    sessionStorage.setItem(ADMIN_SESSION.name, name);
    sessionStorage.setItem(ADMIN_SESSION.email, email);
    if (role) sessionStorage.setItem(ADMIN_SESSION.role, role);
}

function clearAdminSession() {
    sessionStorage.removeItem(ADMIN_SESSION.name);
    sessionStorage.removeItem(ADMIN_SESSION.email);
    sessionStorage.removeItem(ADMIN_SESSION.role);
}


/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(message, type) {
    type = type || 'success';

    var container = document.getElementById('toast-wrap');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-wrap';
        document.body.appendChild(container);
    }

    var icons = { success: '✔', error: '✖', info: 'ℹ', warning: '⚠' };

    var toast = document.createElement('div');
    toast.className = 'toast-item ' + type;
    var icon = document.createElement('span');
    icon.textContent = icons[type] || '✔';
    var text = document.createElement('span');
    text.textContent = message;
    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'toast-close-btn';
    closeButton.setAttribute('aria-label', 'Dismiss notification');
    closeButton.textContent = '\u00D7';
    closeButton.addEventListener('click', function() { toast.remove(); });
    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(closeButton);
    container.appendChild(toast);

    setTimeout(function() {
        if (!toast.isConnected) return;
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s';
        setTimeout(function() { toast.remove(); }, 400);
    }, 3200);
}

/* Welcome Toast trigger on redirection */
function checkWelcomeToast() {
    var welcomeMsg = sessionStorage.getItem('show_welcome_toast');
    if (welcomeMsg) {
        showToast(welcomeMsg, 'success');
        sessionStorage.removeItem('show_welcome_toast');
    }
}

function openModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('open');
    if (!document.querySelector('.modal-overlay.open')) document.body.style.overflow = '';
}

function setupModals() {
    document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
        if (!overlay.hasAttribute('role')) overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        var modalBox = overlay.querySelector('.modal-box');
        if (modalBox && !modalBox.querySelector('.modal-close-btn')) {
            var closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'modal-close-btn modal-close-btn--corner';
            closeButton.setAttribute('data-close', '');
            closeButton.setAttribute('aria-label', 'Close');
            closeButton.textContent = '\u00D7';
            modalBox.appendChild(closeButton);
        }

        overlay.addEventListener('click', function(event) {
            if (event.target === overlay || event.target.closest('[data-close]')) {
                closeModal(overlay.id);
            }
        });
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.open').forEach(function(modal) {
                closeModal(modal.id);
            });
        }
    });
}


/* ============================================================
   PAGE GUARD + ROLE-BASED ACCESS CONTROL
   ============================================================ */
function requireAdminLogin(callback) {
    if (!document.body.classList.contains('admin-page')) {
        callback(false);
        return;
    }

    callApi('auth.php', { action: 'get_profile' }, function(result) {
        if (!result.ok) {
            clearAdminSession();
            window.location.href = '../customer/customer-login.html';
            return;
        }

        var role = (result.role || '').toLowerCase();
        if (role === 'caretaker') {
            window.location.href = '../caretaker/dashboard.html';
            return;
        }
        if (role !== 'admin' && role !== 'administrator') {
            clearAdminSession();
            window.location.href = '../customer/customer-login.html';
            return;
        }

        saveAdminSession(result.fullName, result.email, role);
        setElementText('adminPanelLabel', 'Admin Panel');

        var nameLabel = document.getElementById('adminNameLabel');
        if (nameLabel) {
            var displayName = result.firstName || result.fullName || 'User';
            nameLabel.textContent = displayName;
        }

        callback(true);
    });
}

function setupAdminChrome() {
    if (!document.body.classList.contains('admin-page')) return;

    var currentPath = window.location.pathname.toLowerCase();
    var navLinks = document.querySelectorAll('.admin-nav a');
    navLinks.forEach(function(link) {
        var href = (link.getAttribute('href') || '').toLowerCase();
        link.classList.toggle('active', href && currentPath.endsWith(href));
    });

    var adminName = sessionStorage.getItem(ADMIN_SESSION.name) || 'Admin';
    setElementText('adminNameLabel', adminName);

    var logoutBtn = document.getElementById('adminLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            showActionConfirm('Are you sure you want to log out?', 'Log Out', function() {
                callApi('auth.php', { action: 'logout' }, function() {
                    clearAdminSession();
                    window.location.href = '../customer/customer-login.html';
                });
            });
        });
    }

    var sidebarToggle = document.getElementById('sidebarToggle');
    var sidebar = document.querySelector('.admin-sidebar');
    var sidebarBackdrop = document.querySelector('.admin-sidebar-backdrop');

    function setSidebarOpen(isOpen) {
        if (!sidebar) return;
        sidebar.classList.toggle('open', isOpen);
        if (sidebarBackdrop) sidebarBackdrop.classList.toggle('open', isOpen);
        if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            setSidebarOpen(!sidebar.classList.contains('open'));
        });

        if (!sidebarBackdrop) {
            sidebarBackdrop = document.createElement('div');
            sidebarBackdrop.className = 'admin-sidebar-backdrop';
            sidebarBackdrop.setAttribute('aria-hidden', 'true');
            document.body.appendChild(sidebarBackdrop);
        }

        sidebarBackdrop.addEventListener('click', function() {
            setSidebarOpen(false);
        });

        sidebar.querySelectorAll('.admin-nav a').forEach(function(link) {
            link.addEventListener('click', function() {
                if (window.innerWidth <= 900) setSidebarOpen(false);
            });
        });

        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') setSidebarOpen(false);
        });

        window.addEventListener('resize', function() {
            if (window.innerWidth > 900) setSidebarOpen(false);
        });
    }
}


/* ============================================================
   RUN ON EVERY ADMIN PAGE LOAD
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
    requireAdminLogin(function(authenticated) {
        if (!authenticated) return;
        checkWelcomeToast();
        setupAdminChrome();
        setupModals();
    });
});