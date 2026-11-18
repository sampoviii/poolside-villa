// Add an accessible show/hide button beside one password input.
function addPasswordToggle(input) {
    if (input.hasAttribute('data-password-toggle')) return;

    input.setAttribute('data-password-toggle', '');
    var wrapper = document.createElement('div');
    wrapper.className = 'password-input-wrap';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle';
    button.setAttribute('aria-label', 'Show password');
    button.setAttribute('aria-pressed', 'false');
    if (input.id) button.setAttribute('aria-controls', input.id);

    var icon = document.createElement('span');
    icon.className = 'material-icons';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'visibility';
    button.appendChild(icon);
    wrapper.appendChild(button);

    button.addEventListener('click', function() {
        var showPassword = input.type === 'password';
        input.type = showPassword ? 'text' : 'password';
        button.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
        button.setAttribute('aria-pressed', showPassword ? 'true' : 'false');
        icon.textContent = showPassword ? 'visibility_off' : 'visibility';
    });
}

function initializePasswordToggles(root) {
    // Handle a single inserted password field as well as a whole page or form.
    if (root.nodeType === 1 && root.matches('input[type="password"]')) {
        addPasswordToggle(root);
    }

    if (root.querySelectorAll) {
        root.querySelectorAll('input[type="password"]').forEach(addPasswordToggle);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Set up existing inputs and watch for password fields added later, such as
    // inputs inside dynamically opened dialogs.
    initializePasswordToggles(document);

    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(initializePasswordToggles);
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('reset', function(event) {
        window.setTimeout(function() {
            initializePasswordToggles(event.target);
            event.target.querySelectorAll('[data-password-toggle]').forEach(function(input) {
                if (input.type !== 'password') {
                    input.type = 'password';
                    var button = input.parentNode.querySelector('.password-toggle');
                    button.setAttribute('aria-label', 'Show password');
                    button.setAttribute('aria-pressed', 'false');
                    button.querySelector('.material-icons').textContent = 'visibility';
                }
            });
        }, 0);
    });
});
