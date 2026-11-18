/* ============================================================
   booking.js  —  Customer Booking page
   ---------------------------------------------------------------
   Two-step reservation form:
     Step 1: Pick a date, time, and package (with live price)
     Step 2: Fill in guest info and upload GCash payment proof

   Data is now saved to MySQL via the PHP API.
   Load shared.js before this file.
   ============================================================ */


/* ---- Package pricing table ---- */
var PACKAGE_RATES = [
    { minPax: 1, maxPax: 10, rooms: 2, weekdayRate: 9000, weekendRate: 12000 },
    { minPax: 11, maxPax: 15, rooms: 3, weekdayRate: 13000, weekendRate: 17000 },
    { minPax: 16, maxPax: 20, rooms: 4, weekdayRate: 17000, weekendRate: 22000 },
    { minPax: 21, maxPax: 25, rooms: 5, weekdayRate: 21000, weekendRate: 27000 },
    { minPax: 26, maxPax: 30, rooms: 6, weekdayRate: 24000, weekendRate: 31000 },
    { minPax: 31, maxPax: 35, rooms: 7, weekdayRate: 27000, weekendRate: 35000 }
];

var LPG_FEE = 500;

function findPackageByRange(rangeValue) {
    for (var i = 0; i < PACKAGE_RATES.length; i++) {
        var pkg = PACKAGE_RATES[i];
        if ((pkg.minPax + '-' + pkg.maxPax) === rangeValue) return pkg;
    }
    return null;
}

function isWeekendOrHoliday(dateString) {
    if (!dateString) return false;
    var day = new Date(dateString + 'T00:00:00').getDay();
    return day === 0 || day === 5 || day === 6;
}


/* ============================================================
   STEP NAVIGATION
   ============================================================ */

var currentStep = 1;

