// ============================================================
// CARS JS - Sales AganceOnline
// Full car inventory CRUD, search, filter, detail modal
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
        if (await UI.confirm({ title:'Sign Out', message:'Sure you want to sign out?', confirmText:'Sign Out', icon:'🚪' }))
            await Auth.logout();
    });

    // --------------------------------------------------------
    // STATE
    // --------------------------------------------------------
    let allCars = [];
    let pendingImages = []; // {file, url} for new uploads
    let editingCarId = null;
    let existingImages = []; // {id, url, is_primary} for edit mode

    // --------------------------------------------------------
    // LOAD CARS
    // --------------------------------------------------------
    async function loadCars() {
        const grid = document.getElementById('cars-grid');
        grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:60px;"><div class="loader-spinner" style="width:40px;height:40px;border-width:3px;"></div></div>`;

        try {
            const { data, error } = await client
                .from('cars')
                .select(`*, car_images(id, url, is_primary, sort_order)`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            allCars = data || [];
            renderCars(allCars);
        } catch (err) {
            console.error(err);
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--color-danger);padding:60px;">Failed to load cars. ${err.message}</div>`;
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
            grid.innerHTML = `
                <div style="grid-column:1/-1;">
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
                ? `<img src="${primary.url}" alt="${car.brand} ${car.model}" loading="lazy">`
                : `<div class="car-card-image-placeholder">🚗</div>`;

            const ownerActions = isOwner ? `
                <div class="car-card-actions">
                    <button class="car-card-action-btn edit" data-id="${car.id}" onclick="event.stopPropagation(); openEditCar('${car.id}')">✏️</button>
                    <button class="car-card-action-btn delete" data-id="${car.id}" onclick="event.stopPropagation(); deleteCar('${car.id}')">🗑️</button>
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
                            ${car.mileage !== null ? `<span class="car-card-spec"><span class="car-card-spec-icon">🛣️</span>${UI.formatMileage(car.mileage)}</span>` : ''}
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
    // SEARCH & FILTER
    // --------------------------------------------------------
    function applyFilters() {
        const search = document.getElementById('search-input').value.toLowerCase().trim();
        const status = document.getElementById('filter-status').value;
        const transmission = document.getElementById('filter-transmission').value;
        const fuel = document.getElementById('filter-fuel').value;

        let filtered = allCars;

        if (search) {
            filtered = filtered.filter(c =>
                c.brand.toLowerCase().includes(search) ||
                c.model.toLowerCase().includes(search) ||
                (c.trim || '').toLowerCase().includes(search) ||
                (c.location || '').toLowerCase().includes(search) ||
                String(c.year).includes(search)
            );
        }
        if (status) filtered = filtered.filter(c => c.status === status);
        if (transmission) filtered = filtered.filter(c => c.transmission === transmission);
        if (fuel) filtered = filtered.filter(c => c.fuel_type === fuel);

        renderCars(filtered);
    }

    document.getElementById('search-input')?.addEventListener('input', applyFilters);
    document.getElementById('filter-status')?.addEventListener('change', applyFilters);
    document.getElementById('filter-transmission')?.addEventListener('change', applyFilters);
    document.getElementById('filter-fuel')?.addEventListener('change', applyFilters);

    document.getElementById('clear-filters')?.addEventListener('click', () => {
        document.getElementById('search-input').value = '';
        document.getElementById('filter-status').value = '';
        document.getElementById('filter-transmission').value = '';
        document.getElementById('filter-fuel').value = '';
        renderCars(allCars);
    });

    // --------------------------------------------------------
    // OPEN CAR DETAIL MODAL
    // --------------------------------------------------------
    window.openCarDetail = function(id) {
        const car = allCars.find(c => c.id === id);
        if (!car) return;

        const images = car.car_images || [];
        const primary = images.find(i => i.is_primary) || images[0];

        document.getElementById('car-detail-heading').textContent = `${car.year} ${car.brand} ${car.model}`;

        // Build gallery
        const galleryHTML = `
            <div class="car-gallery">
                <div class="car-gallery-main">
                    <img id="gallery-main-img" src="${primary?.url || ''}" alt="${car.brand} ${car.model}"
                        onerror="this.parentElement.innerHTML='<div class=\\'car-card-image-placeholder\\'  style=\\'height:100%\\'>🚗</div>'">
                </div>
                ${images.length > 1 ? `
                    <div class="car-gallery-thumbs">
                        ${images.map((img, i) => `
                            <div class="car-gallery-thumb ${img.is_primary || i===0 ? 'active' : ''}"
                                onclick="switchGalleryImage('${img.url}', this)">
                                <img src="${img.url}" alt="Car image ${i+1}" loading="lazy">
                            </div>`).join('')}
                    </div>` : ''}
            </div>`;

        // Build specs
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
                    <div class="car-detail-title">${car.model} ${car.year}${car.trim ? ' · '+car.trim : ''}</div>
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
            </div>`;

        document.getElementById('car-detail-body').innerHTML = galleryHTML + specsHTML;

        // Footer buttons for owner
        const footer = document.getElementById('car-detail-footer');
        let footerHTML = '<button class="btn btn-outline" data-close-modal="car-detail-modal">Close</button>';
        if (isOwner) {
            footerHTML = `
                <button class="btn btn-outline" data-close-modal="car-detail-modal">Close</button>
                <button class="btn btn-outline" onclick="UI.closeModal('car-detail-modal'); openEditCar('${car.id}')">✏️ Edit</button>
                <button class="btn btn-danger" onclick="UI.closeModal('car-detail-modal'); deleteCar('${car.id}')">🗑️ Delete</button>
            `;
        }
        footer.innerHTML = footerHTML;

        UI.openModal('car-detail-modal');
    };

    window.switchGalleryImage = function(url, thumbEl) {
        document.getElementById('gallery-main-img').src = url;
        document.querySelectorAll('.car-gallery-thumb').forEach(t => t.classList.remove('active'));
        thumbEl.classList.add('active');
    };

    // --------------------------------------------------------
    // ADD CAR
    // --------------------------------------------------------
    if (isOwner) {
        addCarBtn?.addEventListener('click', () => {
            openAddCarForm();
        });
    }

    function openAddCarForm() {
        editingCarId = null;
        pendingImages = [];
        existingImages = [];
        document.getElementById('car-form-title').textContent = 'Add New Car';
        document.getElementById('car-form').reset();
        document.getElementById('car-id').value = '';
        document.getElementById('image-preview-list').innerHTML = '';
        UI.openModal('car-form-modal');
    }

    window.openEditCar = async function(id) {
        if (!isOwner) return;
        const car = allCars.find(c => c.id === id);
        if (!car) return;

        editingCarId = id;
        pendingImages = [];
        existingImages = (car.car_images || []).map(img => ({ ...img }));

        document.getElementById('car-form-title').textContent = 'Edit Car';
        document.getElementById('car-id').value = car.id;

        // Fill fields
        const fields = {
            'cf-brand': car.brand, 'cf-model': car.model, 'cf-year': car.year,
            'cf-trim': car.trim||'', 'cf-color': car.color||'', 'cf-mileage': car.mileage||0,
            'cf-transmission': car.transmission||'', 'cf-fuel': car.fuel_type||'',
            'cf-engine': car.engine||'', 'cf-hp': car.horsepower||'',
            'cf-body': car.body_type||'', 'cf-condition': car.condition||'used',
            'cf-price': car.price||0, 'cf-currency': car.currency||'USD',
            'cf-location': car.location||'', 'cf-status': car.status||'available',
            'cf-vin': car.vin||'', 'cf-description': car.description||''
        };
        Object.entries(fields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });

        // Show existing images
        renderImagePreviews();
        UI.openModal('car-form-modal');
    };

    // Image upload
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
            const url = URL.createObjectURL(file);
            pendingImages.push({ file, url });
        });
        renderImagePreviews();
    }

    function renderImagePreviews() {
        const list = document.getElementById('image-preview-list');
        const allImages = [
            ...existingImages.map((img, i) => ({ type: 'existing', img, idx: i })),
            ...pendingImages.map((img, i) => ({ type: 'pending', img, idx: i }))
        ];

        list.innerHTML = allImages.map(({ type, img, idx }) => `
            <div class="image-preview-item ${type === 'existing' && img.is_primary ? 'primary' : ''}">
                <img src="${type === 'existing' ? img.url : img.url}" alt="Preview">
                <button class="remove-img" onclick="removeImage('${type}', ${idx})">✕</button>
            </div>`).join('');
    }

    window.removeImage = function(type, idx) {
        if (type === 'existing') existingImages.splice(idx, 1);
        else pendingImages.splice(idx, 1);
        renderImagePreviews();
    };

    // Save car
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

            let carId = editingCarId;

            if (editingCarId) {
                const { error } = await client.from('cars').update(carData).eq('id', editingCarId);
                if (error) throw error;
            } else {
                const { data, error } = await client.from('cars').insert(carData).select().single();
                if (error) throw error;
                carId = data.id;
            }

            // Upload pending images to Supabase storage
            if (pendingImages.length > 0) {
                for (let i = 0; i < pendingImages.length; i++) {
                    const { file } = pendingImages[i];
                    const ext = file.name.split('.').pop();
                    const path = `${carId}/${Date.now()}_${i}.${ext}`;

                    const { data: uploaded, error: uploadErr } = await client.storage
                        .from('car-images')
                        .upload(path, file, { upsert: true });

                    if (uploadErr) {
                        console.warn('Image upload failed:', uploadErr);
                        continue;
                    }

                    const { data: { publicUrl } } = client.storage.from('car-images').getPublicUrl(path);
                    await client.from('car_images').insert({
                        car_id: carId,
                        url: publicUrl,
                        is_primary: i === 0 && existingImages.length === 0,
                        sort_order: existingImages.length + i
                    });
                }
            }

            // Handle deleted existing images
            if (editingCarId) {
                const origCar = allCars.find(c => c.id === editingCarId);
                const origImages = origCar?.car_images || [];
                const existingIds = existingImages.map(img => img.id);
                const deletedImages = origImages.filter(img => !existingIds.includes(img.id));
                for (const img of deletedImages) {
                    await client.from('car_images').delete().eq('id', img.id);
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
    window.deleteCar = async function(id) {
        if (!isOwner) return;
        const car = allCars.find(c => c.id === id);
        if (!car) return;

        const ok = await UI.confirm({
            title: 'Delete Car',
            message: `Are you sure you want to delete "${car.year} ${car.brand} ${car.model}"? This cannot be undone.`,
            confirmText: 'Delete',
            type: 'danger',
            icon: '🗑️'
        });
        if (!ok) return;

        try {
            const { error } = await client.from('cars').delete().eq('id', id);
            if (error) throw error;
            UI.showSuccess('Car deleted successfully');
            await loadCars();
        } catch (err) {
            UI.showError('Failed to delete car: ' + err.message);
        }
    };

    // --------------------------------------------------------
    // DEEP LINK: open car from hash
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
    Realtime.autoRefresh('cars', () => {
        loadCars();
    }, { showToast: true, debounce: 700 });

    Realtime.autoRefresh('car_images', () => {
        loadCars();
    }, { showToast: false, debounce: 800 });

    // --------------------------------------------------------
    // HELPER
    // --------------------------------------------------------
    function cap(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

})();

