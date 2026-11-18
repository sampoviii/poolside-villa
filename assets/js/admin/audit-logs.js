/* ============================================================
   audit-logs.js — Admin Audit Logs Page Script
   ============================================================ */

var allAuditLogsData = [];
var auditSearchQuery = '';
var auditDateFrom = '';
var auditDateTo = '';

function escapeAuditHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatLogDate(dateStr) {
    if (!dateStr) return '--';
    var normalized = String(dateStr).replace(' ', 'T');
    var d = new Date(normalized);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString();
}

function extractLogYmd(dateStr) {
    if (!dateStr) return '';
    var match = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}

function parseBrowserAgent(ua) {
    if (!ua) return 'Standard Browser';
    if (ua.indexOf('Chrome') !== -1 && ua.indexOf('Edge') === -1) return 'Google Chrome';
    if (ua.indexOf('Firefox') !== -1) return 'Mozilla Firefox';
    if (ua.indexOf('Safari') !== -1 && ua.indexOf('Chrome') === -1) return 'Apple Safari';
    if (ua.indexOf('Edge') !== -1) return 'Microsoft Edge';
    return 'Web Browser';
}

function applyAuditFiltersAndRender() {
    var tableBody = document.getElementById('auditTableBody');
    if (!tableBody) return;

    var filtered = allAuditLogsData.filter(function(item) {
        /* 1. Date Range Filter (YYYY-MM-DD) */
        var logDate = extractLogYmd(item.created_at);
        if (auditDateFrom && (!logDate || logDate < auditDateFrom)) {
            return false;
        }
        if (auditDateTo && (!logDate || logDate > auditDateTo)) {
            return false;
        }

        /* 2. Keyword Search Filter */
        if (auditSearchQuery) {
            var haystack = [
                item.user_name,
                item.user_email,
                item.role,
                item.action_type,
                item.details,
                parseBrowserAgent(item.user_agent)
            ].join(' ').toLowerCase();

            if (haystack.indexOf(auditSearchQuery) === -1) {
                return false;
            }
        }

        return true;
    });

    var countPill = document.getElementById('auditResultCount');
    if (countPill) {
        countPill.textContent = 'Showing ' + filtered.length + ' of ' + allAuditLogsData.length;
    }

    if (allAuditLogsData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--gray-400);">No audit activity recorded yet. Try logging out and logging back in!</td></tr>';
        return;
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--gray-400);">No matching audit records found for your filter.</td></tr>';
        return;
    }

    var html = '';
    filtered.forEach(function(item) {
        var normalizedRole = (item.role || '').toLowerCase();
        var roleBadgeClass = (normalizedRole === 'admin' || normalizedRole === 'administrator') ?
            'audit-role-badge audit-role-admin' :
            'audit-role-badge audit-role-other';
        html += '<tr style="border-bottom: 1px solid #f0f0f0;">' +
            '<td style="padding:12px 16px; font-size:12px; color:#555; white-space:nowrap;">' + escapeAuditHtml(formatLogDate(item.created_at)) + '</td>' +
            '<td style="padding:12px 16px;"><b>' + escapeAuditHtml(item.user_name || 'User') + '</b><br><span style="font-size:11px; color:#777;">' + escapeAuditHtml(item.user_email) + '</span></td>' +
            '<td style="padding:12px 16px;"><span class="' + roleBadgeClass + '">' + escapeAuditHtml(item.role) + '</span></td>' +
            '<td style="padding:12px 16px; font-weight:600; color:#333; font-size:13px;">' + escapeAuditHtml(item.action_type) + '</td>' +
            '<td style="padding:12px 16px; color:#444; font-size:13px;">' + escapeAuditHtml(item.details) + '</td>' +
            '<td style="padding:12px 16px; font-size:12px; color:#555;" title="' + escapeAuditHtml(item.user_agent || '') + '">' + escapeAuditHtml(parseBrowserAgent(item.user_agent)) + '</td>' +
            '</tr>';
    });

    tableBody.innerHTML = html;
}

function renderAuditLogs() {
    var tableBody = document.getElementById('auditTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--gray-400);">Loading audit logs...</td></tr>';

    callApi('audit.php', { action: 'list_logs' }, function(result) {
        if (!result.ok) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#c94a4a;"><b>Error:</b> ' + escapeAuditHtml(result.error || 'Could not load audit logs.') + '</td></tr>';
            return;
        }

        allAuditLogsData = result.logs || [];
        applyAuditFiltersAndRender();
    });
}

document.addEventListener('DOMContentLoaded', function() {
    renderAuditLogs();

    var refreshBtn = document.getElementById('refreshLogsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', renderAuditLogs);
    }

    var searchInput = document.getElementById('auditSearchInput');
    var dateFromEl = document.getElementById('auditDateFrom');
    var dateToEl = document.getElementById('auditDateTo');
    var clearBtn = document.getElementById('auditClearFiltersBtn');

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            auditSearchQuery = this.value.trim().toLowerCase();
            applyAuditFiltersAndRender();
        });
    }

    if (dateFromEl) {
        dateFromEl.addEventListener('change', function() {
            auditDateFrom = this.value;
            applyAuditFiltersAndRender();
        });
    }

    if (dateToEl) {
        dateToEl.addEventListener('change', function() {
            auditDateTo = this.value;
            applyAuditFiltersAndRender();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            auditSearchQuery = '';
            auditDateFrom = '';
            auditDateTo = '';
            if (searchInput) searchInput.value = '';
            if (dateFromEl) dateFromEl.value = '';
            if (dateToEl) dateToEl.value = '';
            applyAuditFiltersAndRender();
        });
    }
});