/* Caretaker dashboard: today's guest schedule and pending reservations. */

function pad2(value) {
    return String(value).padStart(2, '0');
}

function localDateString(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function escapeDashboardHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(character) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[character];
    });
}

function parseReservationTimes(booking) {
    var checkInDate = String(booking.visit_date || '').substring(0, 10);
    var checkOutDate = String(booking.visit_checkout_date || booking.visit_end_date || checkInDate).substring(0, 10);
    var checkInHour = 12;
    var checkInMinute = 0;
    var checkOutHour = 10;
    var checkOutMinute = 0;
    var timeParts = String(booking.visit_time || '').split(/\s*-\s*/);
    var clockPattern = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

    function parseClock(value) {
        var match = value.trim().match(clockPattern);
        if (!match) return null;
        var hour = parseInt(match[1], 10) % 12;
        if (match[3].toUpperCase() === 'PM') hour += 12;
        return { hour: hour, minute: parseInt(match[2], 10) };
    }

    if (timeParts.length === 2) {
        var parsedCheckIn = parseClock(timeParts[0]);
        var parsedCheckOut = parseClock(timeParts[1]);
        if (parsedCheckIn) {
            checkInHour = parsedCheckIn.hour;
            checkInMinute = parsedCheckIn.minute;
        }
        if (parsedCheckOut) {
            checkOutHour = parsedCheckOut.hour;
            checkOutMinute = parsedCheckOut.minute;
        }
    }

    var checkIn = new Date(checkInDate + 'T' + pad2(checkInHour) + ':' + pad2(checkInMinute) + ':00');
    var checkOut = new Date(checkOutDate + 'T' + pad2(checkOutHour) + ':' + pad2(checkOutMinute) + ':00');
    if (isNaN(checkOut.getTime()) || checkOut <= checkIn) {
        checkOut = new Date(checkIn.getTime() + 22 * 60 * 60 * 1000);
    }
    return { checkIn: checkIn, checkOut: checkOut };
}

function formatScheduleDateTime(date) {
    if (isNaN(date.getTime())) return '--';
    return date.toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatResortBalance(booking) {
    var balance = Number(booking.balance_amount) || 0;
    var paidAtResort = Number(booking.walkin_payment) || 0;
    if (balance <= 0 || paidAtResort >= balance) return 'Paid';
    return '₱' + balance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' due';
}

function renderTodaySchedule(bookings, today) {
    var body = document.getElementById('todayScheduleBody');
    if (!body) return;

    var todayBookings = [];
    bookings.forEach(function(booking) {
        if (booking.status !== 'Approved') return;
        var times = parseReservationTimes(booking);
        if (localDateString(times.checkIn) === today || localDateString(times.checkOut) === today) {
            todayBookings.push({ booking: booking, times: times });
        }
    });
    todayBookings.sort(function(a, b) {
        return a.times.checkIn - b.times.checkIn;
    });

    if (todayBookings.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="admin-empty">No approved guest stays scheduled for today.</td></tr>';
        return;
    }

    body.innerHTML = todayBookings.map(function(item) {
        var booking = item.booking;
        var times = item.times;
        var checkInDate = localDateString(times.checkIn);
        var checkOutDate = localDateString(times.checkOut);
        var guestName = String(booking.guest_name || ((booking.first_name || '') + ' ' + (booking.last_name || '')).trim() || '--');

        return '<tr>' +
            '<td style="font-family:monospace;font-weight:700;">' + escapeDashboardHtml(booking.id || booking.reference || '--') + '</td>' +
            '<td style="font-weight:600;">' + escapeDashboardHtml(guestName) + '</td>' +
            '<td>' + escapeDashboardHtml(formatScheduleDateTime(times.checkIn)) + (checkInDate !== today ? ' (previous day)' : '') + '</td>' +
            '<td>' + escapeDashboardHtml(formatScheduleDateTime(times.checkOut)) + (checkOutDate !== today ? ' (next day)' : '') + '</td>' +
            '<td>' + escapeDashboardHtml(formatResortBalance(booking)) + '</td>' +
            '</tr>';
    }).join('');
}

function renderPendingReservations(bookings) {
    var body = document.getElementById('pendingBody');
    if (!body) return;

    var pending = bookings.filter(function(booking) {
        return booking.status === 'Pending Verification' || booking.status === 'Pending';
    });
    if (pending.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="admin-empty">No pending reservations.</td></tr>';
        return;
    }

    body.innerHTML = pending.map(function(booking) {
        var guestName = String(booking.guest_name || ((booking.first_name || '') + ' ' + (booking.last_name || '')).trim() || '--');
        return '<tr>' +
            '<td style="font-family:monospace;font-weight:700;">' + escapeDashboardHtml(booking.id || booking.reference || '--') + '</td>' +
            '<td>' + escapeDashboardHtml(guestName) + '</td>' +
            '<td>' + escapeDashboardHtml(booking.visit_date || '--') + '</td>' +
            '<td>' + escapeDashboardHtml(booking.visit_time || '--') + '</td>' +
            '<td>' + escapeDashboardHtml(booking.room || '--') + '</td>' +
            '<td>' + escapeDashboardHtml(booking.amount || '--') + '</td>' +
            '<td>' + escapeDashboardHtml(booking.booked_at || '--') + '</td>' +
            '</tr>';
    }).join('');
}

function loadDashboard() {
    var todayDate = new Date();
    var today = localDateString(todayDate);
    var todayLabel = document.getElementById('todayDateLabel');
    if (todayLabel) {
        todayLabel.textContent = 'Today, ' + todayDate.toLocaleDateString('en-PH', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    }

    callApi('reservations.php', { action: 'all_list' }, function(result) {
        if (!result.ok) {
            var scheduleBody = document.getElementById('todayScheduleBody');
            var pendingBody = document.getElementById('pendingBody');
            if (scheduleBody) scheduleBody.innerHTML = '<tr><td colspan="5" class="admin-empty">Could not load today\'s schedule.</td></tr>';
            if (pendingBody) pendingBody.innerHTML = '<tr><td colspan="7" class="admin-empty">Could not load pending reservations.</td></tr>';
            return;
        }

        var bookings = result.bookings || [];
        renderTodaySchedule(bookings, today);
        renderPendingReservations(bookings);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    loadDashboard();

    var refreshButton = document.getElementById('refreshCheckinBtn');
    if (refreshButton) refreshButton.addEventListener('click', loadDashboard);

    setInterval(loadDashboard, 60000);
});
