/* ============================================================
   reservation-history.js — Reservation History Page Logic
   ============================================================ */

var allBookingsData = [];
var currentFilterStatus = 'all';
var currentSearchQuery = '';
var currentDateFrom = '';
var currentDateTo = '';
var currentReceiptBooking = null;
var LPG_PRICE = 500;

/* ---- Peso formatter ---- */
function pesoFmt(n) {
    var v = parseFloat(n || 0);
    return '₱' + (isNaN(v) ? '0.00' : v.toLocaleString('en-PH', { minimumFractionDigits: 2 }));
}

function phpTextFmt(n) {
    var v = parseFloat(n || 0);
    return 'PHP ' + (isNaN(v) ? '0.00' : v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

/* ---- Escape helpers ---- */
function esc(v) { return String(v || '').replace(/'/g, "\\'"); }

function escHtml(v) {
    return String(v || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ---- Does this booking have LPG? ---- */
function hasLpg(item) {
    return (item.lpg || '').toString().toLowerCase().indexOf('yes') === 0;
}

function formatLongDate(dateStr) {
    if (!dateStr) return '--';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

document.addEventListener('DOMContentLoaded', function() {
    var urlParams = new URLSearchParams(window.location.search);
    var statusParam = urlParams.get('status');
    if (statusParam) currentFilterStatus = statusParam.toLowerCase();

    updateActiveFilterTabUI(currentFilterStatus);

    document.querySelectorAll('.filter-btn, [data-filter]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            currentFilterStatus = (this.getAttribute('data-filter') || this.textContent.trim()).toLowerCase();
            updateActiveFilterTabUI(currentFilterStatus);
            renderBookingsTable();
        });
    });

    var searchInput = document.getElementById('historySearchInput');
    var dateFromEl = document.getElementById('historyDateFrom');
    var dateToEl = document.getElementById('historyDateTo');
    var clearBtn = document.getElementById('historyClearFiltersBtn');

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            currentSearchQuery = this.value.trim().toLowerCase();
            renderBookingsTable();
        });
    }

    if (dateFromEl) {
        dateFromEl.addEventListener('change', function() {
            currentDateFrom = this.value;
            renderBookingsTable();
        });
    }

    if (dateToEl) {
        dateToEl.addEventListener('change', function() {
            currentDateTo = this.value;
            renderBookingsTable();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            currentFilterStatus = 'all';
            currentSearchQuery = '';
            currentDateFrom = '';
            currentDateTo = '';
            if (searchInput) searchInput.value = '';
            if (dateFromEl) dateFromEl.value = '';
            if (dateToEl) dateToEl.value = '';
            updateActiveFilterTabUI('all');
            renderBookingsTable();
        });
    }

    var pngBtn = document.getElementById('downloadReceiptPngBtn');
    if (pngBtn) {
        pngBtn.addEventListener('click', function() {
            if (currentReceiptBooking) downloadReceiptAsPng(currentReceiptBooking);
        });
    }

    var pdfBtn = document.getElementById('downloadReceiptPdfBtn');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', function() {
            if (currentReceiptBooking) downloadReceiptAsPdf(currentReceiptBooking);
        });
    }

    loadReservationHistory();
});

function updateActiveFilterTabUI(targetStatus) {
    document.querySelectorAll('.filter-btn, [data-filter]').forEach(function(btn) {
        var v = (btn.getAttribute('data-filter') || btn.textContent.trim()).toLowerCase();
        btn.classList.toggle('active', v === targetStatus);
        btn.style.backgroundColor = v === targetStatus ? 'var(--sky)' : 'transparent';
        btn.style.color = v === targetStatus ? '#ffffff' : 'var(--sky)';
    });
}