function showStep(stepNumber) {
    currentStep = stepNumber;

    var step1 = document.getElementById('bookingStep1');
    var step2 = document.getElementById('bookingStep2');

    if (step1) step1.style.display = (stepNumber === 1) ? '' : 'none';
    if (step2) step2.style.display = (stepNumber === 2) ? '' : 'none';

    document.querySelectorAll('.booking-step-indicator .step-item').forEach(function(item, index) {
        item.classList.toggle('active', index + 1 === stepNumber);
        item.classList.toggle('done', index + 1 < stepNumber);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ============================================================
   LIVE PRICE SUMMARY
   ============================================================ */

function recalcPrice() {
    var chosenDate = getFieldValue('visitDate');
    var chosenPackage = getFieldValue('packageChoice');
    var lpgCheckbox = document.getElementById('addLpg');
    var lpgChecked = lpgCheckbox && lpgCheckbox.checked;
    var isWeekend = isWeekendOrHoliday(chosenDate);
    var packageData = findPackageByRange(chosenPackage);

    setElementText('calcRateType', !chosenDate ? '--' : (isWeekend ? 'Weekend / Holiday' : 'Weekday'));

    var packageCost = 0;
    if (packageData) {
        packageCost = isWeekend ? packageData.weekendRate : packageData.weekdayRate;
        setElementText('calcPackageLabel', packageData.rooms + ' Rooms (' + packageData.minPax + '-' + packageData.maxPax + ' pax)');
        setElementText('calcPackageCost', formatAsPesos(packageCost));
    } else {
        setElementText('calcPackageLabel', 'Package (select one)');
        setElementText('calcPackageCost', '--');
    }

    var lpgCost = lpgChecked ? LPG_FEE : 0;
    setElementText('calcLpgCost', lpgChecked ? formatAsPesos(LPG_FEE) + ' (pay at resort)' : '--');

    var total = packageCost + lpgCost;
    var amountDue = Math.ceil(packageCost * 0.5);

    setElementText('calcSubtotal', total > 0 ? formatAsPesos(total) : '--');
    setElementText('calcDue', packageCost > 0 ? formatAsPesos(amountDue) : '--');
    setElementText('calcMode', lpgChecked ?
        '50% Package Only (LPG paid at resort)' :
        '50% Package Down Payment');
}

function setupPriceSummary() {
    if (!document.getElementById('calcDue')) return;

    ['visitDate', 'packageChoice'].forEach(function(id) {
        var field = document.getElementById(id);
        if (field) field.addEventListener('change', recalcPrice);
    });

    var lpg = document.getElementById('addLpg');
    if (lpg) lpg.addEventListener('change', recalcPrice);

    recalcPrice();
}


/* ============================================================
   BOOKING CALENDAR
   ============================================================ */

var CALENDAR_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var CALENDAR_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getManilaDateTime(now) {
    /* Keep date selection aligned with the resort's local time zone. */
    var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(now || new Date());
    var values = {};
    parts.forEach(function(part) {
        if (part.type !== 'literal') values[part.type] = part.value;
    });

    return {
        date: values.year + '-' + values.month + '-' + values.day,
        year: parseInt(values.year, 10),
        month: parseInt(values.month, 10) - 1,
        minutes: (parseInt(values.hour, 10) * 60) + parseInt(values.minute, 10),
        seconds: parseInt(values.second, 10)
    };
}

/* Check if a given dateStr is covered by any preview reservation (check-in OR checkout date) */
function isDateBeingChosen(dateStr) {
    for (var i = 0; i < previewReservations.length; i++) {
        var p = previewReservations[i];
        if (p.date === dateStr || p.checkout_date === dateStr) return true;
    }
    return false;
}

/* Show a styled inline toast / mini-popup for "being chosen" clicks */
function showBeingChosenWarning(anchorCell) {
    /* Remove any existing one first */
    var old = document.getElementById('beingChosenPopup');
    if (old) old.parentNode.removeChild(old);

    var popup = document.createElement('div');
    popup.id = 'beingChosenPopup';
    popup.setAttribute('role', 'alert');
    popup.setAttribute('aria-live', 'assertive');
    popup.innerHTML =
        '<span class="material-icons" style="font-size:16px;vertical-align:middle;margin-right:6px;flex-shrink:0;">schedule</span>' +
        '<span>This date is currently being chosen by another customer. Please pick a different date.</span>' +
        '<button type="button" onclick="var p=document.getElementById(\'beingChosenPopup\');if(p)p.parentNode.removeChild(p);" ' +
        'style="background:none;border:none;cursor:pointer;margin-left:8px;color:inherit;font-size:18px;line-height:1;flex-shrink:0;" aria-label="Dismiss">&times;</button>';

    /* Position near the clicked cell if available, otherwise below the calendar */
    var cal = document.getElementById('calendarGrid');
    var container = (cal && cal.parentNode) ? cal.parentNode : document.body;
    container.appendChild(popup);

    /* Auto-remove after 4 seconds */
    setTimeout(function() {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
    }, 4000);
}

function setupBookingCalendar() {
    var calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;

    var hiddenDate = document.getElementById('visitDate');
    var selectedDate = '';
    var monthDropdown = document.getElementById('calMonth');
    var yearDropdown = document.getElementById('calYear');
    var today = getManilaDateTime();
    var shownYear = today.year;
    var shownMonth = today.month;

    /* Build month dropdown */
    if (monthDropdown) {
        CALENDAR_MONTHS.forEach(function(name, i) {
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

    /* Draw the calendar using approvedReservations (already loaded) */
    function drawCalendar() {
        var todayString = getManilaDateTime().date;
        setElementText('calendarTitle', CALENDAR_MONTHS[shownMonth] + ' ' + shownYear);

        var firstDay = new Date(shownYear, shownMonth, 1).getDay();
        var totalDays = new Date(shownYear, shownMonth + 1, 0).getDate();
        var html = '';

        CALENDAR_DAYS.forEach(function(d) { html += '<div class="cal-head">' + d + '</div>'; });
        for (var e = 0; e < firstDay; e++) { html += '<div class="cal-day empty"></div>'; }

        var openDaysCount = 0;

        for (var day = 1; day <= totalDays; day++) {
            var mm = String(shownMonth + 1).padStart(2, '0');
            var dd = String(day).padStart(2, '0');
            var dateStr = shownYear + '-' + mm + '-' + dd;

            /* Use getFreeSlots (same function as the time picker) so calendar matches */
            var firstSlot = (dateStr < todayString) ? null : getFirstFreeSlot(dateStr);

            /* Check if this date is being "previewed" (chosen) by another user */
            var beingChosen = isDateBeingChosen(dateStr);

            var dayClass;
            if (dateStr < todayString) {
                dayClass = 'disabled';
            } else if (firstSlot === null && !beingChosen) {
                dayClass = 'reserved'; /* fully booked, no free slots */
            } else if (beingChosen) {
                /* Another customer is currently choosing this date — lock it visually */
                dayClass = 'being-chosen';
            } else {
                dayClass = 'open';
            }

            /* Count this as an open day */
            if (dayClass === 'open') openDaysCount++;

            if (dateStr === selectedDate) { dayClass += ' chosen'; }

            /* Check if some hours are already booked on this date */
            var hasSomeBooked = false;
            for (var ri = 0; ri < approvedReservations.length; ri++) {
                var res = approvedReservations[ri];
                if (res.date === dateStr || res.checkout_date === dateStr) {
                    hasSomeBooked = true;
                    break;
                }
            }

            /* Time label — show the exact first available slot */
            var timeLabel = '';
            if (dayClass.indexOf('open') !== -1) {
                if (!hasSomeBooked && dateStr !== todayString) {
                    /* Completely free day */
                    timeLabel = '<span class="cal-day-time">Any time</span>';
                } else {
                    /* Show the earliest free slot when bookings or elapsed time restrict the day. */
                    dayClass += ' partial-day';
                    timeLabel = '<span class="cal-day-time">From ' + formatSlot(firstSlot) + '</span>';
                }
            }

            /* For being-chosen days, add a brief label */
            var chosenLabel = '';
            if (dayClass.indexOf('being-chosen') !== -1 && dayClass.indexOf('chosen') === -1) {
                chosenLabel = '<span class="cal-day-time cal-day-time--chosen">In use</span>';
            }

            html += '<div class="cal-day ' + dayClass + '" data-date="' + dateStr + '">' +
                '<span class="cal-day-num">' + day + '</span>' +
                timeLabel +
                chosenLabel +
                '</div>';
        }

        calendarGrid.innerHTML = html;

        var noDateMsg = document.getElementById('calNoDateMsg');
        if (noDateMsg) {
            if (openDaysCount === 0) {
                noDateMsg.style.display = 'block';
                noDateMsg.textContent = 'No available dates this month. Try the next month.';
            } else {
                noDateMsg.style.display = 'none';
                noDateMsg.textContent = '';
            }
        }
    }

    /* Expose drawCalendar to the module scope so the real-time poller
       can call it directly without rebuilding dropdowns or re-attaching
       event listeners. */
    _drawCalendar = drawCalendar;

    if (monthDropdown) monthDropdown.addEventListener('change', function() { shownMonth = parseInt(monthDropdown.value, 10);
        drawCalendar(); });
    if (yearDropdown) yearDropdown.addEventListener('change', function() { shownYear = parseInt(yearDropdown.value, 10);
        drawCalendar(); });

    calendarGrid.addEventListener('click', function(e) {
        var cell = e.target.closest('.cal-day');
        if (!cell) return;

        var dateStr = cell.getAttribute('data-date');

        /* Clicking a "being chosen by other user" cell — show warning and stop */
        if (cell.classList.contains('being-chosen') && !cell.classList.contains('chosen')) {
            showBeingChosenWarning(cell);
            return;
        }

        /* Only open (available) cells and the currently chosen cell respond */
        if (!cell.classList.contains('open') && !cell.classList.contains('chosen')) return;

        /* Toggle: clicking the already-selected date deselects it */
        if (dateStr === selectedDate) {
            selectedDate = '';
            if (hiddenDate) {
                hiddenDate.value = '';
                hiddenDate.dispatchEvent(new Event('change'));
            }
            setElementText('chosenDateHint', 'No date selected yet.');
            /* Hide the time picker */
            var pickerBox = document.getElementById('timePickerBox');
            var nodateMsg = document.getElementById('slotNodateMsg');
            if (pickerBox) pickerBox.style.display = 'none';
            if (nodateMsg) nodateMsg.style.display = '';
            /* Clear visit time too */
            var visitTime = document.getElementById('visitTime');
            if (visitTime) visitTime.value = '';
            /* Remove the preview lock from the server */
            callApi('reservations.php', { action: 'clear_preview' }, function() {});
            stopPreviewRefresh();
            drawCalendar();
            return;
        }

        /* New date selected */
        selectedDate = dateStr;
        if (hiddenDate) {
            hiddenDate.value = selectedDate;
            hiddenDate.dispatchEvent(new Event('change'));
        }
        setElementText('chosenDateHint', 'Selected: ' + selectedDate);
        updateTimeSlots(selectedDate); /* show time picker — onCheckinSelected() inside will fire preview_lock with exact hours */
        drawCalendar();

        /* Keep the preview lock alive while the user stays on Step 1 */
        startPreviewRefresh();
    });

    drawCalendar();
}


/* ============================================================
   CHECK-IN AVAILABILITY
   Check every minute and hide times that overlap an approved
   reservation or the two-hour gap after its checkout.
   ============================================================ */

/* List of all approved reservations — filled by loadApprovedReservations() */
var approvedReservations = [];

/* List of soft "being chosen" previews from other active users */
var previewReservations = [];

/* Module-level reference to the inner drawCalendar closure.
   Set by setupBookingCalendar() so the poller can call it directly
   without rebuilding dropdowns or re-attaching event listeners. */
var _drawCalendar = null;

/* Interval handle for the real-time availability poller */
var _availabilityPollTimer = null;

/* Interval handle for refreshing this user's own preview lock */
var _previewRefreshTimer = null;

/* ---- Initial load: fetch data then build the full calendar widget ---- */
function loadApprovedReservations() {
    callApi('reservations.php', { action: 'reserved_dates' }, function(result) {
        if (result.ok) {
            approvedReservations = result.reservations || [];
            previewReservations = result.previews || [];
        }
        /* First call: build the full calendar (dropdowns + grid + listeners) */
        setupBookingCalendar();
        /* Start the real-time poller AFTER the calendar is fully built */
        startAvailabilityPoller();
    });
}

/* ---- Silent background refresh: only update the grid, nothing else ---- */
/* Uses chained requests (no setInterval pile-up): each fetch fires only after
   the previous one completes + a 300 ms breathing gap. */

var _lastCalendarFingerprint = '';

function refreshCalendarData() {
    /* Don't poll while the user is on Step 2 */
    if (currentStep !== 1) {
        scheduleNextPoll();
        return;
    }

    callApi('reservations.php', { action: 'reserved_dates' }, function(result) {
        if (result.ok) {
            /* Build a cheap fingerprint so we skip redraws when nothing changed */
            var fp = JSON.stringify([result.reservations, result.previews]);
            if (fp !== _lastCalendarFingerprint) {
                _lastCalendarFingerprint = fp;
                approvedReservations = result.reservations || [];
                previewReservations = result.previews || [];
                if (typeof _drawCalendar === 'function') _drawCalendar();
            }
        }
        scheduleNextPoll();
    });
}

/* Fire the next refresh after a short gap — replaces setInterval so requests
   never pile up even under slow network or a busy XAMPP server. */
function scheduleNextPoll() {
    if (_availabilityPollTimer !== null) return; /* already scheduled */
    _availabilityPollTimer = setTimeout(function() {
        _availabilityPollTimer = null;
        refreshCalendarData();
    }, 300); /* 300 ms after last response = effectively ~400-600 ms round-trip */
}

/* ---- Start the chained poller ---- */
function startAvailabilityPoller() {
    stopAvailabilityPoller();
    _availabilityPollTimer = null;
    refreshCalendarData(); /* kick off immediately, then self-schedules */
}

/* ---- Stop polling ---- */
function stopAvailabilityPoller() {
    if (_availabilityPollTimer) {
        clearTimeout(_availabilityPollTimer);
        _availabilityPollTimer = null;
    }
}

/* ---- Start refreshing this session's own preview lock every 30 seconds ---- */
function startPreviewRefresh() {
    stopPreviewRefresh();
    _previewRefreshTimer = setInterval(function() {
        if (currentStep === 1) {
            callApi('reservations.php', { action: 'refresh_preview' }, function() {});
        }
    }, 30000);
}

/* ---- Stop refreshing preview lock ---- */
function stopPreviewRefresh() {
    if (_previewRefreshTimer) {
        clearInterval(_previewRefreshTimer);
        _previewRefreshTimer = null;
    }
}

/* Convert a date string + hour number into a comparable timestamp (milliseconds) */
function makeTimestamp(dateStr, hour, minute) {
    /* minute is optional, defaults to 0 */
    var m = minute || 0;
    var hh = String(hour).padStart(2, '0');
    var mm = String(m).padStart(2, '0');
    return new Date(dateStr + 'T' + hh + ':' + mm + ':00').getTime();
}

/* Required two-hour gap after an existing reservation. */
var TWO_HOUR_GAP = 2 * 60 * 60 * 1000;

/* Given a date string, return which check-in times (in minutes from midnight) are still FREE */
/* Check availability at every minute of the day. */
function getFreeSlots(dateStr) {
    var freeSlots = [];
    var now = getManilaDateTime();
    /* Round up to a minute so today's check-in is at least three hours away. */
    var earliestTodayCheckin = now.minutes + (3 * 60) + (now.seconds > 0 ? 1 : 0);
    if (dateStr < now.date) return freeSlots;

    /* Combine approved reservations + active previews from other users */
    var allBlocking = approvedReservations.concat(previewReservations);

    /* Loop through every minute of the day. */
    for (var totalMins = 0; totalMins < 24 * 60; totalMins++) {
        var checkinHour = Math.floor(totalMins / 60);
        var checkinMinute = totalMins % 60;

        /* This new booking starts here and runs for exactly 22 hours */
        var newStart = makeTimestamp(dateStr, checkinHour, checkinMinute);
        if (dateStr === now.date && totalMins < earliestTodayCheckin) continue;
        var newEnd = newStart + (22 * 60 * 60 * 1000);

        var blocked = false;

        for (var i = 0; i < allBlocking.length; i++) {
            var res = allBlocking[i];

            /* Block the existing reservation and the two-hour cleanup gap after checkout. */
            var exStart = makeTimestamp(res.date, res.checkin_hour, res.checkin_minute || 0);
            var exEnd = makeTimestamp(res.checkout_date, res.checkout_hour, res.checkout_minute || 0);

            var exEndWithGap = exEnd + TWO_HOUR_GAP;

            /* This slot is blocked if the new booking overlaps the existing one + gap */
            if (newStart < exEndWithGap && newEnd > exStart) {
                blocked = true;
                break;
            }
        }

        if (!blocked) {
            freeSlots.push({ hour: checkinHour, minute: checkinMinute });
        }
    }

    return freeSlots;
}

/* Format a slot { hour, minute } into "8:05 AM" style */
function formatSlot(slot) {
    var h = slot.hour;
    var m = slot.minute;
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    var mm = String(m).padStart(2, '0');
    return h12 + ':' + mm + ' ' + suffix;
}

/* Given a date string, return the first free slot — used by the calendar label */
function getFirstFreeSlot(dateStr) {
    var freeSlots = getFreeSlots(dateStr);
    return freeSlots.length > 0 ? freeSlots[0] : null;
}

/* ============================================================
   CLOCK TIME PICKER
   The hour, minute, and AM/PM controls update availability as
   the customer changes them. A free time is selected immediately.
   ============================================================ */

/* Show the time picker section after a date is chosen */
function showTimePicker(dateStr) {
    var nodateMsg = document.getElementById('slotNodateMsg');
    var pickerBox = document.getElementById('timePickerBox');
    var checkoutDisp = document.getElementById('checkoutDisplay');
    var visitTime = document.getElementById('visitTime');
    var selDisplay = document.getElementById('clockSelectedDisplay');
    var hint = document.getElementById('checkinHint');

    if (!pickerBox) return;

    /* Reset */
    if (visitTime) visitTime.value = '';
    if (checkoutDisp) checkoutDisp.style.display = 'none';
    if (selDisplay) selDisplay.style.display = 'none';

    /* Work out the first free slot to pre-select on the clock */
    var freeSlots = getFreeSlots(dateStr);

    if (freeSlots.length === 0) {
        if (hint) hint.textContent = 'No available times on this date. Please pick another date.';
        pickerBox.style.display = '';
        if (nodateMsg) nodateMsg.style.display = 'none';
        return;
    }

    /* Clear hint text — no need to show slot count */
    if (hint) hint.textContent = '';

    /* Pre-fill the clock to the first free slot */
    var first = freeSlots[0];
    var h12 = first.hour % 12 || 12;
    var ampm = first.hour >= 12 ? 'PM' : 'AM';

    var hourInput = document.getElementById('clockHour');
    var minInput = document.getElementById('clockMin');
    var btnAM = document.getElementById('btnAM');
    var btnPM = document.getElementById('btnPM');

    if (hourInput) hourInput.value = h12;
    if (minInput) minInput.value = String(first.minute).padStart(2, '0');
    if (btnAM) btnAM.classList.toggle('active', ampm === 'AM');
    if (btnPM) btnPM.classList.toggle('active', ampm === 'PM');

    /* Show the picker */
    if (nodateMsg) nodateMsg.style.display = 'none';
    pickerBox.style.display = '';

    /* Check the pre-filled time immediately */
    checkClockTime(dateStr);
}

/* Read the current clock values and return { hour24, minute } */
function readClock() {
    var hourInput = document.getElementById('clockHour');
    var minInput = document.getElementById('clockMin');
    var btnPM = document.getElementById('btnPM');

    var h12 = parseInt((hourInput ? hourInput.value : '12'), 10);
    var minuteValue = minInput ? minInput.value : '00';
    if (!/^\d{1,2}$/.test(minuteValue)) return null;
    var minute = parseInt(minuteValue, 10);
    if (minute < 0 || minute > 59) return null;
    var isPM = btnPM && btnPM.classList.contains('active');

    /* Clamp hour to 1–12 */
    if (isNaN(h12) || h12 < 1) h12 = 1;
    if (h12 > 12) h12 = 12;
    if (hourInput) hourInput.value = h12;

    /* Convert to 24-hour */
    var hour24;
    if (isPM) {
        hour24 = (h12 === 12) ? 12 : h12 + 12;
    } else {
        hour24 = (h12 === 12) ? 0 : h12;
    }

    return { hour24: hour24, minute: minute };
}

/* Check if the current clock time is free and update the UI */
function checkClockTime(dateStr) {
    var t = readClock();
    var clock = document.querySelector('.clock-picker');
    if (!t) {
        if (clock) {
            clock.classList.remove('time-ok');
            clock.classList.add('time-bad');
        }
        var invalidSelDisplay = document.getElementById('clockSelectedDisplay');
        var invalidCheckoutDisp = document.getElementById('checkoutDisplay');
        var invalidVisitTime = document.getElementById('visitTime');
        if (invalidSelDisplay) invalidSelDisplay.style.display = 'none';
        if (invalidCheckoutDisp) invalidCheckoutDisp.style.display = 'none';
        if (invalidVisitTime) invalidVisitTime.value = '';
        return;
    }
    var freeSlots = getFreeSlots(dateStr);

    /* Check if this slot is in the free list */
    var isFree = false;
    for (var i = 0; i < freeSlots.length; i++) {
        if (freeSlots[i].hour === t.hour24 && freeSlots[i].minute === t.minute) {
            isFree = true;
            break;
        }
    }

    /* Update clock border color */
    if (clock) {
        clock.classList.toggle('time-ok', isFree);
        clock.classList.toggle('time-bad', !isFree);
    }

    if (isFree) {
        /* Auto-confirm: immediately save the time and show checkout */
        onCheckinSelected();
    } else {
        /* Time is blocked — clear everything */
        var selDisplay = document.getElementById('clockSelectedDisplay');
        var checkoutDisp = document.getElementById('checkoutDisplay');
        var visitTime = document.getElementById('visitTime');
        if (selDisplay) selDisplay.style.display = 'none';
        if (checkoutDisp) checkoutDisp.style.display = 'none';
        if (visitTime) visitTime.value = '';
    }
}

/* Called automatically when the clock shows a free time */
function onCheckinSelected() {
    var dateStr = document.getElementById('visitDate') ? document.getElementById('visitDate').value : '';
    var t = readClock();

    var checkinHour = t.hour24;
    var checkinMin = t.minute;
    var checkinTs = makeTimestamp(dateStr, checkinHour, checkinMin);
    var checkoutTs = checkinTs + (22 * 60 * 60 * 1000);
    var checkoutDt = new Date(checkoutTs);

    var checkoutHour = checkoutDt.getHours();
    var checkoutMin = checkoutDt.getMinutes();

    var y = checkoutDt.getFullYear();
    var mo = String(checkoutDt.getMonth() + 1).padStart(2, '0');
    var dy = String(checkoutDt.getDate()).padStart(2, '0');
    var checkoutDate = y + '-' + mo + '-' + dy;

    /* Show checkout label automatically */
    var checkoutLabel = formatSlot({ hour: checkoutHour, minute: checkoutMin });
    if (checkoutDate !== dateStr) {
        checkoutLabel += ' (next day — ' + checkoutDate + ')';
    } else {
        checkoutLabel += ' (same day)';
    }

    var selDisplay = document.getElementById('clockSelectedDisplay');
    var selLabel = document.getElementById('clockSelectedLabel');
    var checkoutVal = document.getElementById('checkoutValue');
    var checkoutDisp = document.getElementById('checkoutDisplay');

    if (selLabel) selLabel.textContent = formatSlot({ hour: checkinHour, minute: checkinMin });
    if (selDisplay) selDisplay.style.display = '';
    if (checkoutVal) checkoutVal.textContent = checkoutLabel;
    if (checkoutDisp) checkoutDisp.style.display = '';

    /* Store value for PHP */
    var visitTime = document.getElementById('visitTime');
    if (visitTime) {
        visitTime.value = checkinHour + '|' + checkinMin + '|' +
            checkoutHour + '|' + checkoutMin + '|' +
            dateStr + '|' + checkoutDate;
    }

    /* Update the preview lock with the exact hours so both check-in date AND
       checkout date (next-day or same-day) are highlighted on other users'
       calendars immediately. This replaces the rough initial preview that
       fires on calendar click. */
    if (dateStr) {
        callApi('reservations.php', {
            action: 'preview_lock',
            visitDate: dateStr,
            checkinHour: checkinHour,
            checkinMinute: checkinMin
        }, function() {});
    }

    recalcPrice();
}

/* Wire up the clock controls */
function setupTimeSlots() {
    var hourInput = document.getElementById('clockHour');
    var minInput = document.getElementById('clockMin');
    var btnAM = document.getElementById('btnAM');
    var btnPM = document.getElementById('btnPM');
    var hourUp = document.getElementById('hourUp');
    var hourDown = document.getElementById('hourDown');
    var minUp = document.getElementById('minUp');
    var minDown = document.getElementById('minDown');

    function currentDate() {
        var vd = document.getElementById('visitDate');
        return vd ? vd.value : '';
    }

    /* Hour up/down buttons */
    if (hourUp) hourUp.addEventListener('click', function() {
        var h = parseInt(hourInput.value, 10) || 12;
        hourInput.value = (h >= 12) ? 1 : h + 1;
        checkClockTime(currentDate());
    });
    if (hourDown) hourDown.addEventListener('click', function() {
        var h = parseInt(hourInput.value, 10) || 12;
        hourInput.value = (h <= 1) ? 12 : h - 1;
        checkClockTime(currentDate());
    });

    /* Typing directly in the hour input */
    if (hourInput) hourInput.addEventListener('input', function() {
        checkClockTime(currentDate());
    });

    /* Minute input accepts 00–59; arrows remain available for one-minute adjustments. */
    if (minUp) minUp.addEventListener('click', function() {
        var minute = parseInt(minInput.value, 10) || 0;
        minInput.value = String((minute + 1) % 60).padStart(2, '0');
        checkClockTime(currentDate());
    });
    if (minDown) minDown.addEventListener('click', function() {
        var minute = parseInt(minInput.value, 10) || 0;
        minInput.value = String((minute + 59) % 60).padStart(2, '0');
        checkClockTime(currentDate());
    });

    if (minInput) minInput.addEventListener('input', function() {
        minInput.value = minInput.value.replace(/\D/g, '').slice(0, 2);
        checkClockTime(currentDate());
    });
    if (minInput) minInput.addEventListener('blur', function() {
        var minute = parseInt(minInput.value, 10);
        if (/^\d{1,2}$/.test(minInput.value) && minute >= 0 && minute <= 59) {
            minInput.value = String(minute).padStart(2, '0');
        }
    });

    /* AM / PM toggle */
    if (btnAM) btnAM.addEventListener('click', function() {
        btnAM.classList.add('active');
        btnPM.classList.remove('active');
        checkClockTime(currentDate());
    });
    if (btnPM) btnPM.addEventListener('click', function() {
        btnPM.classList.add('active');
        btnAM.classList.remove('active');
        checkClockTime(currentDate());
    });

    /* Confirm button no longer needed — removed */
}

/* ---- Keep updateTimeSlots as a compatibility shim called from calendar click ---- */
function updateTimeSlots(dateStr) {
    showTimePicker(dateStr);
}


/* ============================================================
   PROCEED BUTTON (Step 1 → Step 2)
   Intercepts the click to place a 15-minute temporary hold on
   the selected date/time via the backend before revealing Step 2.
   ============================================================ */

/* Stores the ISO timestamp when the current hold expires */
var holdExpiresAt = null;
/* Countdown timer reference so we can clear it */
var holdCountdownTimer = null;

function setupProceedButton() {
    var proceedBtn = document.getElementById('proceedToStep2');
    if (!proceedBtn) return;

    proceedBtn.addEventListener('click', function() {
        /* ---- Existing field validations (unchanged) ---- */
        if (!getFieldValue('visitDate')) { showToast('Please select a visit date.', 'warning'); return; }
        if (!getFieldValue('visitTime')) { showToast('Please select a visit time.', 'warning'); return; }
        if (!getFieldValue('packageChoice')) { showToast('Please select a package.', 'warning'); return; }

        /* ---- Parse time from visitTime hidden field ---- */
        /* visitTime format: "checkinHour|checkinMinute|checkoutHour|checkoutMinute|checkinDate|checkoutDate" */
        var timeParts = (getFieldValue('visitTime') || '').split('|');
        var checkinHour = timeParts.length >= 1 ? parseInt(timeParts[0], 10) : 0;
        var checkinMin = timeParts.length >= 2 ? parseInt(timeParts[1], 10) : 0;

        /* ---- Disable button while the AJAX request is in flight ---- */
        proceedBtn.disabled = true;
        var origText = proceedBtn.innerHTML;
        proceedBtn.innerHTML = '<span class="material-icons" style="font-size:16px;vertical-align:middle;animation:spin 1s linear infinite;">autorenew</span> Checking availability…';

        callApi('reservations.php', {
            action: 'hold_date',
            visitDate: getFieldValue('visitDate'),
            checkinHour: checkinHour,
            checkinMinute: checkinMin
        }, function(result) {
            /* Re-enable button regardless of outcome */
            proceedBtn.disabled = false;
            proceedBtn.innerHTML = origText;

            if (!result.ok) {
                /* ---- Date is taken — block transition and alert user ---- */
                alert(result.error || 'Sorry, this date is currently being reserved by another customer. Please pick another date.');

                /* Refresh calendar so the newly locked slot appears reserved */
                loadApprovedReservations();
                return;
            }

            /* ---- Lock acquired — record expiry and proceed to Step 2 ---- */
            holdExpiresAt = result.lockExpires ? new Date(result.lockExpires.replace(' ', 'T')) : null;
            startHoldCountdown();
            stopAvailabilityPoller(); /* no need to poll while user is filling Step 2 */
            stopPreviewRefresh(); /* preview lock is superseded by the hard hold */
            showStep(2);
        });
    });

    var backBtn = document.getElementById('backToStep1');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            /* Release the hold when the user voluntarily goes back */
            stopHoldCountdown();
            callApi('reservations.php', { action: 'release_hold' }, function() {});
            holdExpiresAt = null;
            startAvailabilityPoller(); /* resume live calendar updates on Step 1 */
            showStep(1);
        });
    }
}

/* ---- 15-minute countdown display ---- */
function startHoldCountdown() {
    stopHoldCountdown(); /* clear any previous timer */
    if (!holdExpiresAt) return;

    /* Find or create the hint element — we inject text into #chosenDateHint
       equivalent area inside Step 2 without touching HTML structure.
       We use a dedicated span we append once to the payment section header. */
    var timerEl = document.getElementById('holdTimerDisplay');
    if (!timerEl) {
        /* Create the element only once and insert it before the Step 2 form's first section */
        timerEl = document.createElement('p');
        timerEl.id = 'holdTimerDisplay';
        timerEl.style.cssText = 'font-size:13px;color:#b45309;font-weight:600;margin:0 0 12px;display:flex;align-items:center;gap:6px;';
        var step2 = document.getElementById('bookingStep2');
        var form = document.getElementById('bookingForm');
        if (step2 && form) {
            form.insertBefore(timerEl, form.firstChild);
        }
    }

    holdCountdownTimer = setInterval(function() {
        var msLeft = holdExpiresAt - Date.now();
        if (msLeft <= 0) {
            stopHoldCountdown();
            timerEl.style.display = 'none';
            return;
        }
        var totalSec = Math.ceil(msLeft / 1000);
        var mins = Math.floor(totalSec / 60);
        var secs = totalSec % 60;
        timerEl.innerHTML = '&#128274; Date reserved for you — ' +
            mins + ':' + (secs < 10 ? '0' : '') + secs +
            ' remaining. Complete payment before it expires.';
    }, 500);
}

function stopHoldCountdown() {
    if (holdCountdownTimer) {
        clearInterval(holdCountdownTimer);
        holdCountdownTimer = null;
    }
    var timerEl = document.getElementById('holdTimerDisplay');
    if (timerEl) timerEl.innerHTML = '';
}


/* ============================================================
   PAYMENT PROOF UPLOAD
   ============================================================ */

var uploadedPaymentImageData = '';

function setupPaymentUpload() {
    var dropZone = document.getElementById('paymentDropzone');
    var fileInput = document.getElementById('paymentFile');
    var previewArea = document.getElementById('uploadPreview');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', function() { fileInput.click(); });
    dropZone.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') fileInput.click();
    });

    dropZone.addEventListener('dragover', function(e) { e.preventDefault();
        dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', function() { handleFile(fileInput.files[0]); });

    function handleFile(file) {
        if (!file) return;
        var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.indexOf(file.type) === -1) { showToast('Image only (JPG, PNG, WebP, GIF).', 'error'); return; }
        if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB.', 'error'); return; }

        var reader = new FileReader();
        reader.onload = function(ev) {
            uploadedPaymentImageData = ev.target.result;
            if (previewArea) {
                previewArea.innerHTML =
                    '<img src="' + ev.target.result + '" alt="Payment preview">' +
                    '<div style="flex:1"><div class="upload-file-name">' + file.name + '</div>' +
                    '<div class="upload-file-size">' + (file.size / 1048576).toFixed(2) + ' MB</div></div>' +
                    '<button type="button" onclick="clearPaymentUpload()" class="btn btn-red btn-sm">Remove</button>';
                previewArea.style.display = 'flex';
                dropZone.style.display = 'none';
            }
        };
        reader.readAsDataURL(file);
    }
}

function clearPaymentUpload() {
    var dropZone = document.getElementById('paymentDropzone');
    var previewArea = document.getElementById('uploadPreview');
    var fileInput = document.getElementById('paymentFile');
    if (dropZone) dropZone.style.display = '';
    if (previewArea) { previewArea.style.display = 'none';
        previewArea.innerHTML = ''; }
    if (fileInput) fileInput.value = '';
    uploadedPaymentImageData = '';
}


/* ============================================================
   GCASH SETTINGS  (loaded from the database)
   ============================================================ */

function applyGcashSettings() {
    var gcashNumberEl = document.getElementById('gcashNumber');
    var qrCodeBox = document.getElementById('gcashQrBox');
    if (!gcashNumberEl) return;

    getResortSettings(function(settings) {
        var savedNumber = settings.gcashNumber || '';
        var savedQr = settings.gcashQr || '';

        if (savedNumber) {
            gcashNumberEl.textContent = savedNumber;
            gcashNumberEl.style.color = '';
        } else {
            gcashNumberEl.textContent = 'Not yet configured by admin';
            gcashNumberEl.style.color = 'var(--gray-400)';
        }

        if (qrCodeBox) {
            qrCodeBox.innerHTML = savedQr ?
                '<img src="' + savedQr + '" alt="GCash QR Code" style="width:100%;height:100%;object-fit:contain;border-radius:4px;" />' :
                '<span style="font-size:11px;color:var(--gray-400);text-align:center;line-height:1.4;">QR not yet<br>uploaded</span>';

            qrCodeBox.onclick = function() {
                if (savedQr) openGcashQrLightbox(savedQr, savedNumber);
            };
            qrCodeBox.onkeydown = function(e) {
                if (savedQr && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    openGcashQrLightbox(savedQr, savedNumber);
                }
            };
        }

        var copyBtn = document.getElementById('copyGcashBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                var num = savedNumber.replace(/\s/g, '');
                if (!num) { showToast('No GCash number has been set yet.', 'info'); return; }
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(num).then(function() { showToast('GCash number copied!', 'success'); });
                } else {
                    showToast('Copy manually: ' + num, 'info');
                }
            });
        }
    });
}

