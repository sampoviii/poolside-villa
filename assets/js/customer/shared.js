/* ============================================================
   shared.js  —  Helper functions used by every customer page
   ---------------------------------------------------------------
   Load this file FIRST on every customer page.
   All other customer JS files depend on the functions here.

   KEY CHANGE: Data is now stored in MySQL via PHP API.
   We use fetch() to call the API instead of localStorage.
   The API folder is at /api/ relative to the site root.
   ============================================================ */


/* ---- API base path ----
   Auto-detect if we're on the root page or in customer/ folder. */
var API_BASE = (window.location.pathname.indexOf('/customer/') !== -1) ? '../api/' : 'api/';


/* ---- Session storage keys ---- */
var SESSION = {
    isLoggedIn : 'poolside_logged_in',
    fullName   : 'poolside_customer_name',
    email      : 'poolside_customer_email',
    role       : 'poolside_customer_role'
};


/* ============================================================
   API HELPER
   ============================================================ */
function callApi(file, data, callback) {
    fetch(API_BASE + file, {
        method      : 'POST',
        credentials : 'include',          /* send the session cookie */
        headers     : { 'Content-Type': 'application/json' },
        body        : JSON.stringify(data)
    })
    .then(function(response) { return response.json(); })
    .then(function(result)   { callback(result); })
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
   SESSION HELPERS
   ============================================================ */

function isCustomerLoggedIn() {
    return sessionStorage.getItem(SESSION.isLoggedIn) === 'yes';
}

function getLoggedInCustomerEmail() {
    return (sessionStorage.getItem(SESSION.email) || '').toLowerCase();
}

function getLoggedInCustomerRole() {
    return sessionStorage.getItem(SESSION.role) || 'customer';
}

function saveSession(fullName, email, role) {
    sessionStorage.setItem(SESSION.isLoggedIn, 'yes');
    sessionStorage.setItem(SESSION.fullName,   fullName);
    sessionStorage.setItem(SESSION.email,      email);
    sessionStorage.setItem(SESSION.role,       role);
}

function clearSession() {
    sessionStorage.removeItem(SESSION.isLoggedIn);
    sessionStorage.removeItem(SESSION.fullName);
    sessionStorage.removeItem(SESSION.email);
    sessionStorage.removeItem(SESSION.role);
}


/* ============================================================
   RESORT SETTINGS
   ============================================================ */
function getResortSettings(callback) {
    callApi('settings.php', { action: 'get' }, function(result) {
        if (result.ok) {
            callback({ gcashNumber: result.gcashNumber, gcashQr: result.gcashQr });
        } else {
            callback({ gcashNumber: '0917 XXX XXXX', gcashQr: '' });
        }
    });
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
        toast.style.opacity    = '0';
        toast.style.transition = 'opacity 0.4s';
        setTimeout(function() { toast.remove(); }, 400);
    }, 3200);
}

function checkWelcomeToast() {
    var welcomeMsg = sessionStorage.getItem('show_welcome_toast');
    if (welcomeMsg) {
        showToast(welcomeMsg, 'success');
        sessionStorage.removeItem('show_welcome_toast');
    }
}


/* ============================================================
   MODAL HELPERS
   ============================================================ */
function openModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('open');
        if (!document.querySelector('.modal-overlay.open')) document.body.style.overflow = '';
    }
}

function showConfirm(message, onConfirm, actionLabel, actionClass) {
    showActionConfirm(message, actionLabel || 'Delete', onConfirm, actionClass || 'btn-red');
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
    });

    document.addEventListener('click', function(e) {
        var closeButton = e.target.closest('.modal-overlay [data-close]');
        if (closeButton) {
            closeModal(closeButton.closest('.modal-overlay').id);
            return;
        }

        var overlay = e.target.closest('.modal-overlay');
        if (overlay && e.target === overlay) closeModal(overlay.id);
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.open').forEach(function(m) {
                closeModal(m.id);
            });
        }
    });
}


