/* ============================================================
   dashboard.js — Admin Dashboard page
   ============================================================ */

var MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Draws a dynamic SVG line graph inside the target container.
 */
function drawLineChart(containerId, values, labels) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var highest = 5; // Default minimum Y-axis ceiling
    for (var i = 0; i < values.length; i++) {
        if (values[i] > highest) {
            highest = values[i];
        }
    }

    var width = 1200;
    var height = 200;
    var paddingX = 50;
    var paddingY = 35;
    var usableWidth = width - (paddingX * 2);
    var usableHeight = height - (paddingY * 2);

    // Compute (x, y) coordinates for all 12 month data points
    var points = [];
    for (var k = 0; k < values.length; k++) {
        var x = paddingX + (k * (usableWidth / 11));
        var y = (height - paddingY) - ((values[k] / highest) * usableHeight);
        points.push({ x: x, y: y, val: values[k], label: labels[k] });
    }

    var polylineString = points.map(function(p) { return p.x + ',' + p.y; }).join(' ');
    var polygonString = points[0].x + ',' + (height - paddingY) + ' ' + polylineString + ' ' + points[11].x + ',' + (height - paddingY);

    var svgHtml = '<svg class="line-chart-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" style="width:100%; height:100%; overflow:visible;">' +
        '<defs>' +
        '<linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#2d6a4f" stop-opacity="0.30"/>' +
        '<stop offset="100%" stop-color="#2d6a4f" stop-opacity="0.0"/>' +
        '</linearGradient>' +
        '</defs>' +

        '<!-- Horizontal Grid Lines -->' +
        '<line x1="' + paddingX + '" y1="' + paddingY + '" x2="' + (width - paddingX) + '" y2="' + paddingY + '" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4"/>' +
        '<line x1="' + paddingX + '" y1="' + (height / 2) + '" x2="' + (width - paddingX) + '" y2="' + (height / 2) + '" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4"/>' +
        '<line x1="' + paddingX + '" y1="' + (height - paddingY) + '" x2="' + (width - paddingX) + '" y2="' + (height - paddingY) + '" stroke="#cbd5e1" stroke-width="1.5"/>' +

        '<!-- Area Gradient Fill -->' +
        '<polygon points="' + polygonString + '" fill="url(#chartGradient)"/>' +

        '<!-- Main Line Graph -->' +
        '<polyline points="' + polylineString + '" fill="none" stroke="#2d6a4f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';

    // Append data nodes, hover dots, values, and month labels
    for (var pIdx = 0; pIdx < points.length; pIdx++) {
        var pt = points[pIdx];
        var isPeak = pt.val > 0 && pt.val === highest;
        var circleColor = isPeak ? '#1e5138' : '#2d6a4f';
        var circleRadius = isPeak ? 6 : 4;
        var fontWeight = isPeak ? '800' : '600';
        var textColor = isPeak ? '#1e5138' : '#4a5568';

        svgHtml += '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="' + circleRadius + '" fill="' + circleColor + '" class="chart-point" style="transition:r 0.2s ease; cursor:pointer;"/>' +
            '<text x="' + pt.x + '" y="' + (pt.y - 10) + '" text-anchor="middle" font-size="12" font-weight="' + fontWeight + '" fill="' + textColor + '">' + pt.val + '</text>' +
            '<text x="' + pt.x + '" y="' + (height - 10) + '" text-anchor="middle" font-size="11" font-weight="' + fontWeight + '" fill="#718096">' + pt.label + '</text>';
    }

    svgHtml += '</svg>';
    container.innerHTML = svgHtml;
}