function openGcashQrLightbox(qrImage, gcashNumber) {
    var lightbox = document.getElementById('gcashQrLightbox');
    var image = document.getElementById('expandedGcashQr');
    var numberEl = document.getElementById('expandedGcashNumber');
    if (!lightbox || !image) return;

    image.src = qrImage;
    if (numberEl && gcashNumber) {
        numberEl.textContent = gcashNumber;
    }

    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeGcashQrLightbox() {
    var lightbox = document.getElementById('gcashQrLightbox');
    var image = document.getElementById('expandedGcashQr');
    if (!lightbox) return;
    lightbox.classList.remove('active');
    if (image) image.src = '';
    document.body.style.overflow = '';
}

var qrLightboxClose = document.getElementById('gcashQrLightboxClose');
if (qrLightboxClose) qrLightboxClose.addEventListener('click', closeGcashQrLightbox);

var qrLightbox = document.getElementById('gcashQrLightbox');
if (qrLightbox) {
    qrLightbox.addEventListener('click', function(e) {
        if (e.target === qrLightbox) closeGcashQrLightbox();
    });
}

document.addEventListener('keydown', function(e) {
    var lightbox = document.getElementById('gcashQrLightbox');
    if (lightbox && lightbox.classList.contains('active') && e.key === 'Escape') {
        closeGcashQrLightbox();
    }
});


/* ============================================================
   RESERVATION FORM SUBMIT
   ============================================================ */

function setupReservationForm() {
    var bookingForm = document.getElementById('bookingForm');
    var confirmBtn = document.getElementById('confirmAgreementBtn');
    var privacyCheckbox = document.getElementById('agreePrivacy');
    if (!bookingForm) return;

    bookingForm.addEventListener('submit', function(e) {
        e.preventDefault();

        var agreeRules = document.getElementById('agreeRules');
        var rulesAccepted = agreeRules && agreeRules.checked;
        var proofUploaded = uploadedPaymentImageData !== '';
        var textFieldsValid = bookingForm.checkValidity();

        if (!rulesAccepted) {
            showToast('Please read and tick the Payment & Cancellation Rules checkbox.', 'warning');
            if (agreeRules) agreeRules.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        if (!proofUploaded) {
            showToast('Please upload your GCash proof of payment.', 'warning');
            var dz = document.getElementById('paymentDropzone');
            if (dz) dz.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        if (!textFieldsValid) {
            var first = bookingForm.querySelector(':invalid');
            if (first) { first.focus();
                first.scrollIntoView({ behavior: 'smooth', block: 'center' });
                bookingForm.reportValidity(); }
            return;
        }

        if (privacyCheckbox) privacyCheckbox.checked = false;
        openModal('agreementModal');
    });

    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            if (privacyCheckbox && !privacyCheckbox.checked) {
                showToast('Please tick the consent box to continue.', 'warning');
                return;
            }
            submitBookingToDatabase();
        });
    }
}

