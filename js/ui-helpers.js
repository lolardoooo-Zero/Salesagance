// ============================================================
// UI HELPERS - Sales AganceOnline
// Toast notifications, modals, loading states, confirmations
// ============================================================

const UI = (() => {

    // --------------------------------------------------------
    // TOAST NOTIFICATIONS
    // --------------------------------------------------------
    function toast(message, type = 'info', duration = 4000) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const icons = {
            success: '✅',
            error:   '❌',
            warning: '⚠️',
            info:    'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span>${message}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    }

    const showSuccess = (msg) => toast(msg, 'success');
    const showError   = (msg) => toast(msg, 'error');
    const showWarning = (msg) => toast(msg, 'warning');
    const showInfo    = (msg) => toast(msg, 'info');

    // --------------------------------------------------------
    // CONFIRMATION DIALOG
    // --------------------------------------------------------
    function confirm(options = {}) {
        return new Promise(resolve => {
            const {
                title = 'Are you sure?',
                message = 'This action cannot be undone.',
                confirmText = 'Confirm',
                cancelText = 'Cancel',
                type = 'danger',  // danger | warning | info
                icon = '⚠️'
            } = options;

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal confirm-dialog">
                    <div class="modal-body">
                        <div class="confirm-icon">${icon}</div>
                        <h2>${title}</h2>
                        <p style="color: var(--color-muted); font-size: 0.9375rem;">${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" id="confirm-cancel">${cancelText}</button>
                        <button class="btn btn-${type}" id="confirm-ok">${confirmText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('active'));

            overlay.querySelector('#confirm-cancel').addEventListener('click', () => {
                closeOverlay(overlay);
                resolve(false);
            });

            overlay.querySelector('#confirm-ok').addEventListener('click', () => {
                closeOverlay(overlay);
                resolve(true);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeOverlay(overlay);
                    resolve(false);
                }
            });
        });
    }

    function closeOverlay(overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    }

    // --------------------------------------------------------
    // MODAL MANAGEMENT
    // --------------------------------------------------------
    function openModal(id) {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
        const overlay = typeof id === 'string' ? document.getElementById(id) : id;
        if (!overlay) return;
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Close modal on backdrop click
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeModal(e.target);
        }
        if (e.target.dataset.closeModal) {
            closeModal(document.getElementById(e.target.dataset.closeModal));
        }
    });

    // --------------------------------------------------------
    // PAGE LOADER
    // --------------------------------------------------------
    function showPageLoader() {
        let loader = document.getElementById('page-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'page-loader';
            loader.className = 'page-loader';
            loader.innerHTML = '<div class="loader-spinner"></div>';
            document.body.appendChild(loader);
        }
        loader.classList.remove('hidden');
    }

    function hidePageLoader() {
        const loader = document.getElementById('page-loader');
        if (loader) loader.classList.add('hidden');
    }

    // --------------------------------------------------------
    // BUTTON LOADING STATE
    // --------------------------------------------------------
    function setButtonLoading(btn, loading, originalText) {
        if (loading) {
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = `<span class="loader-spinner" style="width:18px;height:18px;border-width:2px;"></span> ${originalText || 'Loading...'}`;
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.originalText || originalText || 'Submit';
            btn.disabled = false;
        }
    }

    // --------------------------------------------------------
    // FORMAT UTILITIES
    // --------------------------------------------------------
    function formatPrice(price) {
        if (!price && price !== 0) return 'N/A';
        if (price === 0) return 'يُحدد لاحقاً';
        return new Intl.NumberFormat('en-EG', {
            style: 'currency',
            currency: 'EGP',
            maximumFractionDigits: 0
        }).format(price);
    }

    function formatNumber(num) {
        if (!num && num !== 0) return 'N/A';
        return new Intl.NumberFormat('en-US').format(num);
    }

    function formatDate(date) {
        if (!date) return 'N/A';
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        }).format(new Date(date));
    }

    function formatMileage(km) {
        if (!km && km !== 0) return 'N/A';
        return formatNumber(km) + ' km';
    }

    function formatRelativeTime(date) {
        if (!date) return 'N/A';
        const now = new Date();
        const d = new Date(date);
        const diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
        if (diff < 2592000) return `${Math.floor(diff/86400)}d ago`;
        return formatDate(date);
    }

    // --------------------------------------------------------
    // STATUS BADGE HTML HELPERS
    // --------------------------------------------------------
    function carStatusBadge(status) {
        const map = {
            available:   { cls: 'badge-success', label: 'Available' },
            reserved:    { cls: 'badge-warning', label: 'Reserved' },
            sold:        { cls: 'badge-muted',   label: 'Sold' },
            unavailable: { cls: 'badge-danger',  label: 'Unavailable' }
        };
        const s = map[status] || { cls: 'badge-muted', label: status };
        return `<span class="badge ${s.cls}">${s.label}</span>`;
    }

    function userStatusBadge(status) {
        const map = {
            approved:  { cls: 'badge-success', label: 'Approved' },
            pending:   { cls: 'badge-warning', label: 'Pending' },
            rejected:  { cls: 'badge-danger',  label: 'Rejected' },
            suspended: { cls: 'badge-muted',   label: 'Suspended' }
        };
        const s = map[status] || { cls: 'badge-muted', label: status };
        return `<span class="badge ${s.cls}">${s.label}</span>`;
    }

    function userRoleBadge(role) {
        const map = {
            owner: { cls: 'badge-red',  label: 'Owner' },
            sales: { cls: 'badge-info', label: 'Sales' }
        };
        const s = map[role] || { cls: 'badge-muted', label: role };
        return `<span class="badge ${s.cls}">${s.label}</span>`;
    }

    function wantedStatusBadge(status) {
        const map = {
            active: { cls: 'badge-success', label: 'Active' },
            found:  { cls: 'badge-info',    label: 'Found' },
            closed: { cls: 'badge-muted',   label: 'Closed' }
        };
        const s = map[status] || { cls: 'badge-muted', label: status };
        return `<span class="badge ${s.cls}">${s.label}</span>`;
    }

    function priorityBadge(priority) {
        const map = {
            low:    { cls: 'badge-info',    label: 'Low' },
            medium: { cls: 'badge-warning', label: 'Medium' },
            high:   { cls: 'badge-danger',  label: 'High' },
            urgent: { cls: 'badge-red',     label: '🔥 Urgent' }
        };
        const s = map[priority] || { cls: 'badge-muted', label: priority };
        return `<span class="badge ${s.cls}">${s.label}</span>`;
    }

    // --------------------------------------------------------
    // SIDEBAR TOGGLE (shared across all pages)
    // --------------------------------------------------------
    function initSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebar-toggle');
        const overlay = document.getElementById('sidebar-overlay');

        if (!sidebar) return;

        function openSidebar() {
            sidebar.classList.add('open');
            if (overlay) overlay.classList.add('active');
        }
        function closeSidebar() {
            sidebar.classList.remove('open');
            if (overlay) overlay.classList.remove('active');
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
            });
        }

        if (overlay) {
            overlay.addEventListener('click', closeSidebar);
        }

        // Close sidebar on nav link click (mobile)
        sidebar.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) closeSidebar();
            });
        });

        // Highlight active nav link
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href') || '';
            if (href.includes(currentPage)) {
                link.classList.add('active');
            }
        });
    }

    return {
        toast, showSuccess, showError, showWarning, showInfo,
        confirm, openModal, closeModal,
        showPageLoader, hidePageLoader, setButtonLoading,
        formatPrice, formatNumber, formatDate, formatMileage, formatRelativeTime,
        carStatusBadge, userStatusBadge, userRoleBadge, wantedStatusBadge, priorityBadge,
        initSidebar
    };
})();

window.UI = UI;
