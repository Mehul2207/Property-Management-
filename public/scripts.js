const API_BASE = '/api';

let loggedInUser = null;

async function loadUser() {
    console.log('loadUser: Starting session validation');
    const user = localStorage.getItem('user');
    if (user) {
        try {
            loggedInUser = JSON.parse(user);
            console.log('loadUser: Found user in localStorage:', loggedInUser);
            const response = await fetchWithAuth(`${API_BASE}/session`, {
                timeout: 5000
            });
            if (response.ok) {
                const validatedUser = await response.json();
                loggedInUser = validatedUser;
                localStorage.setItem('user', JSON.stringify(validatedUser));
                console.log('loadUser: Session validated successfully:', validatedUser);
            } else {
                console.warn('loadUser: Session validation failed, status:', response.status);
                showError('Session validation failed. Using cached user data.');
            }
        } catch (err) {
            console.error('loadUser: Session validation error:', err.message);
            showError('Failed to validate session. Using cached user data.');
        }
    } else {
        console.log('loadUser: No user found in localStorage');
        loggedInUser = null;
    }
    updateNavbar();
    checkFormValidity();
}

function saveUser(user) {
    loggedInUser = user;
    localStorage.setItem('user', JSON.stringify(user));
    updateNavbar();
}

function logout() {
    loggedInUser = null;
    localStorage.removeItem('user');
    updateNavbar();
    window.location.href = 'index.html';
}

function updateNavbar() {
    const navbarLinks = document.getElementById('navbar-links');
    if (!navbarLinks) {
        console.warn('updateNavbar: navbar-links element not found');
        return;
    }
    console.log('updateNavbar: Updating navbar, loggedInUser:', loggedInUser);
    navbarLinks.innerHTML = `
        <a href="index.html" class="font-semibold px-3 py-2 rounded">Home</a>
        <a href="apartments.html" class="font-semibold px-3 py-2 rounded">Apartments</a>
        <a href="bungalows.html" class="font-semibold px-3 py-2 rounded">Bungalows</a>
        <a href="commercial.html" class="font-semibold px-3 py-2 rounded">Commercial</a>
        <a href="land.html" class="font-semibold px-3 py-2 rounded">Land</a>
        <a href="about.html" class="font-semibold px-3 py-2 rounded">About Us</a>
        ${loggedInUser ? `
            <a href="add-listing.html" class="font-semibold px-3 py-2 rounded">Add Listing</a>
            <a href="profile.html" class="font-semibold px-3 py-2 rounded">Profile</a>
            ${['Admin', 'Owner'].includes(loggedInUser.role_name) ? `
                <a href="admin.html" class="font-semibold px-3 py-2 rounded">Admin Dashboard</a>
            ` : ''}
            <a href="#" onclick="logout()" class="font-semibold px-3 py-2 rounded">Logout</a>
        ` : `
            <a href="login.html" class="font-semibold px-3 py-2 rounded">Login</a>
            <a href="signup.html" class="font-semibold px-3 py-2 rounded">Signup</a>
        `}
    `;
}

function showError(message, fieldId = null) {
    console.log('showError:', message, 'fieldId:', fieldId);
    if (fieldId) {
        const errorElement = document.getElementById(`error-${fieldId}`);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
        }
    } else {
        const formErrors = document.getElementById('form-errors');
        if (formErrors) {
            formErrors.textContent = message;
            formErrors.classList.remove('hidden');
        } else {
            alert(`Error: ${message}`);
        }
    }
}

function clearErrors() {
    const formErrors = document.getElementById('form-errors');
    if (formErrors) {
        formErrors.textContent = '';
        formErrors.classList.add('hidden');
    }
    document.querySelectorAll('[id^="error-"]').forEach(el => {
        el.textContent = '';
        el.classList.add('hidden');
    });
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.toggle('hidden', !show);
    }
}