/* Build the booking object and send it to the PHP API */
function submitBookingToDatabase() {
    var visitDate = getFieldValue('visitDate');
    var chosenPackage = findPackageByRange(getFieldValue('packageChoice'));
    var lpg = document.getElementById('addLpg');
    var lpgChecked = lpg && lpg.checked;
    var isWeekend = isWeekendOrHoliday(visitDate);

    var packageName = chosenPackage ?
        (chosenPackage.rooms + ' Rooms (' + chosenPackage.minPax + '-' + chosenPackage.maxPax + ' pax)') :
        'Package';
    var paxRange = chosenPackage ?
        (chosenPackage.minPax + '-' + chosenPackage.maxPax) :
        getFieldValue('packageChoice');

    var amountDueEl = document.getElementById('calcDue');
    var amountDue = amountDueEl ? amountDueEl.textContent : '--';

    var bookingData = {
        action: 'create',
        firstName: getFieldValue('firstName'),
        lastName: getFieldValue('lastName'),
        email: getFieldValue('email').trim(),
        phone: getFieldValue('phone'),
        visitDate: visitDate,
        visitTime: getFieldValue('visitTime'),
        /* full label like "8:00 PM - 6:00 PM" */
        checkinHour: (function() {
            /* visitTime hidden input stores "7|30|5|30|2026-11-03|2026-11-04"
               parts[0]=checkinHour, parts[1]=checkinMin */
            var parts = (getFieldValue('visitTime') || '').split('|');
            return parts.length >= 1 ? parseInt(parts[0], 10) : 0;
        })(),
        checkinMinute: (function() {
            var parts = (getFieldValue('visitTime') || '').split('|');
            return parts.length >= 2 ? parseInt(parts[1], 10) : 0;
        })(),
        room: packageName,
        rateType: isWeekend ? 'Weekend / Holiday' : 'Weekday',
        pax: paxRange,
        lpg: lpgChecked ? 'Yes (+' + formatAsPesos(LPG_FEE) + ')' : 'No',
        payType: 'down',
        amount: amountDue,
        paymentImage: uploadedPaymentImageData,
        termsAccepted: true
    };

    /* Disable the confirm button while saving */
    var confirmBtn = document.getElementById('confirmAgreementBtn');
    if (confirmBtn) confirmBtn.disabled = true;

    callApi('reservations.php', bookingData, function(result) {
        if (confirmBtn) confirmBtn.disabled = false;

        if (!result.ok) {
            closeModal('agreementModal');
            /* Backend will return the "session expired" message for expired holds */
            showToast(result.error || 'Could not save booking. Please try again.', 'error');

            /* If the hold expired, go back to Step 1 so the user can re-pick */
            if (result.error && result.error.indexOf('expired') !== -1) {
                stopHoldCountdown();
                holdExpiresAt = null;
                setTimeout(function() {
                    startAvailabilityPoller(); /* resume live updates after returning to Step 1 */
                    showStep(1);
                }, 2500);
            }
            return;
        }

        /* ---- Booking saved — clear the hold countdown ---- */
        stopHoldCountdown();
        holdExpiresAt = null;

        /* Fill in the receipt with the returned booking ID */
        var bookingId = result.bookingId;
        setElementText('bookingRefCode', bookingId);
        setElementText('receipt_firstName', bookingData.firstName);
        setElementText('receipt_lastName', bookingData.lastName);
        setElementText('receipt_email', bookingData.email);
        setElementText('receipt_phone', bookingData.phone);
        setElementText('receipt_visitDate', bookingData.visitDate);

        /* Format the time from "6|30|4|30|2026-11-03|2026-11-04"
           into a readable "6:30 AM - 4:30 AM" label */
        var timeParts = (bookingData.visitTime || '').split('|');
        var receiptTime = bookingData.visitTime; /* fallback to raw */
        if (timeParts.length >= 4) {
            receiptTime = formatSlot({ hour: parseInt(timeParts[0], 10), minute: parseInt(timeParts[1], 10) }) +
                ' - ' +
                formatSlot({ hour: parseInt(timeParts[2], 10), minute: parseInt(timeParts[3], 10) });
        }
        setElementText('receipt_visitTime', receiptTime);
        setElementText('receipt_pax', bookingData.pax);
        setElementText('receipt_package', bookingData.room);
        setElementText('receipt_lpg', bookingData.lpg);
        setElementText('receipt_amount', formatAsPesos(result.amount));

        closeModal('agreementModal');
        openModal('successModal');
    });
}


