// ============================================================
// CARS JS - Sales AganceOnline
// Full car inventory CRUD, advanced filters, Car Inspection,
// PDF generation, Activity Logging
// ============================================================

(async () => {
    const profile = await Guards.requireApproved();
    if (!profile) return;

    Guards.applyRoleUI(profile);
    UI.initSidebar();

    const client = getSupabaseClient();
    if (!client) return;

    const isOwner = profile.role === 'owner';
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.textContent = (profile.full_name || 'U')[0].toUpperCase();

    // Show add car button for owners
    const addCarBtn = document.getElementById('add-car-btn');
    if (isOwner && addCarBtn) addCarBtn.style.display = '';

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (await UI.confirm({ title: 'Sign Out', message: 'Sure you want to sign out?', confirmText: 'Sign Out', icon: '🚪' }))
            await Auth.logout();
    });

    // --------------------------------------------------------
    // STATE
    // --------------------------------------------------------
    let allCars = [];
    let pendingImages = [];
    let editingCarId = null;
    let existingImages = [];
    // Inspection state
    let pendingInspectionFile = null;
    let currentInspectionUrl = null;
    let removeInspectionOnSave = false;

    // --------------------------------------------------------
    // LOAD CARS
    // --------------------------------------------------------
    async function loadCars() {
        const grid = document.getElementById('cars-grid');
        grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:60px;">
            <div class="loader-spinner" style="width:40px;height:40px;border-width:3px;"></div>
        </div>`;

        try {
            const { data, error } = await client
                .from('cars')
                .select(`*, car_images(id, url, is_primary, sort_order)`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            allCars = data || [];
            applyFilters();
        } catch (err) {
            console.error(err);
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--color-danger);padding:60px;">
                Failed to load cars. ${err.message}
            </div>`;
        }
    }

    // --------------------------------------------------------
    // RENDER CARS
    // --------------------------------------------------------
    function renderCars(cars) {
        const grid = document.getElementById('cars-grid');
        const countEl = document.getElementById('results-count');
        if (countEl) countEl.textContent = `${cars.length} car${cars.length !== 1 ? 's' : ''}`;

        if (cars.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1;">
                <div class="empty-state">
                    <div class="empty-state-icon">🚗</div>
                    <h3>No Cars Found</h3>
                    <p>Try adjusting your search filters, or add a new car to the inventory.</p>
                </div>
            </div>`;
            return;
        }

        grid.innerHTML = cars.map(car => {
            const images = car.car_images || [];
            const primary = images.find(i => i.is_primary) || images[0];
            const imgHTML = primary
                ? `<img src="${primary.url}" alt="${car.brand} ${car.model}" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<div class=\\'car-card-placeholder\\'>🚗</div>';">`
                : `<div class="car-card-placeholder">🚗</div>`;

            const ownerActions = isOwner ? `
                <div class="car-card-actions">
                    <button class="car-card-action-btn pdf"   title="Generate PDF"
                        onclick="event.stopPropagation(); generatePDF('${car.id}')">📄</button>
                    <button class="car-card-action-btn edit"  title="Edit"
                        onclick="event.stopPropagation(); openEditCar('${car.id}')">✏️</button>
                    <button class="car-card-action-btn delete" title="Delete"
                        onclick="event.stopPropagation(); deleteCar('${car.id}')">🗑️</button>
                </div>` : '';

            return `
                <div class="car-card status-${car.status}" onclick="openCarDetail('${car.id}')">
                    <div class="car-card-image">
                        ${imgHTML}
                        <div class="car-card-status">${UI.carStatusBadge(car.status)}</div>
                        ${ownerActions}
                        ${images.length > 1 ? `<div class="car-card-img-count">📷 ${images.length}</div>` : ''}
                    </div>
                    <div class="car-card-body">
                        <div class="car-card-brand">${car.brand}</div>
                        <div class="car-card-name">${car.model} <span class="car-card-year">${car.year}</span></div>
                        ${car.trim ? `<div class="text-muted text-sm">${car.trim}</div>` : ''}
                        <div class="car-card-specs">
                            ${car.mileage != null ? `<span class="car-card-spec"><span class="car-card-spec-icon">🛣️</span>${UI.formatMileage(car.mileage)}</span>` : ''}
                            ${car.transmission ? `<span class="car-card-spec"><span class="car-card-spec-icon">⚙️</span>${cap(car.transmission)}</span>` : ''}
                            ${car.fuel_type ? `<span class="car-card-spec"><span class="car-card-spec-icon">⛽</span>${cap(car.fuel_type)}</span>` : ''}
                        </div>
                    </div>
                    <div class="car-card-footer">
                        <div class="car-card-price">${UI.formatPrice(car.price)}</div>
                        ${car.location ? `<div class="car-card-location">📍 ${car.location}</div>` : ''}
                    </div>
                </div>`;
        }).join('');
    }

    // --------------------------------------------------------
    // ADVANCED SEARCH & FILTER
    // --------------------------------------------------------
    function applyFilters() {
        const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
        const status = document.getElementById('filter-status')?.value || '';
        const trans = document.getElementById('filter-transmission')?.value || '';
        const fuel = document.getElementById('filter-fuel')?.value || '';
        const condition = document.getElementById('filter-condition')?.value || '';
        const yearFrom = parseInt(document.getElementById('filter-year-from')?.value) || null;
        const yearTo = parseInt(document.getElementById('filter-year-to')?.value) || null;
        const priceMin = parseFloat(document.getElementById('filter-price-min')?.value) || null;
        const priceMax = parseFloat(document.getElementById('filter-price-max')?.value) || null;
        const mileMin = parseInt(document.getElementById('filter-mileage-min')?.value) || null;
        const mileMax = parseInt(document.getElementById('filter-mileage-max')?.value) || null;
        const color = (document.getElementById('filter-color')?.value || '').toLowerCase().trim();
        const bodyType = (document.getElementById('filter-body-type')?.value || '').toLowerCase().trim();
        const location = (document.getElementById('filter-location')?.value || '').toLowerCase().trim();
        const sortVal = document.getElementById('sort-select')?.value || '';

        let filtered = allCars;

        if (search) {
            filtered = filtered.filter(c =>
                (c.brand || '').toLowerCase().includes(search) ||
                (c.model || '').toLowerCase().includes(search) ||
                (c.trim || '').toLowerCase().includes(search) ||
                (c.location || '').toLowerCase().includes(search) ||
                (c.vin || '').toLowerCase().includes(search) ||
                String(c.year || '').includes(search)
            );
        }
        if (status) filtered = filtered.filter(c => c.status === status);
        if (trans) filtered = filtered.filter(c => c.transmission === trans);
        if (fuel) filtered = filtered.filter(c => c.fuel_type === fuel);
        if (condition) filtered = filtered.filter(c => c.condition === condition);
        if (yearFrom) filtered = filtered.filter(c => c.year >= yearFrom);
        if (yearTo) filtered = filtered.filter(c => c.year <= yearTo);
        if (priceMin != null) filtered = filtered.filter(c => c.price >= priceMin);
        if (priceMax != null) filtered = filtered.filter(c => c.price <= priceMax);
        if (mileMin != null) filtered = filtered.filter(c => c.mileage >= mileMin);
        if (mileMax != null) filtered = filtered.filter(c => c.mileage <= mileMax);
        if (color) filtered = filtered.filter(c => (c.color || '').toLowerCase().includes(color));
        if (bodyType) filtered = filtered.filter(c => (c.body_type || '').toLowerCase().includes(bodyType));
        if (location) filtered = filtered.filter(c => (c.location || '').toLowerCase().includes(location));

        // Sort
        switch (sortVal) {
            case 'price_asc': filtered.sort((a, b) => a.price - b.price); break;
            case 'price_desc': filtered.sort((a, b) => b.price - a.price); break;
            case 'year_desc': filtered.sort((a, b) => b.year - a.year); break;
            case 'year_asc': filtered.sort((a, b) => a.year - b.year); break;
            case 'mileage_asc': filtered.sort((a, b) => a.mileage - b.mileage); break;
            case 'mileage_desc': filtered.sort((a, b) => b.mileage - a.mileage); break;
            default: // recently added — already ordered from DB
        }

        updateFilterBadge();
        renderCars(filtered);
    }

    function updateFilterBadge() {
        const activeFilters = [
            document.getElementById('filter-status')?.value,
            document.getElementById('filter-transmission')?.value,
            document.getElementById('filter-fuel')?.value,
            document.getElementById('filter-condition')?.value,
            document.getElementById('filter-year-from')?.value,
            document.getElementById('filter-year-to')?.value,
            document.getElementById('filter-price-min')?.value,
            document.getElementById('filter-price-max')?.value,
            document.getElementById('filter-mileage-min')?.value,
            document.getElementById('filter-mileage-max')?.value,
            document.getElementById('filter-color')?.value,
            document.getElementById('filter-body-type')?.value,
            document.getElementById('filter-location')?.value,
        ].filter(Boolean).length;

        const badge = document.getElementById('filter-count');
        if (badge) {
            badge.textContent = activeFilters;
            badge.style.display = activeFilters > 0 ? 'inline-flex' : 'none';
        }
    }

    // ── Filter event listeners ────────────────────────────────
    const filterIds = [
        'search-input', 'filter-status', 'filter-transmission', 'filter-fuel',
        'filter-condition', 'filter-year-from', 'filter-year-to',
        'filter-price-min', 'filter-price-max', 'filter-mileage-min', 'filter-mileage-max',
        'filter-color', 'filter-body-type', 'filter-location', 'sort-select'
    ];
    filterIds.forEach(id => {
        document.getElementById(id)?.addEventListener('input', applyFilters);
        document.getElementById(id)?.addEventListener('change', applyFilters);
    });

    // ── Advanced filter toggle ────────────────────────────────
    document.getElementById('filter-toggle-btn')?.addEventListener('click', () => {
        const adv = document.getElementById('filter-advanced');
        if (!adv) return;
        const isVisible = adv.style.display !== 'none';
        adv.style.display = isVisible ? 'none' : 'flex';
        document.getElementById('filter-toggle-btn').textContent = isVisible
            ? '⚙️ Filters'
            : '⚙️ Hide Filters';
    });

    // ── Clear all filters ─────────────────────────────────────
    document.getElementById('clear-filters')?.addEventListener('click', () => {
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        renderCars(allCars);
        updateFilterBadge();
    });

    // --------------------------------------------------------
    // OPEN CAR DETAIL MODAL
    // --------------------------------------------------------
    window.openCarDetail = function (id) {
        const car = allCars.find(c => c.id === id);
        if (!car) return;

        const images = car.car_images || [];
        const primary = images.find(i => i.is_primary) || images[0];

        document.getElementById('car-detail-heading').textContent = `${car.year} ${car.brand} ${car.model}`;

        const galleryHTML = `
            <div class="car-gallery">
                <div class="car-gallery-main">
                    <img id="gallery-main-img" src="${primary?.url || ''}" alt="${car.brand} ${car.model}"
                        onerror="this.parentElement.innerHTML='<div class=\\'car-card-image-placeholder\\' style=\\'height:100%\\'>🚗</div>'">
                </div>
                ${images.length > 1 ? `
                    <div class="car-gallery-thumbs">
                        ${images.map((img, i) => `
                            <div class="car-gallery-thumb ${img.is_primary || i === 0 ? 'active' : ''}"
                                onclick="switchGalleryImage('${img.url}', this)">
                                <img src="${img.url}" alt="Car image ${i + 1}" onerror="this.src=''; this.parentElement.innerHTML='🚗';">
                            </div>`).join('')}
                    </div>` : ''}
            </div>`;

        const specs = [
            { label: 'Brand', value: car.brand },
            { label: 'Model', value: car.model },
            { label: 'Year', value: car.year },
            { label: 'Trim', value: car.trim },
            { label: 'Color', value: car.color },
            { label: 'Mileage', value: UI.formatMileage(car.mileage) },
            { label: 'Transmission', value: cap(car.transmission) },
            { label: 'Fuel Type', value: cap(car.fuel_type) },
            { label: 'Engine', value: car.engine },
            { label: 'Horsepower', value: car.horsepower ? `${car.horsepower} HP` : null },
            { label: 'Body Type', value: car.body_type },
            { label: 'Condition', value: cap(car.condition) },
            { label: 'Location', value: car.location },
            { label: 'Status', value: UI.carStatusBadge(car.status) },
            { label: 'VIN', value: car.vin },
            { label: 'Added', value: UI.formatDate(car.created_at) },
        ].filter(s => s.value);

        const specsHTML = `
            <div class="car-specs-panel">
                <div>
                    <div class="car-detail-brand-year">
                        <span class="badge badge-red" style="font-size:0.8125rem;">${car.brand}</span>
                        ${UI.carStatusBadge(car.status)}
                    </div>
                    <div class="car-detail-title">${car.model} ${car.year}${car.trim ? ' · ' + car.trim : ''}</div>
                    <div class="car-detail-price" style="margin-top:8px;">${UI.formatPrice(car.price, car.currency)}</div>
                </div>
                <div class="specs-grid">
                    ${specs.map(s => `
                        <div class="spec-item">
                            <div class="spec-item-label">${s.label}</div>
                            <div class="spec-item-value">${s.value}</div>
                        </div>`).join('')}
                </div>
                ${car.description ? `
                    <div>
                        <div class="form-label" style="margin-bottom: 8px;">Description</div>
                        <div class="car-detail-description">${car.description}</div>
                    </div>` : ''}
                ${car.inspection_file_url ? (() => {
                const url = car.inspection_file_url;
                const ext = url.split('?')[0].split('.').pop().toLowerCase();
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
                if (isImage) {
                    return `<div class="inspection-image-preview-block">
                            <div class="form-label" style="margin-bottom: 10px;">📋 Car Inspection</div>
                            <a href="${url}" target="_blank" rel="noopener">
                                <img src="${url}" alt="Car Inspection" class="inspection-inline-image"
                                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <div class="inspection-image-error" style="display:none;">
                                    <span>⚠️ Could not load image</span>
                                </div>
                            </a>
                        </div>`;
                } else {
                    const icon = ext === 'pdf' ? '📄' : ext.includes('doc') ? '📝' : ext.includes('xls') ? '📊' : '📎';
                    return `<div>
                            <a class="inspection-view-btn" href="${url}" target="_blank" rel="noopener">
                                ${icon} View Car Inspection (.${ext})
                            </a>
                        </div>`;
                }
            })() : ''}
            </div>`;

        document.getElementById('car-detail-body').innerHTML = galleryHTML + specsHTML;

        // Footer
        const footer = document.getElementById('car-detail-footer');
        let footerHTML = `<button class="btn btn-outline" data-close-modal="car-detail-modal">Close</button>`;
        if (isOwner) {
            footerHTML = `
                <button class="btn btn-outline" data-close-modal="car-detail-modal">Close</button>
                <button class="btn btn-outline" onclick="generatePDF('${car.id}')">📄 PDF</button>
                <button class="btn btn-outline" onclick="UI.closeModal('car-detail-modal'); openEditCar('${car.id}')">✏️ Edit</button>
                <button class="btn btn-danger"  onclick="UI.closeModal('car-detail-modal'); deleteCar('${car.id}')">🗑️ Delete</button>
            `;
        }
        footer.innerHTML = footerHTML;

        UI.openModal('car-detail-modal');
    };

    window.switchGalleryImage = function (url, thumbEl) {
        document.getElementById('gallery-main-img').src = url;
        document.querySelectorAll('.car-gallery-thumb').forEach(t => t.classList.remove('active'));
        thumbEl.classList.add('active');
    };

    // --------------------------------------------------------
    // ADD CAR
    // --------------------------------------------------------
    if (isOwner) {
        addCarBtn?.addEventListener('click', () => openAddCarForm());
    }

    function openAddCarForm() {
        editingCarId = null;
        pendingImages = [];
        existingImages = [];
        pendingInspectionFile = null;
        currentInspectionUrl = null;
        removeInspectionOnSave = false;

        document.getElementById('car-form-title').textContent = 'Add New Car';
        document.getElementById('car-form').reset();
        document.getElementById('car-id').value = '';
        document.getElementById('image-preview-list').innerHTML = '';
        resetInspectionUI();

        if (isOwner) document.getElementById('inspection-section')?.classList.remove('hidden');
        UI.openModal('car-form-modal');
    }

    // --------------------------------------------------------
    // EDIT CAR
    // --------------------------------------------------------
    window.openEditCar = async function (id) {
        if (!isOwner) return;
        const car = allCars.find(c => c.id === id);
        if (!car) return;

        editingCarId = id;
        pendingImages = [];
        existingImages = (car.car_images || []).map(img => ({ ...img }));
        pendingInspectionFile = null;
        currentInspectionUrl = car.inspection_file_url || null;
        removeInspectionOnSave = false;

        document.getElementById('car-form-title').textContent = 'Edit Car';
        document.getElementById('car-id').value = car.id;

        const fields = {
            'cf-brand': car.brand, 'cf-model': car.model, 'cf-year': car.year,
            'cf-trim': car.trim || '', 'cf-color': car.color || '',
            'cf-mileage': car.mileage || 0, 'cf-transmission': car.transmission || '',
            'cf-fuel': car.fuel_type || '', 'cf-engine': car.engine || '',
            'cf-hp': car.horsepower || '', 'cf-body': car.body_type || '',
            'cf-condition': car.condition || 'used', 'cf-price': car.price || 0,
            'cf-currency': car.currency || 'EGP', 'cf-location': car.location || '',
            'cf-status': car.status || 'available', 'cf-vin': car.vin || '',
            'cf-description': car.description || ''
        };
        Object.entries(fields).forEach(([elId, val]) => {
            const el = document.getElementById(elId);
            if (el) el.value = val;
        });

        // Show inspection state
        renderInspectionUI();
        renderImagePreviews();
        UI.openModal('car-form-modal');
    };

    // ── Inspection UI helpers ─────────────────────────────────
    function renderInspectionUI() {
        const currentEl = document.getElementById('inspection-current');
        const uploadArea = document.getElementById('inspection-upload-area');
        const nameEl = document.getElementById('inspection-file-name');
        const linkEl = document.getElementById('view-inspection-link');
        const iconEl = document.querySelector('.inspection-file-icon');

        if (currentInspectionUrl && !removeInspectionOnSave) {
            if (currentEl) { currentEl.style.display = 'flex'; }
            if (uploadArea) { uploadArea.style.display = 'none'; }

            const filename = currentInspectionUrl.split('/').pop().split('?')[0];
            const ext = filename.split('.').pop().toLowerCase();
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);

            if (nameEl) nameEl.textContent = decodeURIComponent(filename);
            if (linkEl) linkEl.href = currentInspectionUrl;

            // If it's an image, swap the icon for a real thumbnail
            if (isImage && iconEl) {
                iconEl.innerHTML = `<img src="${currentInspectionUrl}" alt="Inspection" 
                    style="width:80px; height:60px; object-fit:cover; border-radius:6px; border:1px solid var(--border-color);"
                    onerror="this.outerHTML='📄';">`;
            } else if (iconEl) {
                const icons = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊' };
                iconEl.innerHTML = icons[ext] || '📎';
            }
        } else {
            if (currentEl) currentEl.style.display = 'none';
            if (uploadArea) uploadArea.style.display = '';
        }
    }

    function resetInspectionUI() {
        const currentEl = document.getElementById('inspection-current');
        const uploadArea = document.getElementById('inspection-upload-area');
        const pendingEl = document.getElementById('inspection-pending-name');
        if (currentEl) currentEl.style.display = 'none';
        if (uploadArea) uploadArea.style.display = '';
        if (pendingEl) pendingEl.style.display = 'none';
    }

    // ── Inspection upload ─────────────────────────────────────
    const inspectionInput = document.getElementById('inspection-file-input');
    const inspectionArea = document.getElementById('inspection-upload-area');

    inspectionArea?.addEventListener('click', () => inspectionInput?.click());
    inspectionInput?.addEventListener('change', () => {
        const file = inspectionInput.files[0];
        if (!file) return;
        // Accept any file type — no restriction
        pendingInspectionFile = file;
        removeInspectionOnSave = false;
        // Show pending state
        const pendingEl = document.getElementById('inspection-pending-name');
        const uploadArea = document.getElementById('inspection-upload-area');
        if (pendingEl) {
            pendingEl.style.display = 'flex';
            const ext = file.name.split('.').pop().toLowerCase();
            const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
            if (isImg) {
                const reader = new FileReader();
                reader.onload = e => {
                    pendingEl.innerHTML = `
                        <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-start; width:100%;">
                            <img src="${e.target.result}" alt="Preview" style="max-width:100%; max-height:220px; border-radius:8px; border:1px solid var(--border-color); object-fit:contain;">
                            <span style="font-size:13px; color:var(--text-muted);">📸 ${file.name}</span>
                        </div>`;
                };
                reader.readAsDataURL(file);
            } else {
                const icon = ext === 'pdf' ? '📄' : ext.includes('doc') ? '📝' : ext.includes('xls') ? '📊' : '📎';
                pendingEl.textContent = `${icon} ${file.name}`;
            }
        }
        if (uploadArea) uploadArea.style.display = 'none';
        inspectionInput.value = '';
    });

    document.getElementById('remove-inspection-btn')?.addEventListener('click', () => {
        removeInspectionOnSave = true;
        currentInspectionUrl = null;
        pendingInspectionFile = null;
        renderInspectionUI();
    });

    // ── Car images ────────────────────────────────────────────
    const uploadArea = document.getElementById('upload-area');
    const imagesInput = document.getElementById('car-images-input');

    uploadArea?.addEventListener('click', () => imagesInput.click());
    uploadArea?.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea?.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea?.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleImageFiles(Array.from(e.dataTransfer.files));
    });
    imagesInput?.addEventListener('change', () => {
        handleImageFiles(Array.from(imagesInput.files));
        imagesInput.value = '';
    });

    function handleImageFiles(files) {
        files.filter(f => f.type.startsWith('image/')).forEach(file => {
            pendingImages.push({ file, url: URL.createObjectURL(file) });
        });
        renderImagePreviews();
    }

    function renderImagePreviews() {
        const list = document.getElementById('image-preview-list');
        const all = [
            ...existingImages.map((img, i) => ({ type: 'existing', img, idx: i })),
            ...pendingImages.map((img, i) => ({ type: 'pending', img, idx: i }))
        ];
        list.innerHTML = all.map(({ type, img, idx }) => `
            <div class="image-preview-item ${type === 'existing' && img.is_primary ? 'primary' : ''}">
                <img src="${type === 'existing' ? img.url : img.url}" alt="Preview">
                <button class="remove-img" onclick="removeImage('${type}', ${idx})">✕</button>
            </div>`).join('');
    }

    window.removeImage = function (type, idx) {
        if (type === 'existing') existingImages.splice(idx, 1);
        else pendingImages.splice(idx, 1);
        renderImagePreviews();
    };

    // ── Save Car ──────────────────────────────────────────────
    document.getElementById('save-car-btn')?.addEventListener('click', async () => {
        if (!isOwner) return;
        const btn = document.getElementById('save-car-btn');
        UI.setButtonLoading(btn, true, 'Saving...');

        try {
            const carData = {
                brand: document.getElementById('cf-brand').value.trim(),
                model: document.getElementById('cf-model').value.trim(),
                year: parseInt(document.getElementById('cf-year').value),
                trim: document.getElementById('cf-trim').value.trim() || null,
                color: document.getElementById('cf-color').value.trim() || null,
                mileage: parseInt(document.getElementById('cf-mileage').value) || 0,
                transmission: document.getElementById('cf-transmission').value || null,
                fuel_type: document.getElementById('cf-fuel').value || null,
                engine: document.getElementById('cf-engine').value.trim() || null,
                horsepower: parseInt(document.getElementById('cf-hp').value) || null,
                body_type: document.getElementById('cf-body').value.trim() || null,
                condition: document.getElementById('cf-condition').value,
                price: parseFloat(document.getElementById('cf-price').value) || 0,
                currency: document.getElementById('cf-currency').value,
                location: document.getElementById('cf-location').value.trim() || null,
                status: document.getElementById('cf-status').value,
                vin: document.getElementById('cf-vin').value.trim() || null,
                description: document.getElementById('cf-description').value.trim() || null,
                added_by: profile.id
            };

            if (!carData.brand || !carData.model || !carData.year) {
                UI.showError('Brand, Model, and Year are required');
                return;
            }

            if (carData.year < 1900 || carData.year > 2100) {
                UI.showError('Please enter a valid year (1900 - 2100).');
                return;
            }

            const oldCar = editingCarId ? allCars.find(c => c.id === editingCarId) : null;
            let carId = editingCarId;

            // ── Handle Inspection File ──────────────────────────
            if (removeInspectionOnSave) {
                carData.inspection_file_url = null;
                // Optionally delete from storage (path is embedded in URL)
            }

            if (pendingInspectionFile) {
                const file = pendingInspectionFile;
                const tmpId = editingCarId || 'temp_' + Date.now();
                const ext = file.name.split('.').pop() || 'bin';
                const path = `${tmpId}/${Date.now()}_inspection.${ext}`;
                const { error: upErr } = await client.storage
                    .from('car-inspections')
                    .upload(path, file, { upsert: true });

                if (upErr) {
                    UI.showError('Inspection upload failed: ' + upErr.message);
                    return;
                }
                const { data: signedData } = await client.storage
                    .from('car-inspections')
                    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

                carData.inspection_file_url = signedData?.signedUrl || null;
            }

            if (editingCarId) {
                const { error } = await client.from('cars').update(carData).eq('id', editingCarId);
                if (error) throw error;
            } else {
                const { data, error } = await client.from('cars').insert(carData).select().single();
                if (error) throw error;
                carId = data.id;

                // If inspection was uploaded with temp path, move it
                if (pendingInspectionFile && carData.inspection_file_url?.includes('temp_')) {
                    const ext2 = pendingInspectionFile.name.split('.').pop() || 'bin';
                    const newPath = `${carId}/${Date.now()}_inspection.${ext2}`;
                    await client.storage.from('car-inspections').move(
                        carData.inspection_file_url.split('/car-inspections/')[1]?.split('?')[0] || '',
                        newPath
                    );
                }
            }

            // ── Upload Car Images ────────────────────────────────
            for (let i = 0; i < pendingImages.length; i++) {
                const { file } = pendingImages[i];
                const ext = file.name.split('.').pop();
                const path = `${carId}/${Date.now()}_${i}.${ext}`;
                const { error: uploadErr } = await client.storage.from('car-images').upload(path, file, { upsert: true });
                if (uploadErr) { console.warn('Image upload failed:', uploadErr); continue; }
                const { data: { publicUrl } } = client.storage.from('car-images').getPublicUrl(path);
                await client.from('car_images').insert({
                    car_id: carId, url: publicUrl,
                    is_primary: i === 0 && existingImages.length === 0,
                    sort_order: existingImages.length + i
                });
            }

            // ── Handle Deleted Images ────────────────────────────
            if (editingCarId && oldCar) {
                const origImages = oldCar.car_images || [];
                const keepIds = existingImages.map(img => img.id);
                const toDelete = origImages.filter(img => !keepIds.includes(img.id));
                for (const img of toDelete) {
                    await client.from('car_images').delete().eq('id', img.id);
                }
            }

            // ── Log ──────────────────────────────────────────────
            if (editingCarId && oldCar) {
                const oldData = { price: oldCar.price, status: oldCar.status, mileage: oldCar.mileage };
                const newData = { price: carData.price, status: carData.status, mileage: carData.mileage };

                if (oldCar.inspection_file_url !== carData.inspection_file_url) {
                    const inspAction = removeInspectionOnSave ? 'inspection_removed'
                        : oldCar.inspection_file_url ? 'inspection_replaced' : 'inspection_uploaded';
                    await Logs.record(inspAction, 'car', carId,
                        `${cap(inspAction.replace('_', ' '))} for ${carData.year} ${carData.brand} ${carData.model}`);
                }
                await Logs.record('car_edited', 'car', carId,
                    `Edited: ${carData.year} ${carData.brand} ${carData.model}`, oldData, newData);
            } else {
                await Logs.record('car_added', 'car', carId,
                    `Added: ${carData.year} ${carData.brand} ${carData.model}`,
                    null, { brand: carData.brand, model: carData.model, price: carData.price });
                if (pendingInspectionFile) {
                    await Logs.record('inspection_uploaded', 'car', carId,
                        `Inspection uploaded for ${carData.year} ${carData.brand} ${carData.model}`);
                }
            }

            UI.showSuccess(editingCarId ? 'Car updated successfully!' : 'Car added successfully!');
            UI.closeModal('car-form-modal');
            await loadCars();

        } catch (err) {
            console.error(err);
            UI.showError('Failed to save car: ' + err.message);
        } finally {
            UI.setButtonLoading(btn, false, '💾 Save Car');
        }
    });

    // --------------------------------------------------------
    // DELETE CAR
    // --------------------------------------------------------
    window.deleteCar = async function (id) {
        if (!isOwner) return;
        const car = allCars.find(c => c.id === id);
        if (!car) return;

        const ok = await UI.confirm({
            title: 'Delete Car',
            message: `Delete "${car.year} ${car.brand} ${car.model}"? This cannot be undone.`,
            confirmText: 'Delete',
            type: 'danger',
            icon: '🗑️'
        });
        if (!ok) return;

        try {
            const { error } = await client.from('cars').delete().eq('id', id);
            if (error) throw error;

            await Logs.record('car_deleted', 'car', id,
                `Deleted: ${car.year} ${car.brand} ${car.model}`,
                { brand: car.brand, model: car.model, price: car.price });

            UI.showSuccess('Car deleted successfully');
            await loadCars();
        } catch (err) {
            UI.showError('Failed to delete car: ' + err.message);
        }
    };

    // --------------------------------------------------------
    // PDF GENERATION (Using html2pdf for full Arabic/RTL support)
    // --------------------------------------------------------
    window.generatePDF = async function (id) {
        const car = allCars.find(c => c.id === id);
        if (!car) return;

        UI.showInfo('Generating PDF...');

        try {
            const priceStr = car.price === 0 ? 'Price on Request'
                : new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(car.price);

            const generated = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

            const statusColors = {
                available: '#16a34a', reserved: '#d97706',
                sold: '#c00000', unavailable: '#4b5563'
            };
            const sColor = statusColors[car.status] || '#4b5563';

            // Filter out empty specs
            const specs = [
                { label: 'Brand', value: car.brand },
                { label: 'Model', value: car.model },
                { label: 'Year', value: car.year },
                { label: 'Trim', value: car.trim },
                { label: 'Color', value: car.color },
                { label: 'Mileage', value: car.mileage != null ? UI.formatMileage(car.mileage) : null },
                { label: 'Transmission', value: cap(car.transmission) },
                { label: 'Fuel Type', value: cap(car.fuel_type) },
                { label: 'Engine', value: car.engine },
                { label: 'Horsepower', value: car.horsepower ? `${car.horsepower} HP` : null },
                { label: 'Body Type', value: car.body_type },
                { label: 'Condition', value: cap(car.condition) },
                { label: 'Location', value: car.location },
                { label: 'VIN', value: car.vin },
                { label: 'Date Added', value: UI.formatDate(car.created_at) }
            ].filter(s => s.value && s.value !== '—' && s.value !== '');

            // Helper to get base64 image to prevent tainted canvas errors
            const getBase64 = async (url) => {
                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error('Network error');
                    const blob = await res.blob();
                    return await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.warn('Failed to load image for PDF (CORS issue):', url);
                    return null; // Return null instead of URL to avoid Tainted Canvas
                }
            };

            // Use pre-baked base64 logo (avoids CORS/file:// issues)
            const logoHtml = (typeof window.LOGO_BASE64 !== 'undefined' && window.LOGO_BASE64)
                ? `<img src="${window.LOGO_BASE64}" style="width: 55px; height: 55px; border-radius: 50%; object-fit: cover;">`
                : `<div style="width: 45px; height: 45px; background-color: #c00000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: bold; color: #fff;">S</div>`;

            // Build HTML
            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.top = '-9999px';

            const images = (car.car_images || []).slice(0, 4);
            let imagesHtml = '';
            if (images.length > 0) {
                const base64Images = (await Promise.all(images.map(img => getBase64(img.url)))).filter(b64 => b64 !== null);

                if (base64Images.length > 0) {
                    imagesHtml = `
                    <div style="margin-top: 35px;">
                        <div style="font-size: 14px; font-weight: bold; color: #c00000; margin-bottom: 15px;">CAR IMAGES</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            ${base64Images.map((b64, i) => `
                                <div style="position: relative; border-radius: 8px; overflow: hidden; height: 260px; background: #1e1e1e;">
                                    <img src="${b64}" style="width: 100%; height: 100%; object-fit: cover;">
                                    ${i === 0 ? `<div style="position: absolute; top: 12px; left: 12px; background: #c00000; color: #fff; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 4px;">PRIMARY</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>`;
                }
            }

            let inspectionHtml = '';
            if (car.inspection_file_url) {
                const ext = car.inspection_file_url.split('?')[0].split('.').pop().toLowerCase();
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
                if (isImage) {
                    const inspBase64 = await getBase64(car.inspection_file_url);
                    if (inspBase64) {
                        inspectionHtml = `
                        <div style="margin-top: 35px;">
                            <div style="font-size: 14px; font-weight: bold; color: #c00000; margin-bottom: 15px;">CAR INSPECTION</div>
                            <div style="position: relative; border-radius: 8px; overflow: hidden; background: #1e1e1e; padding: 10px; text-align: center;">
                                <img src="${inspBase64}" style="max-width: 100%; max-height: 800px; object-fit: contain;">
                            </div>
                        </div>`;
                    }
                }
            }

            const page2Content = (imagesHtml || inspectionHtml) ? `
                <div class="html2pdf__page-break" style="page-break-before: always; break-before: page; margin-top: 50px;">
                    ${imagesHtml}
                    ${inspectionHtml}
                </div>
            ` : '';

            container.innerHTML = `
                <div style="width: 800px; background-color: #0a0a0a; color: #fff; font-family: system-ui, -apple-system, sans-serif; padding: 0; box-sizing: border-box;">
                    <!-- Header -->
                    <div style="background-color: #0a0a0a; padding: 25px 40px; border-bottom: 3px solid #c00000; display: flex; align-items: center; gap: 15px;">
                        ${logoHtml}
                        <div>
                            <div style="font-size: 26px; font-weight: 800; letter-spacing: 1px;">SALES AGANCEONLINE</div>
                            <div style="font-size: 13px; color: #aaa;">Premium Automotive Services</div>
                        </div>
                    </div>
                    
                    <!-- Content -->
                    <div style="padding: 30px 40px; min-height: 900px;">
                        <!-- Title Section -->
                        <div style="background-color: #1e1e1e; padding: 25px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 30px; font-weight: 800;" dir="auto">${car.year} ${car.brand} ${car.model}${car.trim ? ' · ' + car.trim : ''}</div>
                                <div style="font-size: 14px; color: #aaa; margin-top: 8px;">Generated: ${generated}</div>
                            </div>
                            <div style="background-color: ${sColor}; color: #fff; padding: 10px 20px; border-radius: 6px; font-weight: bold; text-transform: uppercase; font-size: 15px;">
                                ${car.status}
                            </div>
                        </div>

                        <!-- Price -->
                        <div style="background-color: #c00000; padding: 20px 25px; border-radius: 8px; margin-top: 25px;">
                            <div style="font-size: 14px; font-weight: bold; color: #ffcccc; margin-bottom: 5px;">ASKING PRICE</div>
                            <div style="font-size: 34px; font-weight: 800; color: #fff;" dir="auto">${priceStr}</div>
                        </div>

                        <!-- Specs Table -->
                        <div style="margin-top: 35px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            ${specs.map(s => `
                                <div style="background-color: #1e1e1e; padding: 15px 20px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                                    <span style="color: #aaa; font-weight: bold; font-size: 15px;">${s.label}</span>
                                    <span style="color: #fff; font-weight: 700; font-size: 15px; text-align: right;" dir="auto">${s.value}</span>
                                </div>
                            `).join('')}
                        </div>

                        <!-- Description -->
                        ${car.description ? `
                        <div style="margin-top: 35px;">
                            <div style="font-size: 14px; font-weight: bold; color: #c00000; margin-bottom: 12px;">DESCRIPTION</div>
                            <div style="background-color: #1e1e1e; padding: 25px; border-radius: 8px; font-size: 15px; line-height: 1.7; color: #e5e5e5; white-space: pre-wrap;" dir="auto">${car.description}</div>
                        </div>
                        ` : ''}

                        <!-- Page 2 (Images & Inspection) -->
                        ${page2Content}

                        <!-- Footer Note -->
                        <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #333; font-size: 12px; color: #777; display: flex; justify-content: space-between;">
                            <span>Sales AganceOnline — Confidential Vehicle Report</span>
                            <span>${new Date().toLocaleString('en-GB')}</span>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(container);

            const filename = `${car.year}_${car.brand}_${car.model}_${car.id.slice(0, 8)}.pdf`.replace(/\s+/g, '_');

            const opt = {
                margin: 0,
                filename: filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'] }
            };

            await html2pdf().set(opt).from(container.firstElementChild).save();

            document.body.removeChild(container);

            await Logs.record('car_pdf_generated', 'car', car.id,
                `PDF generated for: ${car.year} ${car.brand} ${car.model}`);

            // Small delay to allow the download window to trigger before hiding the toast
            setTimeout(() => {
                UI.showSuccess('PDF downloaded successfully!');
            }, 1000);

        } catch (err) {
            console.error(err);
            UI.showError('PDF generation failed: ' + err.message);
        }
    };

    // --------------------------------------------------------
    // DEEP LINK
    // --------------------------------------------------------
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        await loadCars();
        const car = allCars.find(c => c.id === hash);
        if (car) openCarDetail(car.id);
    } else {
        await loadCars();
    }

    // ── REALTIME ──────────────────────────────────────────────
    Realtime.autoRefresh('cars', () => loadCars(), { showToast: true, debounce: 700 });
    Realtime.autoRefresh('car_images', () => loadCars(), { showToast: false, debounce: 800 });

    // ── HELPER ────────────────────────────────────────────────
    function cap(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

})();