/* ============================================================
   BOOK NOW BUTTONS
   ============================================================ */
function setupBookNowButtons() {
    document.querySelectorAll('[data-book-now]').forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = isCustomerLoggedIn()
                ? 'customer/booking.html'
                : 'customer/customer-login.html';
        });
    });
}


/* ============================================================
   LOGIN GUARD
   ============================================================ */
function requireCustomerLogin() {
    if (!document.getElementById('accountPage')) return;
    if (!isCustomerLoggedIn()) {
        window.location.href = 'customer-login.html';
    }
}


/* ============================================================
   PROFILE MENU + DROPDOWN
   ============================================================ */
function setupProfileMenu() {
    var profileBtn = document.getElementById('profileButton');
    if (!profileBtn) return;

    var profileMenu  = document.getElementById('profileMenu');
    var logoutBtn    = document.getElementById('logoutButton');
    var settingsLink = document.getElementById('settingsMenuLink');

    var name    = sessionStorage.getItem(SESSION.fullName) || 'Guest';
    var email   = sessionStorage.getItem(SESSION.email)    || '';
    var initial = name.charAt(0).toUpperCase();

    setElementText('profileButtonName',    name);
    setElementText('profileButtonInitial', initial);
    setElementText('profileMenuInitial',   initial);
    setElementText('profileMenuName',      name);
    setElementText('profileMenuEmail',     email);

    profileBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        profileMenu.classList.toggle('open');
    });

    document.addEventListener('click', function(e) {
        if (profileMenu && !profileMenu.contains(e.target) && !profileBtn.contains(e.target)) {
            profileMenu.classList.remove('open');
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            showActionConfirm('Are you sure you want to log out?', 'Log Out', function() {
                callApi('auth.php', { action: 'logout' }, function() {
                    clearSession();
                    window.location.href = '../index.html';
                });
            });
        });
    }

    if (settingsLink) {
        settingsLink.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'settings.html';
        });
    }
}


/* ============================================================
   NOTIFICATION BELL
   ============================================================ */
function setupNotificationBell() {
    var bell = document.getElementById('notifBell');
    if (!bell) { return; }

    var badge = document.getElementById('notifDot');

    callApi('notifications.php', { action: 'unread_count' }, function(result) {
        var count = result.ok ? result.count : 0;
        if (badge) {
            if (count > 0) {
                badge.textContent   = count > 9 ? '9+' : String(count);
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    });

    bell.addEventListener('click', function() {
        window.location.href = 'notification.html';
    });
}


/* ============================================================
   MOBILE HAMBURGER MENU
   ============================================================ */
function setupMobileMenu() {
    var hamburger = document.getElementById('hamburgerBtn');
    var navLinks  = document.getElementById('navLinks');
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', function () {
        var isOpen = navLinks.classList.toggle('open');
        hamburger.classList.toggle('open', isOpen);
        hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    navLinks.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
            navLinks.classList.remove('open');
            hamburger.classList.remove('open');
            hamburger.setAttribute('aria-expanded', 'false');
        });
    });

    document.addEventListener('click', function (e) {
        if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
            navLinks.classList.remove('open');
            hamburger.classList.remove('open');
            hamburger.setAttribute('aria-expanded', 'false');
        }
    });
}


/* ============================================================
   RUN ON EVERY PAGE LOAD
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
    checkWelcomeToast();
    requireCustomerLogin();
    setupModals();
    setupBookNowButtons();
    setupProfileMenu();
    setupNotificationBell();
    setupMobileMenu();
    showReviewNavIfEligible();
});

function showReviewNavIfEligible() {
    if (!isCustomerLoggedIn()) return;

    var link = document.getElementById('reviewNavLink');
    if (!link) return;

    callApi('reviews.php', { action: 'can_review' }, function(result) {
        if (!result.ok) return;

        var show = result.canReview || result.reason === 'already_reviewed';
        if (show) {
            link.style.display = '';
        }
    });
}