/* ============================================================
   PRE-FILL GUEST FIELDS FROM SESSION
   ============================================================ */

function prefillGuestFields() {
    var emailField = document.getElementById('email');
    var sessionEmail = sessionStorage.getItem('poolside_customer_email') || '';
    if (emailField && !emailField.value) emailField.value = sessionEmail;

    callApi('auth.php', { action: 'get_profile' }, function(result) {
        if (!result.ok) return;
        ['firstName', 'lastName', 'phone'].forEach(function(id) {
            var field = document.getElementById(id);
            if (field && !field.value && result[id]) field.value = result[id];
        });
        if (emailField && result.email &&
            (!emailField.value || emailField.value === sessionEmail)) {
            emailField.value = result.email;
        }
    });
}


/* ============================================================
   PAGE INIT
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
    showStep(1);
    setupPriceSummary();
    loadApprovedReservations(); /* loads data, then calls setupBookingCalendar() */
    setupProceedButton();
    setupTimeSlots();
    setupPaymentUpload();
    setupReservationForm();
    prefillGuestFields();
    applyGcashSettings();
    setupRoomShowcase();

    /* Clear this session's preview lock when the user leaves the page */
    window.addEventListener('beforeunload', function() {
        /* Use sendBeacon for reliable fire-and-forget on page close */
        var payload = JSON.stringify({ action: 'clear_preview' });
        if (navigator.sendBeacon) {
            var blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon('../api/reservations.php', blob);
        }
    });
});


