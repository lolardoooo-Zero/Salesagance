// ============================================================
// DASHBOARD JS - Sales AganceOnline
// ============================================================

(async () => {
    // Auth guard
    const profile = await Guards.requireApproved();
    if (!profile) return;

    // Apply role-based UI
    Guards.applyRoleUI(profile);

    // Init sidebar
    UI.initSidebar();

    // Set user avatar initial
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
        avatarEl.textContent = (profile.full_name || 'U')[0].toUpperCase();
    }

    // Welcome message
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const welcomeEl = document.getElementById('welcome-heading');
    if (welcomeEl) welcomeEl.textContent = `${greeting}, ${profile.full_name?.split(' ')[0] || 'there'}! 👋`;

    // Update sub
    const subEl = document.getElementById('welcome-sub');
    if (subEl) {
        subEl.textContent = profile.role === 'owner'
            ? 'Full system overview for today.'
            : 'Your sales overview for today.';
    }

    // Live clock
    function updateClock() {
        const el = document.getElementById('topbar-time');
        if (el) {
            el.textContent = new Date().toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        }
    }
    updateClock();
    setInterval(updateClock, 1000);

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const ok = await UI.confirm({
            title: 'Sign Out',
            message: 'Are you sure you want to sign out?',
            confirmText: 'Sign Out',
            cancelText: 'Cancel',
            type: 'danger',
            icon: '🚪'
        });
        if (ok) await Auth.logout();
    });

    // Load statistics
    await loadStats(profile);

    // Load recent data
    await Promise.all([
        loadRecentCars(),
        loadRecentWanted()
    ]);

    // --------------------------------------------------------
    // Load stats
    // --------------------------------------------------------
    async function loadStats(profile) {
        const client = getSupabaseClient();
        if (!client) return;

        const statsGrid = document.getElementById('stats-grid');

        try {
            const [carsRes, wantedRes, profilesRes] = await Promise.all([
                client.from('cars').select('status'),
                client.from('wanted_cars').select('status'),
                profile.role === 'owner' ? client.from('profiles').select('status, role') : Promise.resolve({ data: [] })
            ]);

            const cars = carsRes.data || [];
            const wanted = wantedRes.data || [];
            const profiles = profilesRes.data || [];

            const totalCars = cars.length;
            const availableCars = cars.filter(c => c.status === 'available').length;
            const soldCars = cars.filter(c => c.status === 'sold').length;
            const activeWanted = wanted.filter(w => w.status === 'active').length;

            let statsHTML = '';

            if (profile.role === 'owner') {
                const totalSales = profiles.filter(p => p.role === 'sales').length;
                const pendingUsers = profiles.filter(p => p.status === 'pending').length;

                statsHTML = `
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-label">Total Cars</span>
                            <span class="stat-icon">🚗</span>
                        </div>
                        <div class="stat-value">${totalCars}</div>
                        <div class="stat-change">All inventory</div>
                    </div>
                    <div class="stat-card green">
                        <div class="stat-card-header">
                            <span class="stat-label">Available</span>
                            <span class="stat-icon">✅</span>
                        </div>
                        <div class="stat-value">${availableCars}</div>
                        <div class="stat-change">Ready to sell</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-label">Sold</span>
                            <span class="stat-icon">🏁</span>
                        </div>
                        <div class="stat-value">${soldCars}</div>
                        <div class="stat-change">Successfully sold</div>
                    </div>
                    <div class="stat-card red">
                        <div class="stat-card-header">
                            <span class="stat-label">Wanted Cars</span>
                            <span class="stat-icon">🔍</span>
                        </div>
                        <div class="stat-value">${activeWanted}</div>
                        <div class="stat-change">Active requests</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-label">Sales Team</span>
                            <span class="stat-icon">👥</span>
                        </div>
                        <div class="stat-value">${totalSales}</div>
                        <div class="stat-change">Team members</div>
                    </div>
                    <div class="stat-card warning">
                        <div class="stat-card-header">
                            <span class="stat-label">Pending</span>
                            <span class="stat-icon">⏳</span>
                        </div>
                        <div class="stat-value">${pendingUsers}</div>
                        <div class="stat-change">Awaiting approval</div>
                    </div>
                `;
            } else {
                // Sales view
                statsHTML = `
                    <div class="stat-card green">
                        <div class="stat-card-header">
                            <span class="stat-label">Available Cars</span>
                            <span class="stat-icon">✅</span>
                        </div>
                        <div class="stat-value">${availableCars}</div>
                        <div class="stat-change">Ready to sell</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-label">Total Inventory</span>
                            <span class="stat-icon">🚗</span>
                        </div>
                        <div class="stat-value">${totalCars}</div>
                        <div class="stat-change">All cars</div>
                    </div>
                    <div class="stat-card red">
                        <div class="stat-card-header">
                            <span class="stat-label">Wanted Cars</span>
                            <span class="stat-icon">🔍</span>
                        </div>
                        <div class="stat-value">${activeWanted}</div>
                        <div class="stat-change">Active requests</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-label">Sold Cars</span>
                            <span class="stat-icon">🏁</span>
                        </div>
                        <div class="stat-value">${soldCars}</div>
                        <div class="stat-change">Successfully closed</div>
                    </div>
                `;
            }

            statsGrid.innerHTML = statsHTML;

        } catch (err) {
            console.error('Error loading stats:', err);
            statsGrid.innerHTML = `<div class="stat-card" style="grid-column:1/-1; text-align:center; color: var(--color-danger);">Failed to load statistics</div>`;
        }
    }

    // --------------------------------------------------------
    // Recent Cars
    // --------------------------------------------------------
    async function loadRecentCars() {
        const client = getSupabaseClient();
        if (!client) return;
        const el = document.getElementById('recent-cars-list');

        try {
            const { data, error } = await client
                .from('cars')
                .select(`*, car_images(url, is_primary)`)
                .order('created_at', { ascending: false })
                .limit(6);

            if (error) throw error;

            if (!data || data.length === 0) {
                el.innerHTML = `
                    <div class="empty-state" style="padding: 32px;">
                        <div class="empty-state-icon">🚗</div>
                        <h3>No Cars Yet</h3>
                        <p>Cars will appear here once added to inventory.</p>
                    </div>`;
                return;
            }

            el.innerHTML = data.map(car => {
                const primary = car.car_images?.find(i => i.is_primary) || car.car_images?.[0];
                const imgHTML = primary
                    ? `<img src="${primary.url}" class="recent-item-img" alt="${car.brand} ${car.model}" loading="lazy">`
                    : `<div class="recent-item-img-placeholder">🚗</div>`;

                return `
                    <div class="recent-item" onclick="window.location.href='./cars.html#${car.id}'">
                        ${imgHTML}
                        <div class="recent-item-info">
                            <div class="recent-item-title">${car.year} ${car.brand} ${car.model}</div>
                            <div class="recent-item-subtitle">${UI.formatPrice(car.price, car.currency)} · ${UI.formatMileage(car.mileage)}</div>
                        </div>
                        <div class="recent-item-meta">
                            ${UI.carStatusBadge(car.status)}
                            <div style="margin-top: 4px;">${UI.formatRelativeTime(car.created_at)}</div>
                        </div>
                    </div>`;
            }).join('');

        } catch (err) {
            console.error('Error loading recent cars:', err);
            el.innerHTML = `<div style="text-align:center; color: var(--color-danger); padding: 24px;">Failed to load cars</div>`;
        }
    }

    // --------------------------------------------------------
    // Recent Wanted Cars
    // --------------------------------------------------------
    async function loadRecentWanted() {
        const client = getSupabaseClient();
        if (!client) return;
        const el = document.getElementById('recent-wanted-list');

        try {
            const { data, error } = await client
                .from('wanted_cars')
                .select('*')
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(6);

            if (error) throw error;

            if (!data || data.length === 0) {
                el.innerHTML = `
                    <div class="empty-state" style="padding: 32px;">
                        <div class="empty-state-icon">🔍</div>
                        <h3>No Active Requests</h3>
                        <p>Wanted car requests will appear here.</p>
                    </div>`;
                return;
            }

            el.innerHTML = data.map(w => `
                <div class="recent-item" onclick="window.location.href='./wanted.html#${w.id}'">
                    <div class="recent-item-img-placeholder">🔍</div>
                    <div class="recent-item-info">
                        <div class="recent-item-title">${w.brand} ${w.model}</div>
                        <div class="recent-item-subtitle">
                            ${w.min_year || '?'}–${w.max_year || '?'} · 
                            ${w.max_budget ? UI.formatPrice(w.max_budget) : 'Any Budget'}
                        </div>
                    </div>
                    <div class="recent-item-meta">
                        ${UI.priorityBadge(w.priority)}
                        <div style="margin-top: 4px;">${UI.formatRelativeTime(w.created_at)}</div>
                    </div>
                </div>`).join('');

        } catch (err) {
            console.error('Error loading recent wanted:', err);
            el.innerHTML = `<div style="text-align:center; color: var(--color-danger); padding: 24px;">Failed to load wanted cars</div>`;
        }
    }


    // -- REALTIME ----------------------------------------------
    // Auto-refresh stats and recent lists on any table change
    Realtime.autoRefresh('cars', () => {
        loadStats();
        loadRecentCars();
    }, { showToast: true, debounce: 800 });

    Realtime.autoRefresh('wanted_cars', () => {
        loadStats();
        loadRecentWanted();
    }, { showToast: true, debounce: 800 });

    Realtime.autoRefresh('profiles', () => {
        loadStats();
    }, { showToast: false, debounce: 1200 });

})();
