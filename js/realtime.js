// ============================================================
// REALTIME MODULE - Sales AganceOnline
// Manages all Supabase Realtime subscriptions across the app.
// ============================================================

const Realtime = (() => {

    const activeChannels = [];

    // --------------------------------------------------------
    // SUBSCRIBE to a table
    // table   : string  – 'cars' | 'wanted_cars' | 'profiles' | 'car_images'
    // callback: fn(payload) called on any INSERT / UPDATE / DELETE
    // options : { debounce: ms } – default 400ms to avoid rapid-fire reloads
    // --------------------------------------------------------
    function subscribe(table, callback, options = {}) {
        const client = getSupabaseClient();
        if (!client) return null;

        const delay = options.debounce ?? 400;
        let timer = null;

        // Debounce wrapper – groups rapid bursts into one call
        function debouncedCallback(payload) {
            clearTimeout(timer);
            timer = setTimeout(() => callback(payload), delay);
        }

        const channel = client
            .channel(`realtime_${table}_${Date.now()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                debouncedCallback
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[Realtime] ✅ Subscribed to "${table}"`);
                    _setLiveIndicator(true);
                }
                if (status === 'CHANNEL_ERROR') {
                    console.warn(`[Realtime] ⚠️ Error on "${table}"`);
                    _setLiveIndicator(false);
                }
            });

        activeChannels.push(channel);
        return channel;
    }

    // --------------------------------------------------------
    // SUBSCRIBE MULTIPLE tables with the same callback
    // --------------------------------------------------------
    function subscribeMany(tables, callback, options = {}) {
        tables.forEach(table => subscribe(table, callback, options));
    }

    // --------------------------------------------------------
    // UNSUBSCRIBE ALL channels (call on page unload)
    // --------------------------------------------------------
    function unsubscribeAll() {
        const client = getSupabaseClient();
        if (!client) return;
        activeChannels.forEach(ch => {
            try { client.removeChannel(ch); } catch (_) {}
        });
        activeChannels.length = 0;
        console.log('[Realtime] All channels removed');
    }

    // --------------------------------------------------------
    // LIVE INDICATOR – tiny pulsing dot in the topbar
    // --------------------------------------------------------
    function _setLiveIndicator(isConnected) {
        let dot = document.getElementById('realtime-dot');
        if (!dot) {
            // Create and inject the indicator into the topbar-right
            const topbarRight = document.querySelector('.topbar-right');
            if (!topbarRight) return;
            dot = document.createElement('div');
            dot.id = 'realtime-dot';
            dot.title = 'Live updates active';
            dot.innerHTML = `<span class="rt-pulse"></span><span class="rt-label">LIVE</span>`;
            dot.style.cssText = `
                display: flex; align-items: center; gap: 6px;
                font-size: 0.6875rem; font-weight: 700;
                letter-spacing: 0.1em; color: #22c55e;
                background: rgba(34,197,94,0.08);
                border: 1px solid rgba(34,197,94,0.25);
                border-radius: 20px; padding: 4px 10px;
                cursor: default; user-select: none;
            `;

            // Inject pulse CSS once
            if (!document.getElementById('rt-styles')) {
                const style = document.createElement('style');
                style.id = 'rt-styles';
                style.textContent = `
                    .rt-pulse {
                        width: 7px; height: 7px; border-radius: 50%;
                        background: #22c55e;
                        animation: rt-blink 1.4s ease-in-out infinite;
                        display: inline-block;
                    }
                    @keyframes rt-blink {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50%       { opacity: 0.35; transform: scale(0.7); }
                    }
                    #realtime-dot.disconnected { color: #ef4444; border-color: rgba(239,68,68,0.25); background: rgba(239,68,68,0.08); }
                    #realtime-dot.disconnected .rt-pulse { background: #ef4444; animation: none; }
                `;
                document.head.appendChild(style);
            }

            topbarRight.prepend(dot);
        }

        dot.classList.toggle('disconnected', !isConnected);
        dot.title = isConnected ? 'Live updates active' : 'Realtime disconnected';
        const label = dot.querySelector('.rt-label');
        if (label) label.textContent = isConnected ? 'LIVE' : 'OFFLINE';
    }

    // --------------------------------------------------------
    // HELPERS: human-readable event labels for toast messages
    // --------------------------------------------------------
    function eventLabel(eventType, table) {
        const t = {
            cars: 'Car', wanted_cars: 'Wanted car',
            profiles: 'User', car_images: 'Car image'
        }[table] || table;

        const e = {
            INSERT: `New ${t} added`,
            UPDATE: `${t} updated`,
            DELETE: `${t} removed`
        }[eventType] || `${t} changed`;

        return e;
    }

    // --------------------------------------------------------
    // SMART SUBSCRIBE – auto-reloads page data and shows a toast
    // Designed so each page can call this with a single reload fn.
    // --------------------------------------------------------
    function autoRefresh(table, reloadFn, options = {}) {
        const showToast = options.showToast !== false;

        subscribe(table, (payload) => {
            if (showToast && UI?.showInfo) {
                UI.showInfo(eventLabel(payload.eventType, table));
            }
            if (typeof reloadFn === 'function') reloadFn(payload);
        }, { debounce: options.debounce ?? 600 });
    }

    // Auto-cleanup on page unload
    window.addEventListener('beforeunload', unsubscribeAll);

    return {
        subscribe,
        subscribeMany,
        unsubscribeAll,
        autoRefresh,
        eventLabel
    };

})();

window.Realtime = Realtime;