/* ============================================================
   ROOM SHOWCASE
   Shows room photos for the selected package.
   Package → room count mapping:
     1-10  → 2 rooms   (room 1, room 2)
     11-15 → 3 rooms   (room 1 – room 3)
     16-20 → 4 rooms   (room 1 – room 4)
     21-25 → 5 rooms   (room 1 – room 5)
     26-30 → 6 rooms   (room 1 – room 6)
     31-35 → 7 rooms   (room 1 – room 7)

   Images live at:
     ../assets/images/rooms/room N/roomN.jpg
   Room 5 has two images: room5.1.jpg and room5.2.jpg
   ============================================================ */

/* Map each pax-range value to how many rooms are included */
var ROOM_COUNT_MAP = {
    '1-10': 2,
    '11-15': 3,
    '16-20': 4,
    '21-25': 5,
    '26-30': 6,
    '31-35': 7
};

/* All photos per room (path relative to customer/ folder) */
var ROOM_PHOTOS = {
    1: ['../assets/images/rooms/room 1/room1.jpg'],
    2: ['../assets/images/rooms/room 2/room2.jpg'],
    3: ['../assets/images/rooms/room 3/room3.jpg'],
    4: ['../assets/images/rooms/room 4/room4.jpg'],
    5: ['../assets/images/rooms/room 5/room5.1.jpg',
        '../assets/images/rooms/room 5/room5.2.jpg'
    ],
    6: ['../assets/images/rooms/room 6/room6.jpg'],
    7: ['../assets/images/rooms/room 7/room7.jpg']
};