function loadReservationHistory() {
    var tbody = document.getElementById('historyTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;padding:20px;color:var(--gray-400);">Loading...</td></tr>';

    callApi('reservations.php', { action: 'all_list' }, function(res) {
        if (res && res.ok && Array.isArray(res.bookings)) {
            allBookingsData = res.bookings;
            renderBookingsTable();
        } else {
            if (tbody) tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;padding:20px;color:var(--gray-400);">Failed to load reservation history.</td></tr>';
        }
    });
}

function renderBookingsTable() {
    var tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    var filtered = allBookingsData.filter(function(b) {
        /* 1. Status filter */
        if (currentFilterStatus !== 'all' && (b.status || '').toLowerCase() !== currentFilterStatus) {
            return false;
        }

        /* 2. Visit Date range filter (YYYY-MM-DD) */
        var visitDate = String(b.visit_date || '').slice(0, 10);
        if (currentDateFrom && (!visitDate || visitDate < currentDateFrom)) {
            return false;
        }
        if (currentDateTo && (!visitDate || visitDate > currentDateTo)) {
            return false;
        }

        /* 3. Keyword search filter */
        if (currentSearchQuery) {
            var fullName = ((b.first_name || b.guest_name || '') + ' ' + (b.last_name || '')).trim();
            var haystack = [
                b.id,
                b.reference,
                fullName,
                b.email,
                b.phone,
                b.room,
                b.pax,
                b.visit_date,
                b.status
            ].join(' ').toLowerCase();

            if (haystack.indexOf(currentSearchQuery) === -1) {
                return false;
            }
        }

        return true;
    });

    var countPill = document.getElementById('historyResultCount');
    if (countPill) {
        countPill.textContent = 'Showing ' + filtered.length + ' of ' + allBookingsData.length;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;padding:20px;color:var(--gray-400);">No matching reservations found.</td></tr>';
        return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
        var item = filtered[i];
        var statusLower = (item.status || '').toLowerCase();
        var refCode = item.id || item.reference || '';
        var rawProof = item.payment_image || '';

        var statusBadge =
            statusLower === 'approved' ? '<span class="badge badge-green">Approved</span>' :
            statusLower === 'pending' ? '<span class="badge badge-yellow">Pending</span>' :
            '<span class="badge badge-red">' + escHtml(item.status || 'Declined') + '</span>';

        var lpgHas = hasLpg(item);
        var lpgCell = lpgHas ?
            '<span style="display:inline-flex;align-items:center;gap:3px;background:#fef3c7;color:#92400e;border-radius:12px;padding:2px 8px;font-size:12px;font-weight:700;">&#128293; Yes (+' + pesoFmt(LPG_PRICE) + ')</span>' :
            '<span style="color:#9ca3af;">—</span>';

        var totalPrice = parseFloat(item.total || 0);
        var downpayment = parseFloat(item.amount || 0);
        var balance = parseFloat(item.balance_amount || (totalPrice - downpayment) || 0);
        var walkinPaid = parseFloat(item.walkin_payment || 0);
        var downCell = pesoFmt(downpayment);

        var walkinCell = '<span style="color:#aaa;">—</span>';
        if (statusLower === 'approved') {
            var isFullyPaid = walkinPaid > 0;
            if (isFullyPaid) {
                walkinCell =
                    '<div style="display:flex;align-items:center;gap:6px;">' +
                    '<span style="font-weight:700;color:#1e5138;">' + pesoFmt(walkinPaid) + '</span>' +
                    '<span style="display:inline-flex;align-items:center;gap:3px;background:#d4edda;color:#1e5138;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;">' +
                    '<span class="material-icons" style="font-size:13px;">check_circle</span> Fully Paid' +
                    '</span>' +
                    '</div>';
            } else {
                walkinCell =
                    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                    '<span style="font-weight:600;color:#374151;">' + pesoFmt(balance) + '</span>' +
                    '<button type="button" ' +
                    'onclick="confirmMarkPaid(\'' + esc(refCode) + '\',' + balance + ')" ' +
                    'style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;background:#1e5138;color:#fff;border:none;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">' +
                    '<span class="material-icons" style="font-size:13px;">check</span> Mark as Paid' +
                    '</button>' +
                    '</div>';
            }
        }

        var proofBtn = '<button type="button" class="btn btn-sm btn-outline" style="border-radius:20px;padding:4px 10px;font-weight:600;" ' +
            'onclick="viewProofModal(\'' + esc(refCode) + '\',\'' + esc(rawProof) + '\')">' +
            '<span class="material-icons" style="font-size:14px;vertical-align:middle;margin-right:2px;">visibility</span> View</button>';

        var receiptBtn = '<span style="color:#aaa;">—</span>';
        if (statusLower === 'approved') {
            receiptBtn = '<button type="button" class="btn btn-sm btn-sky" style="border-radius:20px;padding:4px 11px;font-weight:600;white-space:nowrap;" ' +
                'onclick="openOfficialReceiptModal(\'' + esc(refCode) + '\')">' +
                '<span class="material-icons" style="font-size:14px;vertical-align:middle;margin-right:3px;">receipt_long</span> Receipt</button>';
        }

        html +=
            '<tr>' +
            '<td><b style="font-family:monospace;color:var(--sky-darker);">' + escHtml(item.id || '--') + '</b></td>' +
            '<td>' + escHtml(((item.first_name || item.guest_name || '') + ' ' + (item.last_name || '')).trim()) + '</td>' +
            '<td>' + escHtml(item.email || '--') + '</td>' +
            '<td>' + escHtml(item.phone || '--') + '</td>' +
            '<td>' + escHtml(item.visit_date || '--') + '</td>' +
            '<td>' + escHtml(item.visit_time || '--') + '</td>' +
            '<td>' + escHtml(item.room || '--') + '</td>' +
            '<td>' + escHtml(item.pax || '--') + '</td>' +
            '<td>' + lpgCell + '</td>' +
            '<td>' + pesoFmt(totalPrice) + '</td>' +
            '<td>' + downCell + '</td>' +
            '<td>' + walkinCell + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + escHtml(item.booked_at || '--') + '</td>' +
            '<td>' + proofBtn + '</td>' +
            '<td>' + receiptBtn + '</td>' +
            '</tr>';
    }

    tbody.innerHTML = html;
}

/* ============================================================
   OFFICIAL EMAILED RECEIPT MODAL (PREVIEW + PNG + PDF)
   ============================================================ */
function openOfficialReceiptModal(bookingId) {
    var found = null;
    for (var i = 0; i < allBookingsData.length; i++) {
        if ((allBookingsData[i].id || allBookingsData[i].reference) === bookingId) {
            found = allBookingsData[i];
            break;
        }
    }
    if (!found) {
        showToast('Reservation details not found.', 'error');
        return;
    }

    currentReceiptBooking = found;

    var guestName = ((found.first_name || found.guest_name || '') + ' ' + (found.last_name || '')).trim() || 'Customer';
    var refCode = found.id || found.reference || '--';
    var visitDate = formatLongDate(found.visit_date);
    var lpgSelected = hasLpg(found);
    var lpgFee = lpgSelected ? LPG_PRICE : 0;
    var totalPrice = parseFloat(found.total || 0);
    var downpayment = parseFloat(found.amount || 0);
    var balance = parseFloat(found.balance_amount || (totalPrice - downpayment) || 0);
    var pkgSubtotal = Math.max(0, totalPrice - lpgFee);
    var reviewer = sessionStorage.getItem(ADMIN_SESSION.name) || 'Poolside Villa Staff';
    var emailStatus = found.confirmation_email_sent_at ?
        'Sent on ' + escHtml(found.confirmation_email_sent_at) :
        'Issued upon approval';

    var previewEl = document.getElementById('officialReceiptPreviewBody');
    if (previewEl) {
        previewEl.innerHTML =
            '<div class="or-header">' +
            '<img src="../assets/images/receipt-logo.jpg" alt="Poolside Villa" onerror="this.src=\'../assets/images/logo.png\';" />' +
            '<div>' +
            '<div class="or-kicker">PAYMENT RECEIPT</div>' +
            '<div class="or-title">Reservation Receipt</div>' +
            '<span class="or-badge">APPROVED - DOWN PAYMENT RECEIVED</span>' +
            '</div>' +
            '</div>' +
            '<div class="or-body">' +
            '<div class="or-ref-row">' +
            '<span class="or-ref-label">BOOKING REFERENCE</span>' +
            '<span class="or-ref-val">' + escHtml(refCode) + '</span>' +
            '</div>' +
            '<div class="or-detail-row"><span class="or-detail-label">Customer</span><span class="or-detail-val">' + escHtml(guestName) + '</span></div>' +
            '<div class="or-detail-row"><span class="or-detail-label">Customer Email</span><span class="or-detail-val">' + escHtml(found.email || '--') + '</span></div>' +
            '<div class="or-detail-row"><span class="or-detail-label">Visit Date</span><span class="or-detail-val">' + escHtml(visitDate) + '</span></div>' +
            '<div class="or-detail-row"><span class="or-detail-label">Time</span><span class="or-detail-val">' + escHtml(found.visit_time || '--') + '</span></div>' +
            '<div class="or-detail-row"><span class="or-detail-label">Package</span><span class="or-detail-val">' + escHtml(found.room || '--') + '</span></div>' +
            '<div class="or-detail-row"><span class="or-detail-label">Guests</span><span class="or-detail-val">' + escHtml(found.pax || '--') + '</span></div>' +
            '<div class="or-detail-row"><span class="or-detail-label">Email Status</span><span class="or-detail-val">' + emailStatus + '</span></div>' +
            '<div class="or-detail-row"><span class="or-detail-label">Generated By</span><span class="or-detail-val">' + escHtml(reviewer) + '</span></div>' +
            '<div class="or-comp-box">' +
            '<div class="or-comp-title">PRICE COMPUTATION</div>' +
            '<div class="or-comp-row"><span>Package subtotal</span><span class="or-comp-amount">' + phpTextFmt(pkgSubtotal) + '</span></div>' +
            '<div class="or-comp-row"><span>LPG add-on ' + (lpgSelected ? '(+PHP 500.00)' : '(not selected)') + '</span><span class="or-comp-amount">' + phpTextFmt(lpgFee) + '</span></div>' +
            '<div class="or-comp-row bold"><span>Total reservation cost</span><span class="or-comp-amount">' + phpTextFmt(totalPrice) + '</span></div>' +
            '<div class="or-comp-row bold"><span>Down payment paid</span><span class="or-comp-amount">' + phpTextFmt(downpayment) + '</span></div>' +
            '<div class="or-comp-row bold"><span>Remaining balance due</span><span class="or-comp-amount">' + phpTextFmt(balance) + '</span></div>' +
            '</div>' +
            '<div class="or-footer">' +
            '<div><strong style="color:#1a3d2b;">Thank you for choosing Poolside Villa.</strong><br>Official reservation receipt record.</div>' +
            '<div style="font-weight:800; color:#2d6a4f; letter-spacing:0.6px;">POOLSIDE VILLA</div>' +
            '</div>' +
            '</div>';
    }

    var modal = document.getElementById('officialReceiptModal');
    if (modal) modal.style.display = 'flex';
}

function closeOfficialReceiptModal() {
    currentReceiptBooking = null;
    var modal = document.getElementById('officialReceiptModal');
    if (modal) modal.style.display = 'none';
}

function downloadReceiptAsPng(booking) {
    var canvas = document.createElement('canvas');
    var scale = 2;
    var W = 720;
    var H = 980;
    canvas.width = W * scale;
    canvas.height = H * scale;

    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    var refCode = booking.id || booking.reference || 'RECEIPT';
    var guestName = ((booking.first_name || booking.guest_name || '') + ' ' + (booking.last_name || '')).trim() || 'Customer';
    var visitDate = formatLongDate(booking.visit_date);
    var lpgSelected = hasLpg(booking);
    var lpgFee = lpgSelected ? LPG_PRICE : 0;
    var totalPrice = parseFloat(booking.total || 0);
    var downpayment = parseFloat(booking.amount || 0);
    var balance = parseFloat(booking.balance_amount || (totalPrice - downpayment) || 0);
    var pkgSubtotal = Math.max(0, totalPrice - lpgFee);
    var reviewer = sessionStorage.getItem(ADMIN_SESSION.name) || 'Poolside Villa';

    function renderCanvas(logoImg) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#f5f3ee';
        ctx.fillRect(0, 0, W, 175);

        ctx.fillStyle = '#1a3d2b';
        ctx.fillRect(0, 0, W, 8);
        ctx.fillStyle = '#2d6a4f';
        ctx.fillRect(0, 172, W, 3);

        var headerX = 44;
        if (logoImg) {
            var lw = 190;
            var lh = lw * (logoImg.height / logoImg.width);
            if (lh > 110) {
                lh = 110;
                lw = lh * (logoImg.width / logoImg.height);
            }
            ctx.drawImage(logoImg, 44, (175 - lh) / 2, lw, lh);
            headerX = 44 + lw + 28;
        }

        ctx.fillStyle = '#b8943a';
        ctx.font = 'bold 12px Arial, sans-serif';
        ctx.fillText('PAYMENT RECEIPT', headerX, 52);

        ctx.fillStyle = '#1a3d2b';
        ctx.font = 'bold 28px Arial, sans-serif';
        ctx.fillText('Reservation Receipt', headerX, 88);

        ctx.fillStyle = '#e8f3ee';
        ctx.fillRect(headerX, 105, 255, 28);
        ctx.fillStyle = '#2d6a4f';
        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillText('APPROVED - DOWN PAYMENT RECEIVED', headerX + 12, 123);

        ctx.fillStyle = '#635d53';
        ctx.font = 'bold 12px Arial, sans-serif';
        ctx.fillText('BOOKING REFERENCE', 44, 218);

        ctx.fillStyle = '#1a3d2b';
        ctx.font = 'bold 21px monospace';
        ctx.fillText(refCode, 235, 220);

        ctx.fillStyle = '#dee8e3';
        ctx.fillRect(44, 240, W - 88, 1.5);

        var rows = [
            ['CUSTOMER', guestName],
            ['EMAIL', booking.email || '--'],
            ['VISIT DATE', visitDate],
            ['TIME', booking.visit_time || '--'],
            ['PACKAGE', booking.room || '--'],
            ['GUESTS', booking.pax || '--'],
            ['ISSUED BY', reviewer]
        ];

        var y = 278;
        for (var i = 0; i < rows.length; i++) {
            ctx.fillStyle = '#635d53';
            ctx.font = 'bold 11px Arial, sans-serif';
            ctx.fillText(rows[i][0], 44, y);

            ctx.fillStyle = '#28251f';
            ctx.font = '600 14px Arial, sans-serif';
            ctx.fillText(String(rows[i][1]), 235, y);

            ctx.fillStyle = '#ebf0ed';
            ctx.fillRect(44, y + 15, W - 88, 1);
            y += 46;
        }

        var boxTop = y + 12;
        ctx.fillStyle = '#e8f3ee';
        ctx.fillRect(44, boxTop, W - 88, 225);

        ctx.fillStyle = '#2d6a4f';
        ctx.font = 'bold 13px Arial, sans-serif';
        ctx.fillText('PRICE COMPUTATION', 66, boxTop + 30);

        var payRows = [
            ['Package subtotal', phpTextFmt(pkgSubtotal), false],
            ['LPG add-on ' + (lpgSelected ? '(+PHP 500.00)' : '(not selected)'), phpTextFmt(lpgFee), false],
            ['Total reservation cost', phpTextFmt(totalPrice), true],
            ['Down payment paid', phpTextFmt(downpayment), true],
            ['Remaining balance due', phpTextFmt(balance), true]
        ];

        var py = boxTop + 64;
        for (var j = 0; j < payRows.length; j++) {
            ctx.fillStyle = '#28251f';
            ctx.font = (payRows[j][2] ? 'bold ' : '') + '13px Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(payRows[j][0], 66, py);

            ctx.fillStyle = '#1a3d2b';
            ctx.font = 'bold 13px Arial, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(payRows[j][1], W - 66, py);
            py += 32;
        }
        ctx.textAlign = 'left';

        var footerY = H - 58;
        ctx.fillStyle = '#1a3d2b';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.fillText('Thank you for choosing Poolside Villa.', 44, footerY);

        ctx.fillStyle = '#635d53';
        ctx.font = '12px Arial, sans-serif';
        ctx.fillText('Please keep this receipt for your records.', 44, footerY + 20);

        ctx.fillStyle = '#2d6a4f';
        ctx.font = 'bold 12px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('POOLSIDE VILLA', W - 44, footerY + 20);
        ctx.textAlign = 'left';

        var safeRef = String(refCode).replace(/[^A-Za-z0-9_-]/g, '-');
        var link = document.createElement('a');
        link.download = 'Poolside-Villa-Receipt-' + safeRef + '.png';
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        link.remove();

        showToast('Receipt downloaded as PNG!', 'success');
    }

    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() { renderCanvas(img); };
    img.onerror = function() { renderCanvas(null); };
    img.src = '../assets/images/receipt-logo.jpg';
}

