/* ============================================================
   caretaker-shared.js — helpers used by every caretaker page
   Load this file FIRST on every caretaker page.
   ============================================================ */

/* Caretaker pages live inside /caretaker/ so go up one level */
var API_BASE = '../api/';

/* Session keys (same as customer session set at login) */
var CARETAKER_SESSION = {
    isLoggedIn : 'poolside_logged_in',
    fullName   : 'poolside_customer_name',
    email      : 'poolside_customer_email',
    role       : 'poolside_customer_role'
};


/* ---- One function that talks to the PHP backend ---- */
function callApi(file, data, callback) {
    fetch(API_BASE + file, {
        method      : 'POST',
        credentials : 'include',
        headers     : { 'Content-Type': 'application/json' },
        body        : JSON.stringify(data)
    })
    .then(function(r) { return r.json(); })
    .then(function(result) { callback(result); })
    .catch(function(err) {
        console.error('API error:', err);
        callback({ ok: false, error: 'Connection error. Is XAMPP running?' });
    });
}


/* ---- Basic helpers ---- */
function setElementText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}

function getFieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
}

function formatAsPesos(amount) {
    return '\u20B1' + Number(amount).toLocaleString();
}

/* Format "2026-11-02" → "November 2, 2026" */
function formatDate(dateStr) {
    if (!dateStr) return '--';
    var months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
    var d = new Date(dateStr + 'T00:00:00');
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
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
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', function() { toast.remove(); });
    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(closeBtn);
    container.appendChild(toast);
    setTimeout(function() {
        if (!toast.isConnected) return;
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s';
        setTimeout(function() { toast.remove(); }, 400);
    }, 3200);
}


/* ============================================================
   PAGE GUARD
   Checks the PHP session. If not logged in as caretaker,
   redirects back to the login page.
   ============================================================ */
function requireCaretakerLogin(callback) {
    if (!document.body.classList.contains('caretaker-page')) {
        callback(false);
        return;
    }

    callApi('auth.php', { action: 'get_profile' }, function(result) {
        /* Must be logged in and have role = 'caretaker' */
        if (!result.ok || result.role !== 'caretaker') {
            sessionStorage.removeItem(CARETAKER_SESSION.isLoggedIn);
            window.location.href = '../customer/customer-login.html';
            return;
        }

        /* Show the caretaker's name in the topbar */
        setElementText('caretakerNameLabel', result.fullName || result.firstName || 'Caretaker');

        callback(true);
    });
}


/* ============================================================
   LOGOUT + SIDEBAR TOGGLE
   Runs on every caretaker page after requireCaretakerLogin
   ============================================================ */
function setupCaretakerChrome() {
    /* Logout button */
    var logoutBtn = document.getElementById('caretakerLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            showActionConfirm('Are you sure you want to log out?', 'Log Out', function() {
                callApi('auth.php', { action: 'logout' }, function() {
                    /* Clear session storage */
                    Object.keys(CARETAKER_SESSION).forEach(function(k) {
                        sessionStorage.removeItem(CARETAKER_SESSION[k]);
                    });
                    window.location.href = '../customer/customer-login.html';
                });
            });
        });
    }

    /* Mobile sidebar toggle */
    var toggle  = document.getElementById('sidebarToggle');
    var sidebar = document.querySelector('.admin-sidebar');
    if (toggle && sidebar) {
        toggle.addEventListener('click', function() {
            sidebar.classList.toggle('open');
        });
    }
}


/* ============================================================
   RUN ON EVERY CARETAKER PAGE LOAD
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
    requireCaretakerLogin(function(ok) {
        if (!ok) return;
        setupCaretakerChrome();
    });
});