/* ---- Lightbox state ---- */
var _lbPhotos = []; /* flat array of { src, caption } for current session */
var _lbIndex = 0;

function openRoomLightbox(photos, startIndex) {
    _lbPhotos = photos;
    _lbIndex = startIndex || 0;
    _renderLightboxSlide();

    var lb = document.getElementById('roomLightbox');
    if (!lb) return;
    lb.classList.toggle('single-photo', photos.length === 1);
    lb.style.display = ''; /* remove inline display:none set in HTML */
    requestAnimationFrame(function() { lb.classList.add('open'); });
    document.body.style.overflow = 'hidden';
}

function closeRoomLightbox() {
    var lb = document.getElementById('roomLightbox');
    if (!lb) return;
    lb.classList.remove('open');
    document.body.style.overflow = '';
    /* hide after transition ends */
    setTimeout(function() {
        if (!lb.classList.contains('open')) lb.style.display = 'none';
    }, 250);
}

function _renderLightboxSlide() {
    var img = document.getElementById('roomLightboxImg');
    var caption = document.getElementById('roomLightboxCaption');
    if (!img || !_lbPhotos.length) return;
    var photo = _lbPhotos[_lbIndex];
    img.src = photo.src;
    img.alt = photo.caption;
    if (caption) {
        caption.textContent = _lbPhotos.length > 1 ?
            photo.caption + '  (' + (_lbIndex + 1) + ' / ' + _lbPhotos.length + ')' :
            photo.caption;
    }
}