function downloadReceiptAsPdf(booking) {
    var bookingId = booking.id || booking.reference || '';
    var btn = document.getElementById('downloadReceiptPdfBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons" style="font-size:15px;">hourglass_empty</span> Generating...';
    }

    callApi('reservations.php', {
        action: 'download_receipt_pdf',
        bookingId: bookingId
    }, function(res) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons" style="font-size:15px;">picture_as_pdf</span> Download PDF';
        }

        if (!res || !res.ok || !res.pdfBase64) {
            showToast((res && res.error) || 'Could not generate PDF receipt.', 'error');
            return;
        }

        var byteChars = atob(res.pdfBase64);
        var byteNumbers = new Array(byteChars.length);
        for (var i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
        }
        var byteArray = new Uint8Array(byteNumbers);
        var blob = new Blob([byteArray], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);

        var link = document.createElement('a');
        link.href = url;
        link.download = res.filename || ('Poolside-Villa-Receipt-' + bookingId + '.pdf');
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

        showToast('Receipt downloaded as PDF!', 'success');
    });
}

function confirmMarkPaid(bookingId, balanceAmount) {
    showActionConfirm(
        'Confirm walk-in balance payment of ' + pesoFmt(balanceAmount) + ' for reservation ' + bookingId + '?\n\nThis will mark the reservation as fully paid.',
        'Yes, Mark as Paid',
        function() { doMarkPaid(bookingId); },
        'btn-sky'
    );
}

