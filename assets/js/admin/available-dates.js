/* ============================================================
   available-dates.js  —  Admin Available Dates page
   ============================================================ */

var FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* Approved reservations — used to colour the calendar */
var adminApprovedReservations = [];

/* All bookings — used when admin clicks a date */
var allBookings = [];


/* ---- Helper: date string + hour (0-23) → timestamp ---- */
function adminMakeTimestamp(dateStr, hour, minute) {
    var m  = minute || 0;
    var hh = String(hour).padStart(2, '0');
    var mm = String(m).padStart(2, '0');
    return new Date(dateStr + 'T' + hh + ':' + mm + ':00').getTime();
}

var ADMIN_GAP_MS = 2 * 60 * 60 * 1000; /* 2 hours gap in ms */

/* ---- Helper: 0-23 hour → "8:00 AM" or "8:30 AM" style ---- */
function adminFormatHour(h, m) {
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12    = h % 12 || 12;
    var mm     = m ? String(m).padStart(2, '0') : '00';
    return h12 + ':' + mm + ' ' + suffix;
}

/* ---- Helper: return the first free 30-min slot on a date, or null if fully booked ---- */
function adminGetFirstFreeSlot(dateStr) {
    /* Check every 30-min slot: 0:00, 0:30, 1:00, 1:30 ... 23:30 */
    for (var totalMins = 0; totalMins < 24 * 60; totalMins += 30) {
        var slotHour   = Math.floor(totalMins / 60);
        var slotMinute = totalMins % 60;

        var newStart = adminMakeTimestamp(dateStr, slotHour, slotMinute);
        var newEnd   = newStart + (22 * 60 * 60 * 1000);

        var blocked = false;
        for (var i = 0; i < adminApprovedReservations.length; i++) {
            var res = adminApprovedReservations[i];
            var exS = adminMakeTimestamp(res.date,          res.checkin_hour,  res.checkin_minute  || 0);
            var exE = adminMakeTimestamp(res.checkout_date, res.checkout_hour, res.checkout_minute || 0);

            /* Include the two-hour gap after an existing reservation. */
            if (newStart < (exE + ADMIN_GAP_MS) && newEnd > exS) {
                blocked = true;
                break;
            }
        }

        if (!blocked) {
            return { hour: slotHour, minute: slotMinute };
        }
    }
    return null; /* all slots are blocked */
}


/* ============================================================
   Show the detail panel for a clicked date
   ============================================================ */
