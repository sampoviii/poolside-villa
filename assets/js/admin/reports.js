/* ============================================================
   Reports page
   Loads reservation totals for a selected month or year, shows
   them in a table, and lets the admin download CSV or PDF files.
   ============================================================ */

// Keep the report data and its display label for the table and exports.
var reportBookings = [];
var reportPeriodLabel = '';

// Fill the year selector and connect the report and download buttons.
document.addEventListener('DOMContentLoaded', function() {
    var periodSelect = document.getElementById('reportPeriod');
    var monthSelect = document.getElementById('reportMonth');
    var yearSelect = document.getElementById('reportYear');
    var currentDate = new Date();
    var currentYear = currentDate.getFullYear();

    for (var year = currentYear; year >= 2000; year--) {
        var option = document.createElement('option');
        option.value = String(year);
        option.textContent = String(year);
        yearSelect.appendChild(option);
    }

    monthSelect.value = String(currentDate.getMonth() + 1);
    periodSelect.addEventListener('change', updateReportPeriodControls);
    document.getElementById('generateReportBtn').addEventListener('click', generateReport);
    document.getElementById('downloadCsvBtn').addEventListener('click', downloadReportCsv);
    document.getElementById('downloadPdfBtn').addEventListener('click', downloadReportPdf);
    updateReportPeriodControls();
    generateReport();
});

function updateReportPeriodControls() {
    var isMonthly = document.getElementById('reportPeriod').value === 'monthly';
    document.getElementById('monthField').hidden = !isMonthly;
}

// Ask the API for the selected period, then update the page with its results.
function generateReport() {
    var period = document.getElementById('reportPeriod').value;
    var year = Number(document.getElementById('reportYear').value);
    var month = Number(document.getElementById('reportMonth').value);
    var generateButton = document.getElementById('generateReportBtn');

    generateButton.disabled = true;
    document.getElementById('reportRowCount').textContent = 'Loading...';
    renderReportMessage('Loading report...');
    document.getElementById('downloadCsvBtn').disabled = true;
    document.getElementById('downloadPdfBtn').disabled = true;

    callApi('reservations.php', {
        action: 'transaction_report',
        period: period,
        year: year,
        month: month
    }, function(result) {
        generateButton.disabled = false;
        if (!result || !result.ok || !Array.isArray(result.bookings)) {
            reportBookings = [];
            renderReport();
            renderReportMessage(result && result.error ? result.error : 'Could not load the transaction report.');
            showToast(result && result.error ? result.error : 'Could not load the transaction report.', 'error');
            return;
        }

        reportBookings = result.bookings;
        reportPeriodLabel = period === 'monthly'
            ? monthName(month) + ' ' + year
            : String(year);
        renderReport();
        document.getElementById('downloadCsvBtn').disabled = false;
        document.getElementById('downloadPdfBtn').disabled = false;
    });
}