function doMarkPaid(bookingId) {
    callApi('reservations.php', {
        action: 'save_walkin_payment',
        bookingId: bookingId
    }, function(result) {
        if (!result.ok) {
            showToast(result.error || 'Could not save payment.', 'error');
            return;
        }
        showToast('Walk-in payment recorded. Reservation is now fully paid!', 'success');
        loadReservationHistory();
    });
}

function viewProofModal(bookingId, inlineImage) {
    var modal = document.getElementById('proofModal');
    var modalImg = document.getElementById('proofModalImg');
    if (!modal || !modalImg) return;

    modalImg.style.cssText = 'display:block;margin:16px auto;padding:12px;background:#fff;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,.15);max-width:90%;max-height:80vh;object-fit:contain;';
    modal.style.display = 'flex';

    if (inlineImage && inlineImage !== 'undefined' && inlineImage !== 'null' && inlineImage.trim()) {
        var src = inlineImage;
        if (!src.startsWith('http') && !src.startsWith('/') && !src.startsWith('../') && !src.startsWith('data:')) {
            src = '../uploads/' + src;
        }
        modalImg.src = src;
        return;
    }

    callApi('reservations.php', { action: 'get_one', bookingId: bookingId }, function(res) {
        if (res && res.ok && res.booking && res.booking.payment_image) {
            var imgSrc = res.booking.payment_image;
            if (!imgSrc.startsWith('http') && !imgSrc.startsWith('/') && !imgSrc.startsWith('../') && !imgSrc.startsWith('data:')) {
                imgSrc = '../uploads/' + imgSrc;
            }
            modalImg.src = imgSrc;
        } else {
            alert('No payment proof image found for: ' + bookingId);
            closeProofModal();
        }
    });
}

function closeProofModal() {
    var modal = document.getElementById('proofModal');
    if (modal) modal.style.display = 'none';
}