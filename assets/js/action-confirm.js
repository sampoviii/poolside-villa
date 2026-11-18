// Show one reusable confirmation dialog before an action that may change or
// remove data. The caller supplies the message and the action to run on confirm.
function showActionConfirm(message, actionLabel, onConfirm, actionClass) {
    // Replace any older dialog so the page never shows two at once.
    var existingModal = document.querySelector('#actionConfirmModal');
    if (existingModal) existingModal.remove();

    // Build the dialog in JavaScript so pages can share it without repeating
    // the same confirmation markup in every HTML file.
    var modal = document.createElement('div');
    modal.id = 'actionConfirmModal';
    modal.className = 'modal-overlay open';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'actionConfirmTitle');
    modal.setAttribute('aria-describedby', 'actionConfirmMessage');

    var box = document.createElement('div');
    box.className = 'modal-box';
    box.style.maxWidth = '420px';

    var header = document.createElement('div');
    header.className = 'modal-head';
    var title = document.createElement('h3');
    title.id = 'actionConfirmTitle';
    title.textContent = 'Are you sure?';
    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'modal-close-btn';
    closeButton.setAttribute('aria-label', 'Cancel');
    closeButton.textContent = '\u00D7';
    header.appendChild(title);
    header.appendChild(closeButton);

    var content = document.createElement('div');
    content.className = 'modal-content';
    var messageElement = document.createElement('p');
    messageElement.id = 'actionConfirmMessage';
    messageElement.textContent = message;
    content.appendChild(messageElement);

    var footer = document.createElement('div');
    footer.className = 'modal-footer';
    var cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-gray';
    cancelButton.textContent = 'Cancel';
    var confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'btn ' + (actionClass || 'btn-red');
    confirmButton.textContent = actionLabel;
    footer.appendChild(cancelButton);
    footer.appendChild(confirmButton);

    box.appendChild(header);
    box.appendChild(content);
    box.appendChild(footer);
    modal.appendChild(box);
    document.body.appendChild(modal);

    var previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var finished = false;

    // Restore the page after the dialog closes. The finished flag prevents
    // double clicks from running the action more than once.
    function dismiss() {
        if (finished) return;
        finished = true;
        document.removeEventListener('keydown', onKeyDown);
        modal.remove();
        if (!document.querySelector('.modal-overlay.open')) {
            document.body.style.overflow = previousOverflow;
        }
    }

    function onKeyDown(event) {
        if (event.key === 'Escape') dismiss();
    }

    closeButton.addEventListener('click', dismiss);
    cancelButton.addEventListener('click', dismiss);
    modal.addEventListener('click', function(event) {
        if (event.target === modal) dismiss();
    });
    confirmButton.addEventListener('click', function() {
        if (finished) return;
        confirmButton.disabled = true;
        dismiss();
        onConfirm();
    });
    document.addEventListener('keydown', onKeyDown);
    cancelButton.focus();
}