// Calculate the summary figures and build safe table cells from the response.
function renderReport() {
    var approvedCount = 0;
    var approvedValue = 0;
    var paymentsReceived = 0;
    var tbody = document.getElementById('reportTableBody');

    reportBookings.forEach(function(booking) {
        if (isApproved(booking.payment_status)) {
            approvedCount++;
            approvedValue += Number(booking.total_amount) || 0;
            paymentsReceived += Number(booking.amount_submitted) || 0;
        }
    });

    document.getElementById('reportCount').textContent = String(reportBookings.length);
    document.getElementById('reportRowCount').textContent =
        reportBookings.length + (reportBookings.length === 1 ? ' record' : ' records');
    document.getElementById('reportApproved').textContent = String(approvedCount);
    document.getElementById('reportValue').textContent = formatReportMoney(approvedValue);
    document.getElementById('reportCollected').textContent = formatReportMoney(paymentsReceived);

    if (!reportBookings.length) {
        renderReportMessage('No transactions found for this period.');
        return;
    }

    tbody.textContent = '';
    reportBookings.forEach(function(booking) {
        var row = document.createElement('tr');
        row.className = 'report-transaction-row';

        var dateCell = document.createElement('td');
        dateCell.className = 'report-date-cell';
        var dateParts = formatReportDate(booking.booked_at).split(' ');
        var dateText = document.createElement('span');
        dateText.className = 'report-date-main';
        dateText.textContent = dateParts[0] || '--';
        var timeText = document.createElement('span');
        timeText.className = 'report-date-time';
        timeText.textContent = dateParts[1] || '';
        dateCell.appendChild(dateText);
        dateCell.appendChild(timeText);
        row.appendChild(dateCell);

        var referenceCell = document.createElement('td');
        referenceCell.className = 'report-reference';
        referenceCell.textContent = booking.reference || '--';
        row.appendChild(referenceCell);

        [
            booking.guest_name || '--',
            booking.visit_date || '--',
            booking.package_name || '--',
            booking.pax || '--'
        ].forEach(function(value) {
            var cell = document.createElement('td');
            cell.textContent = value;
            row.appendChild(cell);
        });

        var totalCell = document.createElement('td');
        totalCell.className = 'report-money';
        totalCell.textContent = formatReportMoney(booking.total_amount);
        row.appendChild(totalCell);

        var paidCell = document.createElement('td');
        paidCell.className = 'report-money report-paid';
        paidCell.textContent = formatReportMoney(booking.amount_submitted);
        row.appendChild(paidCell);

        var statusCell = document.createElement('td');
        var statusBadge = document.createElement('span');
        statusBadge.className = 'report-status-badge ' + reportStatusClass(booking.payment_status);
        statusBadge.textContent = booking.payment_status || 'Pending Verification';
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);

        tbody.appendChild(row);
    });
}

function renderReportMessage(message) {
    var tbody = document.getElementById('reportTableBody');
    var row = document.createElement('tr');
    var cell = document.createElement('td');
    cell.className = 'report-empty-cell';
    cell.colSpan = 9;
    cell.textContent = message;
    row.appendChild(cell);
    tbody.replaceChildren(row);
}

// Map each reservation status to the matching badge style in the table.
function reportStatusClass(status) {
    var normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return 'report-status-approved';
    if (normalized.indexOf('reject') !== -1 || normalized.indexOf('declin') !== -1) return 'report-status-declined';
    return 'report-status-pending';
}

// Export the same report figures and rows as a spreadsheet-friendly CSV file.
function downloadReportCsv() {
    var rows = [
        ['Report period', reportPeriodLabel],
        ['Transactions', reportBookings.length],
        ['Approved reservations', reportBookings.filter(function(booking) { return isApproved(booking.payment_status); }).length],
        ['Approved booking value', getApprovedValue()],
        ['Payments received (approved reservations)', getPaymentsReceived()],
        [],
        ['Booked on', 'Reference', 'Guest', 'Visit date', 'Package', 'Guests', 'Total amount', 'Payment submitted', 'Payment status']
    ];

    reportBookings.forEach(function(booking) {
        rows.push([
            booking.booked_at || '',
            booking.reference || '',
            booking.guest_name || '',
            booking.visit_date || '',
            booking.package_name || '',
            booking.pax || '',
            Number(booking.total_amount) || 0,
            Number(booking.amount_submitted) || 0,
            booking.payment_status || 'Pending Verification'
        ]);
    });

    var csv = '\uFEFF' + rows.map(function(row) {
        return row.map(csvCell).join(',');
    }).join('\r\n');
    downloadReportFile(csv, 'poolside-villa-transactions-' + periodFileSuffix() + '.csv', 'text/csv;charset=utf-8');
}

// Build a formatted landscape PDF directly in the browser and download it.
function downloadReportPdf() {
    downloadReportFile(createTextPdf(), 'poolside-villa-transactions-' + periodFileSuffix() + '.pdf', 'application/pdf');
}