function checkFormValidity() {
    const title = document.getElementById('listing-title')?.value;
    const price = document.getElementById('listing-price')?.value;
    const address = document.getElementById('listing-address')?.value;
    const type = document.getElementById('listing-type')?.value;
    let isValid = title && price && address && type;

    if (type) {
        if (type === 'apartment') {
            const rooms = document.getElementById('apt-rooms')?.value;
            const bathrooms = document.getElementById('apt-bathrooms')?.value;
            const carpetArea = document.getElementById('apt-carpet-area')?.value;
            isValid = isValid && rooms && bathrooms && carpetArea;
        } else if (type === 'bungalow') {
            const bedrooms = document.getElementById('bung-bedrooms')?.value;
            const bathrooms = document.getElementById('bung-bathrooms')?.value;
            const totalArea = document.getElementById('bung-total-area')?.value;
            isValid = isValid && bedrooms && bathrooms && totalArea;
        } else if (type === 'commercial') {
            const floors = document.getElementById('comm-floors')?.value;
            const totalArea = document.getElementById('comm-total-area')?.value;
            isValid = isValid && floors && totalArea;
        } else if (type === 'land') {
            const area = document.getElementById('land-area')?.value;
            isValid = isValid && area;
        }
    }

    const submitButton = document.getElementById('submit-listing');
    if (submitButton) {
        submitButton.disabled = !isValid || !loggedInUser;
    }
}

function addFormListeners() {
    const inputs = document.querySelectorAll('#listing-title, #listing-price, #listing-address, #listing-type, [id^=apt-], [id^=bung-], [id^=comm-], [id^=land-]');
    inputs.forEach(input => {
        input?.addEventListener('input', () => {
            clearErrors();
            checkFormValidity();
        });
    });
}

async function fetchWithAuth(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (loggedInUser) {
        options.headers['x-user-id'] = loggedInUser.user_id;
    }
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);
        options.signal = controller.signal;

        const response = await fetch(url, options);
        clearTimeout(timeoutId);

        if (response.status === 401 || response.status === 403) {
            console.warn(`fetchWithAuth: Auth error on ${url}: ${response.status}`);
            const error = await response.json();
            throw new Error(error.error || 'Access denied');
        }
        return response;
    } catch (err) {
        console.error(`fetchWithAuth: Error on ${url}:`, err.message);
        throw err;
    }
}