function _lbNext() {
    if (!_lbPhotos.length) return;
    _lbIndex = (_lbIndex + 1) % _lbPhotos.length;
    _renderLightboxSlide();
}

function _lbPrev() {
    if (!_lbPhotos.length) return;
    _lbIndex = (_lbIndex - 1 + _lbPhotos.length) % _lbPhotos.length;
    _renderLightboxSlide();
}

/* ---- Build the room grid ---- */
function renderRoomShowcase(roomCount) {
    var showcase = document.getElementById('roomShowcase');
    var grid = document.getElementById('roomShowcaseGrid');
    var sub = document.getElementById('roomShowcaseSub');
    if (!showcase || !grid) return;

    if (!roomCount || roomCount < 1) {
        showcase.style.display = 'none';
        return;
    }

    /* Update subtitle */
    if (sub) sub.textContent = roomCount + ' room' + (roomCount > 1 ? 's' : '') + ' included in this package. Tap any photo to enlarge.';

    /* Build a flat list of ALL photos across all included rooms (for lightbox prev/next) */
    var allPhotos = [];
    for (var r = 1; r <= roomCount; r++) {
        var imgs = ROOM_PHOTOS[r] || [];
        for (var i = 0; i < imgs.length; i++) {
            allPhotos.push({
                src: imgs[i],
                caption: 'Room ' + r + (imgs.length > 1 ? ' — Photo ' + (i + 1) : '')
            });
        }
    }

    /* Build card HTML */
    var html = '';
    var photoOffset = 0; /* index into allPhotos for the first photo of this room */
    for (var room = 1; room <= roomCount; room++) {
        var roomImgs = ROOM_PHOTOS[room] || [];
        var coverSrc = roomImgs[0] || '';
        var multiTag = roomImgs.length > 1 ?
            '<span class="room-card-badge">+' + (roomImgs.length - 1) + ' more</span>' :
            '';
        var offset = photoOffset; /* capture for closure */

        html += '<div class="room-card" tabindex="0" role="button"' +
            ' aria-label="View Room ' + room + ' photos"' +
            ' data-photo-offset="' + offset + '">' +
            '<div class="room-card-thumb">' +
            '<img src="' + coverSrc + '" alt="Room ' + room + '" loading="lazy" />' +
            multiTag +
            '</div>' +
            '<div class="room-card-label">Room ' + room + '</div>' +
            '</div>';

        photoOffset += roomImgs.length;
    }

    grid.innerHTML = html;

    /* Attach click/keyboard handlers to each card */
    var cards = grid.querySelectorAll('.room-card');
    cards.forEach(function(card) {
        var startIndex = parseInt(card.getAttribute('data-photo-offset'), 10);

        function activate() { openRoomLightbox(allPhotos, startIndex); }

        card.addEventListener('click', activate);
        card.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault();
                activate(); }
        });
    });

    /* Show with animation */
    showcase.style.display = '';
    showcase.style.animation = 'none';
    requestAnimationFrame(function() {
        showcase.style.animation = '';
    });
}

/* ---- Wire up the package dropdown ---- */
function setupRoomShowcase() {
    var packageSelect = document.getElementById('packageChoice');
    if (!packageSelect) return;

    /* Lightbox button wiring */
    var closeBtn = document.getElementById('roomLightboxClose');
    var prevBtn = document.getElementById('roomLightboxPrev');
    var nextBtn = document.getElementById('roomLightboxNext');
    var lb = document.getElementById('roomLightbox');

    if (closeBtn) closeBtn.addEventListener('click', closeRoomLightbox);
    if (prevBtn) prevBtn.addEventListener('click', _lbPrev);
    if (nextBtn) nextBtn.addEventListener('click', _lbNext);

    /* Close on backdrop click */
    if (lb) {
        lb.addEventListener('click', function(e) {
            if (e.target === lb) closeRoomLightbox();
        });
    }

    /* Keyboard navigation */
    document.addEventListener('keydown', function(e) {
        var lightbox = document.getElementById('roomLightbox');
        if (!lightbox || !lightbox.classList.contains('open')) return;
        if (e.key === 'Escape') { closeRoomLightbox(); }
        if (e.key === 'ArrowRight') { _lbNext(); }
        if (e.key === 'ArrowLeft') { _lbPrev(); }
    });

    /* Render on change */
    packageSelect.addEventListener('change', function() {
        var roomCount = ROOM_COUNT_MAP[packageSelect.value] || 0;
        renderRoomShowcase(roomCount);
    });

    /* Handle page reload with a pre-selected value */
    if (packageSelect.value) {
        renderRoomShowcase(ROOM_COUNT_MAP[packageSelect.value] || 0);
    }
}