function showDayDetail(dateStr) {
    var panel   = document.getElementById('dayDetailPanel');
    var titleEl = document.getElementById('dayDetailTitle');
    var bodyEl  = document.getElementById('dayDetailBody');
    if (!panel || !titleEl || !bodyEl) return;

    /* Format date nicely: "November 2, 2026" */
    var d        = new Date(dateStr + 'T00:00:00');
    var niceDate = FULL_MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    titleEl.textContent = 'Reservations on ' + niceDate;

    /* Find all bookings on this date that are not Declined */
    var found = [];
    for (var i = 0; i < allBookings.length; i++) {
        var b = allBookings[i];
        if (b.visit_date === dateStr && b.status !== 'Declined') {
            found.push(b);
        }
    }

    /* No reservations on this date */
    if (found.length === 0) {
        bodyEl.innerHTML =
            '<p style="padding:14px 16px; font-size:13px; color:var(--gray-400); margin:0;">' +
            '&#10003; No reservations on this date.' +
            '</p>';
        panel.style.display = '';
        return;
    }

    /* Build a card for each reservation */
    var html = '';
    for (var j = 0; j < found.length; j++) {
        var bk = found[j];

        /* Status badge colors */
        var sColor = bk.status === 'Approved' ? '#1a6e36' : '#92400e';
        var sBg    = bk.status === 'Approved' ? '#e6f4ec' : '#fffbf0';

        html +=
            '<div class="day-detail-card">' +

                '<div class="day-detail-row">' +
                    '<span class="day-detail-label">Reference</span>' +
                    '<span class="day-detail-value" style="font-family:monospace;">' +
                        (bk.id || '--') +
                    '</span>' +
                '</div>' +

                '<div class="day-detail-row">' +
                    '<span class="day-detail-label">Guest</span>' +
                    '<span class="day-detail-value">' +
                        (bk.first_name || '') + ' ' + (bk.last_name || '') +
                    '</span>' +
                '</div>' +

                '<div class="day-detail-row">' +
                    '<span class="day-detail-label">Time</span>' +
                    '<span class="day-detail-value">&#128336; ' +
                        (bk.visit_time || '--') +
                    '</span>' +
                '</div>' +

                '<div class="day-detail-row">' +
                    '<span class="day-detail-label">Package</span>' +
                    '<span class="day-detail-value">' +
                        (bk.room || '--') +
                    '</span>' +
                '</div>' +

                '<div class="day-detail-row">' +
                    '<span class="day-detail-label">Status</span>' +
                    '<span class="day-detail-value">' +
                        '<span style="background:' + sBg + ';color:' + sColor + ';' +
                               'padding:2px 10px;border-radius:20px;' +
                               'font-size:12px;font-weight:700;">' +
                            bk.status +
                        '</span>' +
                    '</span>' +
                '</div>' +

            '</div>';
    }

    bodyEl.innerHTML = html;
    panel.style.display = '';

    /* Scroll the panel into view smoothly */
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---- Hide the detail panel ---- */
function hideDayDetail() {
    var panel = document.getElementById('dayDetailPanel');
    if (panel) panel.style.display = 'none';

    /* Remove the selected highlight */
    var selected = document.querySelectorAll('.cal-day.admin-selected');
    for (var i = 0; i < selected.length; i++) {
        selected[i].classList.remove('admin-selected');
    }
}


/* ============================================================
   Page init
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {

    var calendarGrid  = document.getElementById('calendarGrid');
    var monthDropdown = document.getElementById('calMonth');
    var yearDropdown  = document.getElementById('calYear');
    if (!calendarGrid) return;

    var today      = new Date();
    var todayStr   = today.toISOString().split('T')[0];
    var shownYear  = today.getFullYear();
    var shownMonth = today.getMonth();

    /* Build month dropdown */
    if (monthDropdown) {
        FULL_MONTHS.forEach(function(name, i) {
            monthDropdown.innerHTML += '<option value="' + i + '">' + name + '</option>';
        });
        monthDropdown.value = String(shownMonth);
    }

    /* Build year dropdown */
    if (yearDropdown) {
        for (var y = shownYear; y <= shownYear + 5; y++) {
            yearDropdown.innerHTML += '<option value="' + y + '">' + y + '</option>';
        }
        yearDropdown.value = String(shownYear);
    }


    /* ---- Draw the calendar ---- */
    function drawCalendar() {
        setElementText('calendarTitle', FULL_MONTHS[shownMonth] + ' ' + shownYear);
        hideDayDetail();

        var firstDay  = new Date(shownYear, shownMonth, 1).getDay();
        var totalDays = new Date(shownYear, shownMonth + 1, 0).getDate();
        var html      = '';

        /* Day-of-week header row */
        for (var d = 0; d < DAY_LABELS.length; d++) {
            html += '<div class="cal-head">' + DAY_LABELS[d] + '</div>';
        }

        /* Empty filler cells before the 1st */
        for (var e = 0; e < firstDay; e++) {
            html += '<div class="cal-day empty"></div>';
        }

        /* One cell per day */
        for (var day = 1; day <= totalDays; day++) {
            var mm      = String(shownMonth + 1).padStart(2, '0');
            var dd      = String(day).padStart(2, '0');
            var dateStr = shownYear + '-' + mm + '-' + dd;

            /* Check if this date has any booking (any status) */
            var hasAnyBooking = false;
            for (var bi = 0; bi < allBookings.length; bi++) {
                if (allBookings[bi].visit_date === dateStr) {
                    hasAnyBooking = true;
                    break;
                }
            }

            /* Past date — still clickable for admin if it has bookings */
            if (dateStr < todayStr) {
                var pastClass = hasAnyBooking ? 'cal-day disabled admin-clickable' : 'cal-day disabled';
                html += '<div class="' + pastClass + '" data-date="' + dateStr + '">'
                      + '<span class="cal-day-num">' + day + '</span>'
                      + '</div>';
                continue;
            }

            /* Future / today date — get the first free slot with exact time */
            var firstFreeSlot = adminGetFirstFreeSlot(dateStr);

            var hasSomeBooked = false;
            for (var ri = 0; ri < adminApprovedReservations.length; ri++) {
                var res = adminApprovedReservations[ri];
                if (res.date === dateStr || res.checkout_date === dateStr) {
                    hasSomeBooked = true;
                    break;
                }
            }

            var dayClass  = '';
            var timeLabel = '';

            if (firstFreeSlot === null) {
                /* Fully booked — no free slots */
                dayClass  = 'cal-day reserved admin-clickable';
                timeLabel = '';
            } else if (hasSomeBooked) {
                /* Some times taken — show exact earliest free time */
                dayClass  = 'cal-day open partial-day admin-clickable';
                timeLabel = '<span class="cal-day-time">From ' + adminFormatHour(firstFreeSlot.hour, firstFreeSlot.minute) + '</span>';
            } else {
                /* Completely free */
                dayClass  = 'cal-day open admin-clickable';
                timeLabel = '<span class="cal-day-time">Any time</span>';
            }

            html += '<div class="' + dayClass + '" data-date="' + dateStr + '">'
                  + '<span class="cal-day-num">' + day + '</span>'
                  + timeLabel
                  + '</div>';
        }

        calendarGrid.innerHTML = html;
    }


    /* ---- Month / year change ---- */
    if (monthDropdown) {
        monthDropdown.addEventListener('change', function() {
            shownMonth = parseInt(monthDropdown.value, 10);
            drawCalendar();
        });
    }
    if (yearDropdown) {
        yearDropdown.addEventListener('change', function() {
            shownYear = parseInt(yearDropdown.value, 10);
            drawCalendar();
        });
    }


    /* ---- Calendar click handler ---- */
    calendarGrid.addEventListener('click', function(e) {
        /* Walk up from whatever element was clicked to find the day cell */
        var target = e.target;
        var cell   = null;

        /* Keep going up until we find a cal-day or run out */
        while (target && target !== calendarGrid) {
            if (target.classList && target.classList.contains('cal-day')) {
                cell = target;
                break;
            }
            target = target.parentElement;
        }

        /* Only react if it's a clickable day */
        if (!cell || !cell.classList.contains('admin-clickable')) return;

        var dateStr = cell.getAttribute('data-date');
        if (!dateStr) return;

        /* Highlight the selected cell */
        var allCells = calendarGrid.querySelectorAll('.cal-day.admin-selected');
        for (var i = 0; i < allCells.length; i++) {
            allCells[i].classList.remove('admin-selected');
        }
        cell.classList.add('admin-selected');

        /* Show the detail panel */
        showDayDetail(dateStr);
    });


    /* ---- Close button ---- */
    var closeBtn = document.getElementById('dayDetailClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideDayDetail);
    }


    /* ---- Load data: first approved reservations, then all bookings ---- */
    callApi('reservations.php', { action: 'reserved_dates' }, function(r1) {

        if (r1.ok && r1.reservations) {
            adminApprovedReservations = r1.reservations;
        }

        callApi('reservations.php', { action: 'all_list' }, function(r2) {

            if (r2.ok && r2.bookings) {
                allBookings = r2.bookings;
            }

            /* Draw calendar only after both API calls are done */
            drawCalendar();

            /* Build the upcoming table */
            buildUpcomingTable();
        });
    });


    /* ---- Upcoming reservations table ---- */
    function buildUpcomingTable() {
        var tableBody = document.getElementById('reservedDatesBody');
        if (!tableBody) return;

        /* Only future bookings that are not Declined */
        var upcoming = [];
        for (var i = 0; i < allBookings.length; i++) {
            var b = allBookings[i];
            if (b.status !== 'Declined' && b.visit_date && b.visit_date >= todayStr) {
                upcoming.push(b);
            }
        }

        /* Sort by date */
        upcoming.sort(function(a, b) {
            return a.visit_date < b.visit_date ? -1 : 1;
        });

        if (upcoming.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="admin-empty">No upcoming reserved dates.</td></tr>';
            return;
        }

        var html = '';
        for (var j = 0; j < upcoming.length; j++) {
            var bk         = upcoming[j];
            var badgeClass = bk.status === 'Approved' ? 'badge-green' : 'badge-yellow';
            html +=
                '<tr>' +
                    '<td><b>' + (bk.visit_date  || '--') + '</b></td>' +
                    '<td>'    + (bk.visit_time  || '--') + '</td>' +
                    '<td>'    + (bk.first_name  || '') + ' ' + (bk.last_name || '') + '</td>' +
                    '<td>'    + (bk.room        || '--') + '</td>' +
                    '<td><span class="badge ' + badgeClass + '">' + bk.status + '</span></td>' +
                '</tr>';
        }

        tableBody.innerHTML = html;
    }

});