document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('kpiTotal')) return;

    var LPG_PRICE = 500;
    var cachedApprovedBookings = [];
    var selectedCompleteBooking = null;

    var fmt = function(n) {
        return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    };

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getBookingBreakdown(booking) {
        var rawDown = parseFloat(booking.amount || 0);
        var rawTotal = parseFloat(booking.total || 0);
        var lpgStr = (booking.lpg || '').toString().toLowerCase();
        var hasLpg = lpgStr.indexOf('yes') === 0 || lpgStr.indexOf('500') !== -1;
        var lpgFee = hasLpg ? LPG_PRICE : 0;

        /* Normalize package down payment (50% package only, excluding LPG) */
        var packageTotal = rawTotal > 0 ? Math.max(0, rawTotal - lpgFee) : (rawDown * 2);
        var packageDown = rawTotal > 0 ? Math.ceil(packageTotal * 0.5) : rawDown;
        var pkgBalance = Math.max(0, packageTotal - packageDown);
        var resortDue = pkgBalance + lpgFee;
        var walkinPaid = parseFloat(booking.walkin_payment || 0);
        var isCompleted = !isNaN(walkinPaid) && walkinPaid > 0;

        return {
            packageDown: packageDown,
            pkgBalance: pkgBalance,
            hasLpg: hasLpg,
            lpgFee: lpgFee,
            resortDue: resortDue,
            fullTotal: packageDown + resortDue,
            walkinPaid: isCompleted ? walkinPaid : 0,
            isCompleted: isCompleted
        };
    }

    function renderDownpaymentsTable() {
        var tbody = document.getElementById('downpaymentsModalBody');
        if (!tbody) return;

        if (cachedApprovedBookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--gray-400);">No approved down payments recorded yet.</td></tr>';
            return;
        }

        var html = '';
        for (var i = 0; i < cachedApprovedBookings.length; i++) {
            var b = cachedApprovedBookings[i];
            var bd = getBookingBreakdown(b);
            var guestName = ((b.first_name || '') + ' ' + (b.last_name || '')).trim() || b.guest_name || '--';
            var addonText = bd.hasLpg ?
                '<span style="color:#b45309; font-weight:600;">LPG (+₱500)</span>' :
                '<span style="color:var(--gray-500);">' + escapeHtml(b.lpg || 'None') + '</span>';

            var actionHtml = bd.isCompleted ?
                '<span class="badge-completed-pill"><span class="material-icons" style="font-size:14px;">check_circle</span> Completed</span>' :
                '<button type="button" class="btn btn-sm btn-sky js-complete-dp-btn" data-ref="' + escapeHtml(b.id) + '" style="border-radius:16px; font-weight:600;">Completed</button>';

            html += '<tr>' +
                '<td><strong>' + escapeHtml(b.id) + '</strong></td>' +
                '<td>' + escapeHtml(guestName) + '</td>' +
                '<td>' + escapeHtml(b.visit_date || '--') + '</td>' +
                '<td><strong>' + fmt(bd.packageDown) + '</strong></td>' +
                '<td>' + addonText + '</td>' +
                '<td>' + fmt(bd.resortDue) + '</td>' +
                '<td style="text-align:right;">' + actionHtml + '</td>' +
                '</tr>';
        }
        tbody.innerHTML = html;
    }

    function updateCompleteSummaryPreview() {
        if (!selectedCompleteBooking) return;
        var bd = getBookingBreakdown(selectedCompleteBooking);
        var removeCheckbox = document.getElementById('cpRemoveLpgCheckbox');
        var isChecked = removeCheckbox && removeCheckbox.checked;

        var activeLpgFee = 0;
        var lpgStatusLabel = '₱0 (None)';

        if (bd.hasLpg) {
            if (isChecked) {
                activeLpgFee = 0;
                lpgStatusLabel = '₱0 (Removed)';
            } else {
                activeLpgFee = LPG_PRICE;
                lpgStatusLabel = fmt(LPG_PRICE);
            }
        } else {
            activeLpgFee = 0;
            lpgStatusLabel = isChecked ? '₱0 (No add-on to remove)' : '₱0 (None availed)';
        }

        var finalTotal = bd.packageDown + bd.pkgBalance + activeLpgFee;

        setElementText('cpDownpayment', fmt(bd.packageDown));
        setElementText('cpPkgBalance', fmt(bd.pkgBalance));
        setElementText('cpLpgFee', lpgStatusLabel);
        setElementText('cpFinalTotal', fmt(finalTotal));
    }

    function openCompleteModal(booking) {
        selectedCompleteBooking = booking;
        var bd = getBookingBreakdown(booking);
        var guestName = ((booking.first_name || '') + ' ' + (booking.last_name || '')).trim() || booking.guest_name || '--';

        setElementText('cpGuestName', guestName);
        setElementText('cpRefCode', booking.id);

        var cancelWrap = document.getElementById('cpCancelLpgWrap');
        var removeCheckbox = document.getElementById('cpRemoveLpgCheckbox');
        var toggleLabel = document.getElementById('cpLpgToggleLabel');

        if (removeCheckbox) {
            removeCheckbox.checked = false;
            removeCheckbox.disabled = !bd.hasLpg;
        }
        if (cancelWrap) {
            cancelWrap.style.display = 'block';
            cancelWrap.style.opacity = bd.hasLpg ? '1' : '0.65';
        }
        if (toggleLabel) {
            toggleLabel.innerHTML = bd.hasLpg ?
                '<strong>Remove LPG Add-on (-₱500)</strong> — Check this if the customer cancelled their LPG add-on face-to-face at the resort.' :
                '<strong>Remove LPG Add-on</strong> — Customer did not select any LPG add-on for this booking.';
        }

        updateCompleteSummaryPreview();

        var modal = document.getElementById('completePaymentModal');
        if (modal) modal.classList.add('show');
    }

    function closeCompleteModal() {
        selectedCompleteBooking = null;
        var modal = document.getElementById('completePaymentModal');
        if (modal) modal.classList.remove('show');
    }

    function loadDashboardData() {
        callApi('reservations.php', { action: 'all_list' }, function(resResult) {
            var allBookings = resResult.ok ? resResult.bookings : [];

            var pendingCount = 0;
            var approvedCount = 0;
            var totalDownpayments = 0; /* 50% package only, no LPG */
            var totalEarnings = 0; /* downpayment + walk-in & add-ons when completed */
            cachedApprovedBookings = [];

            for (var i = 0; i < allBookings.length; i++) {
                var booking = allBookings[i];
                if (booking.status === 'Pending') {
                    pendingCount++;
                }

                if (booking.status === 'Approved') {
                    approvedCount++;
                    cachedApprovedBookings.push(booking);

                    var bd = getBookingBreakdown(booking);

                    /* Total Downpayments = 50% package portion only (no LPG add-on) */
                    if (!isNaN(bd.packageDown) && bd.packageDown > 0) {
                        totalDownpayments += bd.packageDown;
                    }

                    /* Total Earned = full amount (including add-ons if not removed) only when completed */
                    if (bd.isCompleted) {
                        var recordedTotal = parseFloat(booking.total || 0);
                        totalEarnings += recordedTotal > 0 ? recordedTotal : (bd.packageDown + bd.walkinPaid);
                    }
                }
            }

            setElementText('kpiTotal', approvedCount);
            setElementText('kpiPending', pendingCount);
            setElementText('kpiApproved', allBookings.length);

            setElementText('kpiDownpayments', fmt(totalDownpayments));
            setElementText('kpiEarnings', fmt(totalEarnings));

            renderDownpaymentsTable();

            /* ---- Line chart: accepted/approved reservations per month ---- */
            var perMonth = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (var m = 0; m < allBookings.length; m++) {
                if (!allBookings[m].visit_date) continue;

                // Only count approved bookings in the monthly line graph trend
                if (allBookings[m].status === 'Approved') {
                    var d = new Date(allBookings[m].visit_date + 'T00:00:00');
                    if (!isNaN(d.getTime())) {
                        perMonth[d.getMonth()]++;
                    }
                }
            }
            drawLineChart('monthlyChart', perMonth, MONTH_LABELS);

            /* ---- Pending bookings table ---- */
            var tableBody = document.getElementById('pendingBody');
            if (tableBody) {
                var pending = [];
                for (var p = 0; p < allBookings.length; p++) {
                    if (allBookings[p].status === 'Pending') {
                        pending.push(allBookings[p]);
                    }
                }

                if (pending.length === 0) {
                    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--gray-400);">No pending reservations. You are all caught up!</td></tr>';
                } else {
                    var html = '';
                    for (var idx = 0; idx < pending.length; idx++) {
                        html += '<tr>' +
                            '<td>' + pending[idx].id + '</td>' +
                            '<td>' + (pending[idx].first_name || '') + ' ' + (pending[idx].last_name || '') + '</td>' +
                            '<td>' + (pending[idx].visit_date || '--') + '</td>' +
                            '<td>' + (pending[idx].room || '--') + '</td>' +
                            '<td>' + (pending[idx].amount || '--') + '</td>' +
                            '<td>' + (pending[idx].booked_at || '--') + '</td>' +
                            '</tr>';
                    }
                    tableBody.innerHTML = html;
                }
            }
        });
    }

    /* ---- Wire Up Downpayments Modal & Complete Payment Modal ---- */
    var dpCard = document.getElementById('openDownpaymentsModalCard');
    var dpModal = document.getElementById('downpaymentsListModal');
    var closeDpBtn = document.getElementById('closeDownpaymentsModalBtn');
    var ackDpBtn = document.getElementById('ackDownpaymentsModalBtn');

    function openDpModal() {
        renderDownpaymentsTable();
        if (dpModal) dpModal.classList.add('show');
    }

    function closeDpModal() {
        if (dpModal) dpModal.classList.remove('show');
    }

    if (dpCard) {
        dpCard.addEventListener('click', openDpModal);
        dpCard.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDpModal();
            }
        });
    }
    if (closeDpBtn) closeDpBtn.addEventListener('click', closeDpModal);
    if (ackDpBtn) ackDpBtn.addEventListener('click', closeDpModal);
    if (dpModal) {
        dpModal.addEventListener('click', function(e) {
            if (e.target === dpModal) closeDpModal();
        });
    }

    var dpBody = document.getElementById('downpaymentsModalBody');
    if (dpBody) {
        dpBody.addEventListener('click', function(e) {
            var btn = e.target.closest('.js-complete-dp-btn');
            if (!btn) return;
            var ref = btn.getAttribute('data-ref');
            for (var i = 0; i < cachedApprovedBookings.length; i++) {
                if (cachedApprovedBookings[i].id === ref) {
                    openCompleteModal(cachedApprovedBookings[i]);
                    break;
                }
            }
        });
    }

    var removeLpgCheckbox = document.getElementById('cpRemoveLpgCheckbox');
    if (removeLpgCheckbox) {
        removeLpgCheckbox.addEventListener('change', updateCompleteSummaryPreview);
    }

    var closeCompleteBtn = document.getElementById('closeCompletePayModalBtn');
    var cancelCompleteBtn = document.getElementById('cancelCompletePayBtn');
    var confirmCompleteBtn = document.getElementById('confirmCompletePayBtn');
    var completeModal = document.getElementById('completePaymentModal');

    if (closeCompleteBtn) closeCompleteBtn.addEventListener('click', closeCompleteModal);
    if (cancelCompleteBtn) cancelCompleteBtn.addEventListener('click', closeCompleteModal);
    if (completeModal) {
        completeModal.addEventListener('click', function(e) {
            if (e.target === completeModal) closeCompleteModal();
        });
    }

    if (confirmCompleteBtn) {
        confirmCompleteBtn.addEventListener('click', function() {
            if (!selectedCompleteBooking) return;
            var removeLpg = !!(removeLpgCheckbox && removeLpgCheckbox.checked);
            var bookingId = selectedCompleteBooking.id;

            confirmCompleteBtn.disabled = true;
            confirmCompleteBtn.textContent = 'Saving...';

            callApi('reservations.php', {
                action: 'save_walkin_payment',
                bookingId: bookingId,
                removeLpg: removeLpg
            }, function(result) {
                confirmCompleteBtn.disabled = false;
                confirmCompleteBtn.textContent = 'Confirm Completed';

                if (!result.ok) {
                    if (typeof showToast === 'function') {
                        showToast(result.error || 'Could not complete payment.', 'error');
                    } else {
                        alert(result.error || 'Could not complete payment.');
                    }
                    return;
                }

                if (typeof showToast === 'function') {
                    showToast(result.message || 'Payment completed!', 'success');
                }
                closeCompleteModal();
                loadDashboardData();
            });
        });
    }

    loadDashboardData();
});