// Split long values into lines, paginate the rows, and assemble a readable PDF.
function createTextPdf() {
    var pageWidth = 792;
    var pageHeight = 612;
    var margin = 36;
    var tableColumns = [
        { label: 'DATE BOOKED', width: 88, value: function(booking) { return formatReportDate(booking.booked_at); } },
        { label: 'REFERENCE', width: 75, value: function(booking) { return booking.reference || '--'; } },
        { label: 'GUEST', width: 95, value: function(booking) { return booking.guest_name || '--'; } },
        { label: 'VISIT DATE', width: 68, value: function(booking) { return booking.visit_date || '--'; } },
        { label: 'PACKAGE', width: 93, value: function(booking) { return booking.package_name || '--'; } },
        { label: 'PAX', width: 45, value: function(booking) { return booking.pax || '--'; } },
        { label: 'TOTAL', width: 77, value: function(booking) { return formatPdfMoney(booking.total_amount); } },
        { label: 'PAID', width: 77, value: function(booking) { return formatPdfMoney(booking.amount_submitted); } },
        { label: 'STATUS', width: 90, value: function(booking) { return booking.payment_status || 'Pending Verification'; } }
    ];
    var rows = reportBookings.map(function(booking) {
        var cells = tableColumns.map(function(column) {
            return wrapPdfCell(column.value(booking), column.width - 8, 7.5, 3);
        });
        var lineCount = cells.reduce(function(max, lines) { return Math.max(max, lines.length); }, 1);
        return {
            booking: booking,
            cells: cells,
            height: Math.max(28, lineCount * 9 + 10)
        };
    });
    var pages = [[]];
    var remainingHeight = 340;
    rows.forEach(function(row) {
        if (row.height > remainingHeight && pages[pages.length - 1].length) {
            pages.push([]);
            remainingHeight = 340;
        }
        pages[pages.length - 1].push(row);
        remainingHeight -= row.height;
    });

    var objects = [];
    var regularFontId = 3 + pages.length * 2;
    var boldFontId = regularFontId + 1;
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = '<< /Type /Pages /Kids [' +
        pages.map(function(_, index) { return (3 + index * 2) + ' 0 R'; }).join(' ') +
        '] /Count ' + pages.length + ' >>';

    pages.forEach(function(pageLines, index) {
        var pageId = 3 + index * 2;
        var contentId = pageId + 1;
        var stream = drawPdfPageHeader(index + 1, pages.length, regularFontId, boldFontId, pageWidth, pageHeight);
        var tableTop = 426;
        var headerHeight = 24;
        var tableWidth = tableColumns.reduce(function(total, column) { return total + column.width; }, 0);
        stream += pdfRect(margin, tableTop - headerHeight, tableWidth, headerHeight, 0.10, 0.25, 0.19);
        var columnX = margin;
        tableColumns.forEach(function(column) {
            stream += pdfText(column.label, columnX + 4, tableTop - 15, 6.4, boldFontId, 1, 1, 1);
            columnX += column.width;
        });

        var rowTop = tableTop - headerHeight;
        if (!pageLines.length) {
            stream += pdfRect(margin, rowTop - 38, tableWidth, 38, 0.97, 0.98, 0.96);
            stream += pdfText('No transactions were found for this report period.', margin + 12, rowTop - 23, 9, regularFontId, 0.34, 0.39, 0.36);
        }
        pageLines.forEach(function(row, rowIndex) {
            var rowBottom = rowTop - row.height;
            var background = rowIndex % 2 === 0 ? [1, 1, 1] : [0.97, 0.98, 0.96];
            stream += pdfRect(margin, rowBottom, tableWidth, row.height, background[0], background[1], background[2]);
            var statusBackground = pdfStatusColors(row.booking.payment_status);
            var statusX = margin + tableColumns.slice(0, tableColumns.length - 1).reduce(function(total, column) {
                return total + column.width;
            }, 0);
            stream += pdfRect(statusX + 2, rowBottom + 4, tableColumns[tableColumns.length - 1].width - 4, row.height - 8,
                statusBackground.background[0], statusBackground.background[1], statusBackground.background[2]);

            var cellX = margin;
            row.cells.forEach(function(lines, cellIndex) {
                var textColor = cellIndex === tableColumns.length - 1
                    ? statusBackground.text
                    : [0.16, 0.19, 0.17];
                lines.forEach(function(line, lineIndex) {
                    stream += pdfText(line, cellX + 4, rowTop - 12 - (lineIndex * 9), 7.5,
                        cellIndex === 1 ? boldFontId : regularFontId, textColor[0], textColor[1], textColor[2]);
                });
                cellX += tableColumns[cellIndex].width;
            });
            stream += pdfLine(margin, rowBottom, margin + tableWidth, rowBottom, 0.86, 0.88, 0.85);
            rowTop = rowBottom;
        });

        stream += pdfLine(margin, tableTop, margin + tableWidth, tableTop, 0.10, 0.25, 0.19);
        stream += pdfText('Reservation activity is grouped by booking date. Amounts are shown in PHP.',
            margin, 30, 7.5, regularFontId, 0.42, 0.46, 0.43);
        stream += pdfText('Page ' + (index + 1) + ' of ' + pages.length,
            pageWidth - margin - 60, 30, 7.5, regularFontId, 0.42, 0.46, 0.43);
        objects[pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight +
            '] /Resources << /Font << /F' + regularFontId + ' ' + regularFontId + ' 0 R /F' + boldFontId + ' ' + boldFontId +
            ' 0 R >> >> /Contents ' + contentId + ' 0 R >>';
        objects[contentId] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream';
    });
    objects[regularFontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[boldFontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

    var document = '%PDF-1.4\n';
    var offsets = [0];
    for (var objectId = 1; objectId < objects.length; objectId++) {
        offsets[objectId] = document.length;
        document += objectId + ' 0 obj\n' + objects[objectId] + '\nendobj\n';
    }
    var xrefOffset = document.length;
    document += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
    for (var offsetIndex = 1; offsetIndex < objects.length; offsetIndex++) {
        document += String(offsets[offsetIndex]).padStart(10, '0') + ' 00000 n \n';
    }
    document += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
    return new Blob([document], { type: 'application/pdf' });
}

// Draw the title and summary cards at the top of each PDF page.
function drawPdfPageHeader(pageNumber, pageCount, regularFontId, boldFontId, pageWidth, pageHeight) {
    var stream = 'q\n0.10 0.25 0.19 rg\n0 ' + (pageHeight - 82) + ' ' + pageWidth + ' 82 re f\nQ\n';
    stream += pdfText('POOLSIDE VILLA', 36, pageHeight - 34, 9, boldFontId, 0.86, 0.78, 0.50);
    stream += pdfText('TRANSACTION REPORT', 36, pageHeight - 58, 19, boldFontId, 1, 1, 1);
    stream += pdfText('Reservations by booking date', 36, pageHeight - 73, 8, regularFontId, 0.88, 0.91, 0.89);
    stream += pdfText('REPORT PERIOD', pageWidth - 180, pageHeight - 34, 7, boldFontId, 0.86, 0.78, 0.50);
    stream += pdfText(reportPeriodLabel, pageWidth - 180, pageHeight - 56, 13, boldFontId, 1, 1, 1);

    var metrics = [
        { label: 'TRANSACTIONS', value: String(reportBookings.length) },
        { label: 'APPROVED BOOKINGS', value: String(reportBookings.filter(function(booking) { return isApproved(booking.payment_status); }).length) },
        { label: 'APPROVED BOOKING VALUE', value: formatPdfMoney(getApprovedValue()) },
        { label: 'PAYMENTS RECEIVED', value: formatPdfMoney(getPaymentsReceived()) }
    ];
    var gap = 9;
    var cardWidth = (pageWidth - 72 - gap * 3) / 4;
    var cardY = 444;
    metrics.forEach(function(metric, index) {
        var x = 36 + index * (cardWidth + gap);
        stream += pdfRect(x, cardY, cardWidth, 42, 0.97, 0.98, 0.96);
        stream += pdfRect(x, cardY, 3, 42, 0.18, 0.42, 0.31);
        stream += pdfText(metric.label, x + 10, cardY + 27, 6.5, boldFontId, 0.40, 0.45, 0.42);
        stream += pdfText(metric.value, x + 10, cardY + 11, 10, boldFontId, 0.10, 0.25, 0.19);
    });
    return stream;
}

// Wrap a table value to fit its column and cap it so rows stay readable.
function wrapPdfCell(value, width, fontSize, maxLines) {
    var words = toAscii(value).trim().split(/\s+/);
    var maxCharacters = Math.max(6, Math.floor(width / (fontSize * 0.54)));
    var lines = [];
    var current = '';
    words.forEach(function(word) {
        if (current && (current.length + word.length + 1) > maxCharacters) {
            lines.push(current);
            current = '';
        }
        while (word.length > maxCharacters) {
            if (current) {
                lines.push(current);
                current = '';
            }
            lines.push(word.slice(0, maxCharacters));
            word = word.slice(maxCharacters);
        }
        current += (current ? ' ' : '') + word;
    });
    if (current) lines.push(current);
    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = lines[maxLines - 1].slice(0, Math.max(1, maxCharacters - 3)) + '...';
    }
    return lines.length ? lines : ['--'];
}

// These helpers write small pieces of PDF drawing text used by the report.
function pdfText(value, x, y, fontSize, fontId, red, green, blue) {
    return 'BT /F' + fontId + ' ' + fontSize + ' Tf ' +
        red + ' ' + green + ' ' + blue + ' rg ' + x.toFixed(2) + ' ' + y.toFixed(2) +
        ' Td (' + escapePdfText(value) + ') Tj ET\n';
}

function pdfRect(x, y, width, height, red, green, blue) {
    return 'q\n' + red + ' ' + green + ' ' + blue + ' rg\n' +
        x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + width.toFixed(2) + ' ' + height.toFixed(2) + ' re f\nQ\n';
}

function pdfLine(x1, y1, x2, y2, red, green, blue) {
    return 'q\n' + red + ' ' + green + ' ' + blue + ' RG\n0.5 w\n' +
        x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S\nQ\n';
}

// Use a soft status color in the PDF, matching the status shown in the table.
function pdfStatusColors(status) {
    var normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') {
        return { background: [0.89, 0.95, 0.91], text: [0.10, 0.34, 0.22] };
    }
    if (normalized.indexOf('reject') !== -1 || normalized.indexOf('declin') !== -1) {
        return { background: [0.99, 0.91, 0.90], text: [0.59, 0.18, 0.16] };
    }
    return { background: [0.99, 0.96, 0.87], text: [0.50, 0.35, 0.08] };
}

function formatPdfMoney(value) {
    return 'PHP ' + (Number(value) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function escapePdfText(text) {
    return toAscii(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function toAscii(value) {
    return String(value == null ? '' : value)
        .replace(/\u20B1/g, 'PHP ')
        .replace(/[^\x20-\x7E]/g, '?');
}

// Quote CSV values and protect spreadsheet programs from treating text as a formula.
function csvCell(value) {
    var text = String(value == null ? '' : value);
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
}

// Create a temporary download link, click it, and release its memory afterward.
function downloadReportFile(blobOrText, filename, mimeType) {
    var blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

// Share the selected period and approved-payment totals between the table and exports.
function periodFileSuffix() {
    return document.getElementById('reportPeriod').value === 'monthly'
        ? document.getElementById('reportYear').value + '-' + String(document.getElementById('reportMonth').value).padStart(2, '0')
        : document.getElementById('reportYear').value;
}

function getApprovedValue() {
    return reportBookings.reduce(function(total, booking) {
        return total + (isApproved(booking.payment_status) ? (Number(booking.total_amount) || 0) : 0);
    }, 0);
}

function getPaymentsReceived() {
    return reportBookings.reduce(function(total, booking) {
        return total + (isApproved(booking.payment_status) ? (Number(booking.amount_submitted) || 0) : 0);
    }, 0);
}

function isApproved(status) {
    return String(status || '').toLowerCase() === 'approved';
}

function formatReportMoney(value) {
    return '\u20B1' + (Number(value) || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatReportDate(value) {
    if (!value) return '--';
    return String(value).replace('T', ' ').slice(0, 16);
}

function monthName(month) {
    return new Date(2000, month - 1, 1).toLocaleString('en', { month: 'long' });
}