async function fetchProperties() {
    try {
        showLoading(true);
        const search = document.getElementById('search-input')?.value || '';
        const type = document.getElementById('filter-type')?.value || '';
        const priceMin = document.getElementById('filter-price-min')?.value || '';
        const priceMax = document.getElementById('filter-price-max')?.value || '';
        const params = new URLSearchParams({ status: 'available' });
        if (search) params.append('search', search);
        if (type) params.append('type', type);
        if (priceMin) params.append('price_min', priceMin);
        if (priceMax) params.append('price_max', priceMax);

        console.log('fetchProperties: Fetching with params:', params.toString());
        const response = await fetchWithAuth(`${API_BASE}/properties?${params}`);
        if (!response.ok) {
            console.error('fetchProperties: Failed, status:', response.status);
            throw new Error('Failed to fetch properties');
        }
        const properties = await response.json();
        console.log('fetchProperties: Fetched properties:', properties.length);
        const propertyList = document.getElementById('property-list');
        if (!propertyList) {
            console.warn('fetchProperties: property-list element not found');
            return;
        }
        propertyList.innerHTML = properties.length ? properties.map(prop => `
            <div class="property-card p-6 rounded-xl">
                <img src="${prop.image_url || 'assets/images/placeholder.jpg'}" alt="${prop.title}" class="w-full h-48 object-cover rounded-lg mb-4 border border-gray-200">
                <h3 class="text-xl font-bold">${prop.title}</h3>
                <p class="text-neutral-text">${prop.address}</p>
                <p class="font-bold text-lg">$${prop.price}</p>
                <a href="property-details.html?id=${prop.property_id}" class="text-primary hover:text-secondary">View Details</a>
            </div>
        `).join('') : '<p class="text-center col-span-3 text-neutral-text">No properties found.</p>';
    } catch (err) {
        console.error('fetchProperties: Error:', err.message);
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

function searchProperties() {
    fetchProperties();
}

function filterProperties() {
    fetchProperties();
}

async function fetchApartments() {
    try {
        showLoading(true);
        const response = await fetchWithAuth(`${API_BASE}/apartments`);
        if (!response.ok) throw new Error('Failed to fetch apartments');
        const apartments = await response.json();
        const apartmentList = document.getElementById('apartment-list');
        if (!apartmentList) return;
        apartmentList.innerHTML = apartments.map(apt => `
            <div class="property-card p-6 rounded-xl">
                <img src="${apt.image_url || 'assets/images/placeholder.jpg'}" alt="${apt.title}" class="w-full h-48 object-cover rounded-lg mb-4 border border-gray-200">
                <h3 class="text-xl font-bold">${apt.title}</h3>
                <p class="text-neutral-text">${apt.address}</p>
                <p class="font-bold text-lg">$${apt.price}</p>
                <p>Rooms: ${apt.rooms}, Bathrooms: ${apt.bathrooms}</p>
                <a href="property-details.html?id=${apt.property_id}" class="text-primary hover:text-secondary">View Details</a>
            </div>
        `).join('');
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

async function fetchBungalows() {
    try {
        showLoading(true);
        const response = await fetchWithAuth(`${API_BASE}/bungalows`);
        if (!response.ok) throw new Error('Failed to fetch bungalows');
        const bungalows = await response.json();
        const bungalowList = document.getElementById('bungalow-list');
        if (!bungalowList) return;
        bungalowList.innerHTML = bungalows.map(bung => `
            <div class="property-card p-6 rounded-xl">
                <img src="${bung.image_url || 'assets/images/placeholder.jpg'}" alt="${bung.title}" class="w-full h-48 object-cover rounded-lg mb-4 border border-gray-200">
                <h3 class="text-xl font-bold">${bung.title}</h3>
                <p class="text-neutral-text">${bung.address}</p>
                <p class="font-bold text-lg">$${bung.price}</p>
                <p>Bedrooms: ${bung.bedrooms}, Garden: ${bung.garden ? 'Yes' : 'No'}</p>
                <a href="property-details.html?id=${bung.property_id}" class="text-primary hover:text-secondary">View Details</a>
            </div>
        `).join('');
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

async function fetchCommercial() {
    try {
        showLoading(true);
        const response = await fetchWithAuth(`${API_BASE}/commercial`);
        if (!response.ok) throw new Error('Failed to fetch commercial complexes');
        const complexes = await response.json();
        const commercialList = document.getElementById('commercial-list');
        if (!commercialList) return;
        commercialList.innerHTML = complexes.map(comp => `
            <div class="property-card p-6 rounded-xl">
                <img src="${comp.image_url || 'assets/images/placeholder.jpg'}" alt="${comp.title}" class="w-full h-48 object-cover rounded-lg mb-4 border border-gray-200">
                <h3 class="text-xl font-bold">${comp.title}</h3>
                <p class="text-neutral-text">${comp.address}</p>
                <p class="font-bold text-lg">$${comp.price}</p>
                <p>Floors: ${comp.floors}, Lift: ${comp.lift_available ? 'Yes' : 'No'}</p>
                <a href="property-details.html?id=${comp.property_id}" class="text-primary hover:text-secondary">View Details</a>
            </div>
        `).join('');
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

async function fetchLand() {
    try {
        showLoading(true);
        const response = await fetchWithAuth(`${API_BASE}/land`);
        if (!response.ok) throw new Error('Failed to fetch land');
        const lands = await response.json();
        const landList = document.getElementById('land-list');
        if (!landList) return;
        landList.innerHTML = lands.map(land => `
            <div class="property-card p-6 rounded-xl">
                <img src="${land.image_url || 'assets/images/placeholder.jpg'}" alt="${land.title}" class="w-full h-48 object-cover rounded-lg mb-4 border border-gray-200">
                <h3 class="text-xl font-bold">${land.title}</h3>
                <p class="text-neutral-text">${land.address}</p>
                <p class="font-bold text-lg">$${land.price}</p>
                <p>Area: ${land.area} sq.ft, Zone: ${land.zone}</p>
                <a href="property-details.html?id=${land.property_id}" class="text-primary hover:text-secondary">View Details</a>
            </div>
        `).join('');
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

async function fetchPropertyDetails() {
    try {
        showLoading(true);
        const urlParams = new URLSearchParams(window.location.search);
        const propertyId = urlParams.get('id');
        const response = await fetchWithAuth(`${API_BASE}/properties/${propertyId}`);
        if (!response.ok) throw new Error('Failed to fetch property details');
        const property = await response.json();

        const detailsDiv = document.getElementById('property-details');
        if (!detailsDiv) return;
        detailsDiv.innerHTML = `
            <h2 class="text-2xl font-bold mb-4">${property.title}</h2>
            <p class="text-neutral-text">${property.address}</p>
            <p class="font-bold text-xl">$${property.price}</p>
            <p>Status: ${property.status}</p>
            ${property.type === 'apartment' ? `
                <p>Rooms: ${property.rooms}, Bathrooms: ${property.bathrooms}</p>
                <p>Carpet Area: ${property.carpet_area} sq.ft</p>
                <p>Floor: ${property.floor_number}</p>
            ` : property.type === 'bungalow' ? `
                <p>Bedrooms: ${property.bedrooms}, Garden: ${property.garden ? 'Yes' : 'No'}</p>
                <p>Total Area: ${property.total_area} sq.ft</p>
            ` : property.type === 'commercial' ? `
                <p>Floors: ${property.floors}, Lift: ${property.lift_available ? 'Yes' : 'No'}</p>
                <p>Total Area: ${property.total_area} sq.ft</p>
            ` : property.type === 'land' ? `
                <p>Area: ${property.area} sq.ft, Zone: ${property.zone}</p>
            ` : ''}
            ${property.status === 'available' && loggedInUser ? `
                <button onclick="confirmBuy(${property.property_id}, ${property.price})" class="btn btn-success mt-4">Buy Property</button>
            ` : ''}
        `;

        const imagesResponse = await fetchWithAuth(`${API_BASE}/properties/${propertyId}/images`);
        if (!imagesResponse.ok) throw new Error('Failed to fetch property images');
        const images = await imagesResponse.json();
        const imagesDiv = document.getElementById('property-images');
        if (imagesDiv) {
            imagesDiv.innerHTML = `
                <div class="relative">
                    <div id="image-carousel" class="flex overflow-x-auto snap-x snap-mandatory">
                        ${images.map(img => `
                            <img src="${img.image_url || 'assets/images/placeholder.jpg'}" alt="Property Image" class="w-full h-96 object-cover snap-center cursor-pointer hover:scale-105 transition">
                        `).join('')}
                    </div>
                    <button onclick="prevImage()" class="absolute left-0 top-1/2 transform -translate-y-1/2 bg-primary bg-opacity-50 text-white p-2 hover:bg-secondary">❮</button>
                    <button onclick="nextImage()" class="absolute right-0 top-1/2 transform -translate-y-1/2 bg-primary bg-opacity-50 text-white p-2 hover:bg-secondary">❯</button>
                </div>
            `;
        }

        const ownerResponse = await fetchWithAuth(`${API_BASE}/users/${property.owner_id}`);
        if (!ownerResponse.ok) throw new Error('Failed to fetch owner info');
        const owner = await ownerResponse.json();
        const ownerDiv = document.getElementById('owner-info');
        if (ownerDiv) {
            ownerDiv.innerHTML = `
                <h3 class="text-xl font-bold mb-2">Owner Information</h3>
                <p>Name: ${owner.name}</p>
                <p>Email: ${owner.email}</p>
                <p>Phone: ${owner.phone}</p>
            `;
        }

        const reviewsResponse = await fetchWithAuth(`${API_BASE}/properties/${propertyId}/reviews`);
        if (!reviewsResponse.ok) throw new Error('Failed to fetch reviews');
        const reviews = await reviewsResponse.json();
        const reviewsDiv = document.getElementById('reviews');
        if (reviewsDiv) {
            reviewsDiv.innerHTML = `
                <h3 class="text-xl font-bold mb-4">User Reviews</h3>
                ${reviews.length ? reviews.map(review => `
                    <div class="bg-white p-4 rounded-lg mb-4 shadow">
                        <p class="font-bold">Rating: ${review.rating}/5</p>
                        <p>${review.comment}</p>
                        <p class="text-sm text-neutral-text">By User ID: ${review.user_id}</p>
                    </div>
                `).join('') : '<p>No reviews yet.</p>'}
            `;
        }
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

let currentImageIndex = 0;
function prevImage() {
    const carousel = document.getElementById('image-carousel');
    if (!carousel) return;
    currentImageIndex = Math.max(currentImageIndex - 1, 0);
    carousel.scrollTo({ left: carousel.children[currentImageIndex].offsetLeft, behavior: 'smooth' });
}

function nextImage() {
    const carousel = document.getElementById('image-carousel');
    if (!carousel) return;
    currentImageIndex = Math.min(currentImageIndex + 1, carousel.children.length - 1);
    carousel.scrollTo({ left: carousel.children[currentImageIndex].offsetLeft, behavior: 'smooth' });
}

async function fetchUserListings() {
    if (!loggedInUser) {
        showError('Please login to view your profile.');
        window.location.href = 'login.html';
        return;
    }
    try {
        showLoading(true);
        const response = await fetchWithAuth(`${API_BASE}/users/${loggedInUser.user_id}/listings`);
        if (!response.ok) throw new Error('Failed to fetch your listings');
        const listings = await response.json();
        const userListings = document.getElementById('user-listings');
        if (!userListings) return;
        userListings.innerHTML = listings.length ? listings.map(prop => `
            <div class="property-card p-6 rounded-xl">
                <img src="${prop.image_url || 'assets/images/placeholder.jpg'}" alt="${prop.title}" class="w-full h-48 object-cover rounded-lg mb-4 border border-gray-200">
                <h3 class="text-xl font-bold">${prop.title}</h3>
                <p class="text-neutral-text">${prop.address}</p>
                <p class="font-bold text-lg">$${prop.price}</p>
                <p>Status: ${prop.status}</p>
                <a href="property-details.html?id=${prop.property_id}" class="text-primary hover:text-secondary">View Details</a>
            </div>
        `).join('') : '<p class="text-center col-span-3 text-neutral-text">You have no listings yet.</p>';

        const userName = document.getElementById('user-name');
        const userEmail = document.getElementById('user-email');
        const userPhone = document.getElementById('user-phone');
        if (userName) userName.textContent = `Name: ${loggedInUser.name}`;
        if (userEmail) userEmail.textContent = `Email: ${loggedInUser.email}`;
        if (userPhone) userPhone.textContent = `Phone: ${loggedInUser.phone || 'N/A'}`;
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

async function fetchAdminDashboard() {
    if (!loggedInUser || !['Admin', 'Owner'].includes(loggedInUser.role_name)) {
        showError('Access denied. Admins and Owners only.');
        window.location.href = 'index.html';
        return;
    }
    try {
        showLoading(true);

        const propResponse = await fetchWithAuth(`${API_BASE}/properties`);
        if (!propResponse.ok) throw new Error('Failed to fetch properties');
        const properties = await propResponse.json();
        const adminProperties = document.getElementById('admin-properties');
        if (adminProperties) {
            adminProperties.innerHTML = properties.length ? properties.map(prop => `
                <div class="property-card p-6 rounded-xl flex justify-between items-center">
                    <div class="flex items-center">
                        <img src="${prop.image_url || 'assets/images/placeholder.jpg'}" alt="${prop.title}" class="w-24 h-24 object-cover rounded-lg mr-4 border border-gray-200">
                        <div>
                            <h3 class="text-xl font-bold">${prop.title}</h3>
                            <p class="text-neutral-text">${prop.address}</p>
                            <p class="font-bold">$${prop.price}</p>
                        </div>
                    </div>
                    <button onclick="deleteProperty(${prop.property_id})" class="btn btn-error flex items-center">
                        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        Delete
                    </button>
                </div>
            `).join('') : '<p class="text-center text-neutral-text">No properties found.</p>';
        }

        const userResponse = await fetchWithAuth(`${API_BASE}/users`);
        if (!userResponse.ok) throw new Error('Failed to fetch users');
        const users = await userResponse.json();
        const adminUsers = document.getElementById('admin-users');
        if (adminUsers) {
            adminUsers.innerHTML = users.map(user => `
                <div class="user-card p-6 rounded-xl flex justify-between items-center">
                    <div>
                        <p class="text-lg"><strong>Name:</strong> ${user.name}</p>
                        <p class="text-neutral-text"><strong>Email:</strong> ${user.email}</p>
                        <p><strong>Role:</strong> ${user.role_name}</p>
                    </div>
                    ${loggedInUser.role_name === 'Owner' && user.role_name !== 'Owner' ? `
                        <div class="flex space-x-2">
                            ${user.role_name === 'User' ? `
                                <button onclick="promoteUser('${user.user_id}')" class="btn btn-success flex items-center">
                                    <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>
                                    Promote
                                </button>
                            ` : `
                                <button onclick="demoteUser('${user.user_id}')" class="btn btn-accent flex items-center">
                                    <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                    Demote
                                </button>
                            `}
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

async function deleteProperty(propertyId) {
    if (!confirm('Are you sure you want to delete this property?')) return;
    try {
        const response = await fetchWithAuth(`${API_BASE}/properties/${propertyId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete property');
        alert('Property deleted successfully!');
        fetchAdminDashboard();
    } catch (err) {
        showError(err.message);
    }
}

async function promoteUser(userId) {
    if (!confirm('Promote this user to Admin?')) return;
    try {
        const response = await fetchWithAuth(`${API_BASE}/users/${userId}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_name: 'Admin' })
        });
        if (!response.ok) throw new Error('Failed to promote user');
        alert('User promoted to Admin!');
        if (userId === loggedInUser.user_id) {
            loggedInUser.role_name = 'Admin';
            saveUser(loggedInUser);
        }
        fetchAdminDashboard();
    } catch (err) {
        showError(err.message);
    }
}

async function demoteUser(userId) {
    if (!confirm('Demote this user to User?')) return;
    try {
        const response = await fetchWithAuth(`${API_BASE}/users/${userId}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_name: 'User' })
        });
        if (!response.ok) throw new Error('Failed to demote user');
        alert('User demoted to User!');
        if (userId === loggedInUser.user_id) {
            loggedInUser.role_name = 'User';
            saveUser(loggedInUser);
            window.location.href = 'index.html';
        } else {
            fetchAdminDashboard();
        }
    } catch (err) {
        showError(err.message);
    }
}

async function handleLogin() {
    try {
        const name = document.getElementById('login-name').value;
        const email = document.getElementById('login-email').value;
        const response = await fetchWithAuth(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email })
        });
        if (!response.ok) throw new Error('Invalid credentials');
        const user = await response.json();
        saveUser(user);
        alert('Login successful!');
        window.location.href = 'index.html';
    } catch (err) {
        showError(err.message);
    }
}

async function handleSignup() {
    try {
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const userId = document.getElementById('signup-userid').value;
        const phone = document.getElementById('signup-phone').value;
        const response = await fetchWithAuth(`${API_BASE}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, user_id: userId, phone, role_id: 2 })
        });
        if (!response.ok) throw new Error('Signup failed');
        const user = await response.json();
        saveUser(user);
        alert('Signup successful!');
        window.location.href = 'index.html';
    } catch (err) {
        showError(err.message);
    }
}

async function submitReview() {
    if (!loggedInUser) {
        showError('Please login to submit a review.');
        window.location.href = 'login.html';
        return;
    }
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const propertyId = urlParams.get('id');
        const rating = document.getElementById('review-rating').value;
        const comment = document.getElementById('review-comment').value;
        if (!rating || rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');
        const response = await fetchWithAuth(`${API_BASE}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ property_id: propertyId, user_id: loggedInUser.user_id, rating, comment })
        });
        if (!response.ok) throw new Error('Failed to submit review');
        alert('Review submitted!');
        fetchPropertyDetails();
    } catch (err) {
        showError(err.message);
    }
}

function confirmBuy(propertyId, price) {
    if (!loggedInUser) {
        showError('Please login to buy a property.');
        window.location.href = 'login.html';
        return;
    }
    if (confirm('Are you sure you want to buy this property?')) {
        buyProperty(propertyId, price);
    }
}

async function buyProperty(propertyId, price) {
    try {
        const response = await fetchWithAuth(`${API_BASE}/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buyer_id: loggedInUser.user_id, property_id: propertyId, amount: price })
        });
        if (!response.ok) throw new Error('Failed to record transaction');
        alert('Property purchased successfully!');
        fetchPropertyDetails();
    } catch (err) {
        showError(err.message);
    }
}

function updateTypeFields() {
    const type = document.getElementById('listing-type').value;
    const typeFields = document.getElementById('type-fields');
    if (!typeFields) return;
    typeFields.innerHTML = '';
    if (type === 'apartment') {
        typeFields.innerHTML = `
            <div class="mb-4">
                <label class="block text-neutral-text">Rooms <span class="text-error">*</span></label>
                <input type="number" id="apt-rooms" placeholder="e.g., 2" class="w-full">
                <p id="error-apt-rooms" class="text-error text-sm hidden"></p>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Bathrooms <span class="text-error">*</span></label>
                <input type="number" id="apt-bathrooms" placeholder="e.g., 2" class="w-full">
                <p id="error-apt-bathrooms" class="text-error text-sm hidden"></p>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Kitchen</label>
                <select id="apt-kitchen" class="w-full">
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Carpet Area (sq.ft) <span class="text-error">*</span></label>
                <input type="number" id="apt-carpet-area" placeholder="e.g., 1200" class="w-full">
                <p id="error-apt-carpet-area" class="text-error text-sm hidden"></p>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Super Built-Up Area (sq.ft)</label>
                <input type="number" id="apt-super-built-up" placeholder="e.g., 1500" class="w-full">
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Floor Number</label>
                <input type="number" id="apt-floor-number" placeholder="e.g., 5" class="w-full">
            </div>
        `;
    } else if (type === 'bungalow') {
        typeFields.innerHTML = `
            <div class="mb-4">
                <label class="block text-neutral-text">Bedrooms <span class="text-error">*</span></label>
                <input type="number" id="bung-bedrooms" placeholder="e.g., 3" class="w-full">
                <p id="error-bung-bedrooms" class="text-error text-sm hidden"></p>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Bathrooms <span class="text-error">*</span></label>
                <input type="number" id="bung-bathrooms" placeholder="e.g., 2" class="w-full">
                <p id="error-bung-bathrooms" class="text-error text-sm hidden"></p>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Kitchen</label>
                <select id="bung-kitchen" class="w-full">
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Garden</label>
                <select id="bung-garden" class="w-full">
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Parking</label>
                <select id="bung-parking" class="w-full">
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Total Area (sq.ft) <span class="text-error">*</span></label>
                <input type="number" id="bung-total-area" placeholder="e.g., 2000" class="w-full">
                <p id="error-bung-total-area" class="text-error text-sm hidden"></p>
            </div>
        `;
    } else if (type === 'commercial') {
        typeFields.innerHTML = `
            <div class="mb-4">
                <label class="block text-neutral-text">Floors <span class="text-error">*</span></label>
                <input type="number" id="comm-floors" placeholder="e.g., 4" class="w-full">
                <p id="error-comm-floors" class="text-error text-sm hidden"></p>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Total Area (sq.ft) <span class="text-error">*</span></label>
                <input type="number" id="comm-total-area" placeholder="e.g., 5000" class="w-full">
                <p id="error-comm-total-area" class="text-error text-sm hidden"></p>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Parking Space</label>
                <select id="comm-parking-space" class="w-full">
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Lift Available</label>
                <select id="comm-lift-available" class="w-full">
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                </select>
            </div>
        `;
    } else if (type === 'land') {
        typeFields.innerHTML = `
            <div class="mb-4">
                <label class="block text-neutral-text">Area (sq.ft) <span class="text-error">*</span></label>
                <input type="number" id="land-area" placeholder="e.g., 10000" class="w-full">
                <p id="error-land-area" class="text-error text-sm hidden"></p>
            </div>
            <div class="mb-4">
                <label class="block text-neutral-text">Zone</label>
                <input type="text" id="land-zone" placeholder="e.g., Residential" class="w-full">
            </div>
        `;
    }
    addFormListeners();
    checkFormValidity();
}

async function addListing() {
    if (!loggedInUser) {
        showError('Please login to add a listing.');
        window.location.href = 'login.html';
        return;
    }
    try {
        clearErrors();
        showLoading(true);

        const title = document.getElementById('listing-title').value.trim();
        const price = parseFloat(document.getElementById('listing-price').value);
        const status = document.getElementById('listing-status').value;
        const address = document.getElementById('listing-address').value.trim();
        const type = document.getElementById('listing-type').value;

        if (!title) {
            showError('Title is required', 'title');
            return;
        }
        if (!price || price <= 0) {
            showError('Valid price is required', 'price');
            return;
        }
        if (!status || !['available', 'rented'].includes(status)) {
            showError('Valid status is required', 'status');
            return;
        }
        if (!address) {
            showError('Address is required', 'address');
            return;
        }
        if (!type || !['apartment', 'bungalow', 'commercial', 'land'].includes(type)) {
            showError('Valid property type is required', 'type');
            return;
        }

        let details = {};
        if (type === 'apartment') {
            const rooms = parseInt(document.getElementById('apt-rooms').value);
            const bathrooms = parseInt(document.getElementById('apt-bathrooms').value);
            const kitchen = document.getElementById('apt-kitchen').value === 'true';
            const carpetArea = parseInt(document.getElementById('apt-carpet-area').value);
            const superBuiltUp = document.getElementById('apt-super-built-up').value ? parseInt(document.getElementById('apt-super-built-up').value) : null;
            const floorNumber = document.getElementById('apt-floor-number').value ? parseInt(document.getElementById('apt-floor-number').value) : null;

            if (!rooms || rooms <= 0) {
                showError('Rooms must be a positive number', 'apt-rooms');
                return;
            }
            if (!bathrooms || bathrooms <= 0) {
                showError('Bathrooms must be a positive number', 'apt-bathrooms');
                return;
            }
            if (!carpetArea || carpetArea <= 0) {
                showError('Carpet area must be a positive number', 'apt-carpet-area');
                return;
            }

            details = { rooms, bathrooms, kitchen, carpet_area: carpetArea, super_built_up: superBuiltUp, floor_number: floorNumber };
        } else if (type === 'bungalow') {
            const bedrooms = parseInt(document.getElementById('bung-bedrooms').value);
            const bathrooms = parseInt(document.getElementById('bung-bathrooms').value);
            const kitchen = document.getElementById('bung-kitchen').value === 'true';
            const garden = document.getElementById('bung-garden').value === 'true';
            const parking = document.getElementById('bung-parking').value === 'true';
            const totalArea = parseInt(document.getElementById('bung-total-area').value);

            if (!bedrooms || bedrooms <= 0) {
                showError('Bedrooms must be a positive number', 'bung-bedrooms');
                return;
            }
            if (!bathrooms || bathrooms <= 0) {
                showError('Bathrooms must be a positive number', 'bung-bathrooms');
                return;
            }
            if (!totalArea || totalArea <= 0) {
                showError('Total area must be a positive number', 'bung-total-area');
                return;
            }

            details = { bedrooms, bathrooms, kitchen, garden, parking, total_area: totalArea };
        } else if (type === 'commercial') {
            const floors = parseInt(document.getElementById('comm-floors').value);
            const totalArea = parseInt(document.getElementById('comm-total-area').value);
            const parkingSpace = document.getElementById('comm-parking-space').value === 'true';
            const liftAvailable = document.getElementById('comm-lift-available').value === 'true';

            if (!floors || floors <= 0) {
                showError('Floors must be a positive number', 'comm-floors');
                return;
            }
            if (!totalArea || totalArea <= 0) {
                showError('Total area must be a positive number', 'comm-total-area');
                return;
            }

            details = { floors, total_area: totalArea, parking_space: parkingSpace, lift_available: liftAvailable };
        } else if (type === 'land') {
            const area = parseInt(document.getElementById('land-area').value);
            const zone = document.getElementById('land-zone').value.trim() || null;

            if (!area || area <= 0) {
                showError('Area must be a positive number', 'land-area');
                return;
            }

            details = { area, zone };
        }

        const imageInput = document.getElementById('listing-images');
        const images = imageInput?.files || [];
        if (images.length > 5) {
            showError('Maximum 5 images allowed', 'images');
            return;
        }
        for (const image of images) {
            if (!image.type.startsWith('image/')) {
                showError('Only image files are allowed', 'images');
                return;
            }
            if (image.size > 2 * 1024 * 1024) {
                showError('Each image must be under 2MB', 'images');
                return;
            }
        }

        const formData = new FormData();
        formData.append('owner_id', loggedInUser.user_id);
        formData.append('title', title);
        formData.append('price', price);
        formData.append('status', status);
        formData.append('address', address);
        formData.append('type', type);
        formData.append('details', JSON.stringify(details));
        for (const image of images) {
            formData.append('images', image);
        }

        console.log('addListing: Sending property data to server');
        const response = await fetchWithAuth(`${API_BASE}/properties`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('addListing: Failed to add property:', error);
            throw new Error(error.error || 'Failed to add listing');
        }

        console.log('addListing: Property added successfully');
        alert('Listing added successfully!');
        if (window.location.pathname.includes('index.html')) {
            await fetchProperties(); // Refresh homepage listings
        } else {
            window.location.href = 'index.html'; // Redirect to homepage
        }
    } catch (err) {
        console.error('addListing: Error:', err.message);
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Initializing page');
    loadUser();
    if (document.getElementById('listing-type')) {
        updateTypeFields();
        document.getElementById('listing-type').addEventListener('change', updateTypeFields);
    }
    if (document.getElementById('property-list')) fetchProperties();
    if (document.getElementById('apartment-list')) fetchApartments();
    if (document.getElementById('bungalow-list')) fetchBungalows();
    if (document.getElementById('commercial-list')) fetchCommercial();
    if (document.getElementById('land-list')) fetchLand();
    if (document.getElementById('property-details')) fetchPropertyDetails();
    if (document.getElementById('user-listings')) fetchUserListings();
    if (document.getElementById('admin-properties')) fetchAdminDashboard();
});