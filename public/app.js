// Configuration API
const API_BASE_URL = window.location.origin;
let currentUser = null;
let databases = [];
let authToken = localStorage.getItem('searchx_token');
let userMenuVisible = false;
let currentCreatedUser = null;

// Fonction utilitaire pour les appels API
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    // Ajouter le token d'authentification si disponible
    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api${endpoint}`, options);
        const result = await response.json();
        
        // Si token expiré, déconnecter
        if (result.error === 'Session expirée' || result.error === 'Token invalide') {
            logout();
            showToast('Session expirée, veuillez vous reconnecter', 'error');
            return { success: false, error: 'Session expirée' };
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, error: 'Erreur de connexion au serveur' };
    }
}

// Toast notifications
function showToast(message, type = 'success', duration = 5000) {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastMessage = document.getElementById('toast-message');
    
    // Définir l'icône et la couleur selon le type
    let icon = 'fas fa-check-circle';
    if (type === 'error') icon = 'fas fa-exclamation-circle';
    if (type === 'warning') icon = 'fas fa-exclamation-triangle';
    if (type === 'info') icon = 'fas fa-info-circle';
    
    toastIcon.className = `toast-icon ${icon}`;
    toastMessage.textContent = message;
    toast.className = `toast show ${type}`;
    
    // Masquer automatiquement après la durée
    if (duration > 0) {
        setTimeout(hideToast, duration);
    }
}

function hideToast() {
    const toast = document.getElementById('toast');
    toast.classList.remove('show');
}

// Vérifier la session au chargement - CORRECTION MAJEURE
async function checkSession() {
    const savedUser = localStorage.getItem('searchx_user');
    const savedToken = localStorage.getItem('searchx_token');
    
    if (!savedToken || !savedUser) return false;
    
    try {
        currentUser = JSON.parse(savedUser);
        authToken = savedToken;
        
        // Vérifier avec le serveur
        const result = await apiCall('/check-session');
        if (result.success) {
            currentUser = result.user;
            authToken = result.token;
            localStorage.setItem('searchx_token', authToken);
            localStorage.setItem('searchx_user', JSON.stringify(currentUser));
            
            updateUserUI();
            checkAdminAccess(); // IMPORTANT: Appeler ici
            await loadInitialData();
            return true;
        }
    } catch (error) {
        console.error('Session check error:', error);
    }
    
    return false;
}

// Login
document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('password').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') login();
});

async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');

    const result = await apiCall('/login', 'POST', { username, password });
    
    if (result.success) {
        currentUser = result.user;
        authToken = result.token;
        
        // Sauvegarder le token et l'utilisateur
        localStorage.setItem('searchx_token', authToken);
        localStorage.setItem('searchx_user', JSON.stringify(currentUser));
        
        errorDiv.style.display = 'none';
        
        // Mettre à jour l'interface
        updateUserUI();
        checkAdminAccess(); // IMPORTANT: Appeler ici aussi
        
        // Charger les données initiales
        await loadInitialData();
        
        // Afficher l'app
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        setTimeout(() => {
            document.getElementById('app').classList.add('active');
        }, 10);
        
        // Vérifier la licence
        if (!currentUser.hasLicense && currentUser.role !== 'owner' && currentUser.role !== 'admin') {
            showLicensePage();
        } else {
            showPage('dashboard');
        }
        
        showToast(`Bienvenue ${currentUser.firstname} !`, 'success');
        
    } else {
        errorDiv.style.display = 'block';
        errorDiv.textContent = result.error || 'Identifiants incorrects';
        showToast(result.error || 'Identifiants incorrects', 'error');
    }
}

async function loadInitialData() {
    try {
        // Charger les databases
        const dbResult = await apiCall('/databases');
        if (dbResult.success) {
            databases = dbResult.databases;
            updateStats();
        }
        
        // Charger les annonces
        const annResult = await apiCall('/announcements');
        if (annResult.success && annResult.announcements.length > 0) {
            showActiveAnnouncement(annResult.announcements);
        }
        
    } catch (error) {
        console.error('Error loading initial data:', error);
    }
}

function updateStats() {
    const totalRecords = databases.reduce((sum, db) => sum + (db.recordCount || 0), 0);
    const publicDBs = databases.filter(db => db.status === 'public').length;
    const privateDBs = databases.filter(db => db.status === 'private').length;
    
    // Mettre à jour les cartes de stats si elles existent
    const statsCards = document.querySelectorAll('.stat-card h3');
    if (statsCards.length >= 3) {
        statsCards[0].textContent = databases.length;
        statsCards[1].textContent = `${publicDBs} publique${publicDBs > 1 ? 's' : ''}`;
        statsCards[2].textContent = totalRecords.toLocaleString();
    }
}

function showActiveAnnouncement(announcements) {
    const now = new Date();
    const activeAnnouncement = announcements.find(ann => {
        const start = new Date(ann.start);
        const end = new Date(ann.end);
        return ann.status === 'active' && now >= start && now <= end;
    });
    
    if (activeAnnouncement) {
        document.getElementById('announcement-title').textContent = activeAnnouncement.title;
        document.getElementById('announcement-text').textContent = activeAnnouncement.content;
        document.getElementById('announcement-banner').style.display = 'flex';
    }
}

function closeAnnouncement() {
    document.getElementById('announcement-banner').style.display = 'none';
}

function updateUserUI() {
    if (!currentUser) return;
    
    document.getElementById('user-name').textContent = currentUser.firstname;
    document.getElementById('user-role').textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    document.getElementById('welcome-name').textContent = currentUser.firstname;
    document.getElementById('connected-user').textContent = currentUser.firstname;
    document.getElementById('user-avatar').textContent = currentUser.firstname.charAt(0).toUpperCase();
    document.getElementById('license-username').textContent = currentUser.username;
    
    // Mettre à jour les paramètres
    document.getElementById('settings-username').textContent = currentUser.username;
    document.getElementById('settings-firstname').textContent = currentUser.firstname;
    document.getElementById('settings-role').textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    document.getElementById('settings-license').innerHTML = currentUser.hasLicense ? 
        '<span style="color: #10b981;">Active</span>' : 
        '<span style="color: #ef4444;">Inactive</span>';
}

// Menu utilisateur
function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    userMenuVisible = !userMenuVisible;
    dropdown.classList.toggle('active', userMenuVisible);
    
    // Fermer en cliquant ailleurs
    if (userMenuVisible) {
        setTimeout(() => {
            document.addEventListener('click', closeUserMenuOnClick);
        }, 10);
    }
}

function closeUserMenuOnClick(event) {
    const dropdown = document.getElementById('user-dropdown');
    const menuBtn = document.getElementById('user-menu-btn');
    
    if (!dropdown.contains(event.target) && !menuBtn.contains(event.target)) {
        dropdown.classList.remove('active');
        userMenuVisible = false;
        document.removeEventListener('click', closeUserMenuOnClick);
    }
}

function copyProfileLink() {
    if (!currentUser) return;
    
    const profileLink = `${window.location.origin}/profile/${currentUser.id}`;
    navigator.clipboard.writeText(profileLink)
        .then(() => {
            showToast('Lien profil copié !', 'success');
            document.getElementById('user-dropdown').classList.remove('active');
            userMenuVisible = false;
        })
        .catch(err => {
            showToast('Erreur lors de la copie', 'error');
        });
}

function logout() {
    // Ajouter un log de déconnexion
    if (currentUser) {
        apiCall('/logout', 'POST').catch(() => {});
    }
    
    // Supprimer les données de session
    currentUser = null;
    authToken = null;
    localStorage.removeItem('searchx_token');
    localStorage.removeItem('searchx_user');
    
    // Cacher l'app
    document.getElementById('app').classList.remove('active');
    setTimeout(() => {
        document.getElementById('app').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        
        // Fermer le menu utilisateur
        document.getElementById('user-dropdown').classList.remove('active');
        userMenuVisible = false;
        
        // Masquer la section admin
        checkAdminAccess();
    }, 300);
    
    showToast('Déconnexion réussie', 'info');
}

// Vérifier l'accès admin - CORRECTION COMPLÈTE
function checkAdminAccess() {
    const adminSection = document.querySelector('.admin-section-nav');
    const adminLinks = document.querySelector('.admin-links');
    
    // Vérifier si currentUser existe, sinon vérifier localStorage
    if (!currentUser) {
        const savedUser = localStorage.getItem('searchx_user');
        if (savedUser) {
            try {
                currentUser = JSON.parse(savedUser);
            } catch (e) {
                console.error('Error parsing saved user:', e);
                currentUser = null;
            }
        }
    }
    
    // Afficher/masquer selon le rôle
    if (currentUser && (currentUser.role === 'owner' || currentUser.role === 'admin')) {
        if (adminSection) adminSection.style.display = 'block';
        if (adminLinks) adminLinks.style.display = 'block';
    } else {
        if (adminSection) adminSection.style.display = 'none';
        if (adminLinks) adminLinks.style.display = 'none';
    }
}

function showLicensePage() {
    hideAllPages();
    document.getElementById('license-required').classList.add('active');
}

// Navigation
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        
        if (!currentUser) return;
        
        if (!currentUser.hasLicense && currentUser.role !== 'owner' && currentUser.role !== 'admin') {
            showLicensePage();
            return;
        }
        
        const page = this.getAttribute('data-page');
        
        // Vérifier les permissions
        const pageKey = page.replace('-page', '').replace('-panel', '');
        const adminPages = ['admin-panel'];
        
        if (adminPages.includes(page) && currentUser.role !== 'owner' && currentUser.role !== 'admin') {
            showToast('Permissions admin requises', 'error');
            return;
        }
        
        document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
        this.classList.add('active');
        
        showPage(page);
    });
});

function showPage(page) {
    hideAllPages();
    document.getElementById(page).classList.add('active');
    
    if (page === 'search-results') {
        performSearch();
    } else if (page === 'admin-panel') {
        loadAdminData();
    } else if (page === 'wanted') {
        loadWantedData();
    } else if (page === 'dashboard') {
        updateStats();
    }
}

function hideAllPages() {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
}

// Recherche
document.getElementById('main-search').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && this.value.length >= 3) {
        document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
        const searchLink = document.querySelector('.nav-links a[data-page="search-results"]');
        if (searchLink) {
            searchLink.classList.add('active');
        }
        showPage('search-results');
    }
});

async function performSearch() {
    const query = document.getElementById('main-search').value;
    const container = document.getElementById('results-container');
    
    if (query.length < 3) {
        container.innerHTML = `
            <div class="no-results">
                <i class="fas fa-info-circle"></i>
                <p>Entrez au moins 3 caractères pour effectuer une recherche</p>
            </div>
        `;
        document.getElementById('results-count').textContent = 'Recherche invalide';
        return;
    }
    
    showToast(`Recherche en cours: "${query}"`, 'info');
    
    const result = await apiCall(`/search?q=${encodeURIComponent(query)}`);
    
    if (result.success) {
        displaySearchResults(result.results, query);
        showToast(`${result.count} résultat(s) trouvé(s)`, 'success');
    } else {
        container.innerHTML = `
            <div class="no-results">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erreur lors de la recherche: ${result.error}</p>
            </div>
        `;
        document.getElementById('results-count').textContent = 'Erreur';
        showToast(`Erreur: ${result.error}`, 'error');
    }
}

function displaySearchResults(results, query) {
    const container = document.getElementById('results-container');
    const countElement = document.getElementById('results-count');
    
    if (results.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <p>Aucun résultat trouvé pour "${query}"</p>
                <p style="margin-top: 10px; font-size: 14px; color: var(--text-secondary);">
                    Essayez d'autres termes ou vérifiez l'orthographe
                </p>
            </div>
        `;
        countElement.textContent = `0 résultat pour "${query}"`;
    } else {
        container.innerHTML = '';
        results.forEach((result, index) => {
            const card = document.createElement('div');
            card.className = 'source-card';
            
            let content = `
                <div class="source-header">
                    <div class="source-name">
                        <i class="${result.dbIcon || 'fas fa-database'}"></i>
                        ${result.dbName}
                    </div>
                    <div class="source-badge">${result.dbLabel}</div>
                </div>
            `;
            
            for (const [key, value] of Object.entries(result.record)) {
                content += `
                    <div class="info-row">
                        <div class="info-label">${key}</div>
                        <div class="info-value">${value}</div>
                    </div>
                `;
            }
            
            card.innerHTML = content;
            container.appendChild(card);
        });
        
        countElement.textContent = `${results.length} résultat${results.length > 1 ? 's' : ''} pour "${query}"`;
    }
}

// Paramètres
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        const tab = this.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');
    });
});

async function changePassword() {
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    
    if (newPass.length < 6) {
        showToast('Le mot de passe doit contenir au moins 6 caractères', 'error');
        return;
    }
    
    if (newPass !== confirmPass) {
        showToast('Les mots de passe ne correspondent pas', 'error');
        return;
    }
    
    const result = await apiCall('/change-password', 'POST', {
        currentPassword: document.getElementById('current-password')?.value || '',
        newPassword: newPass
    });
    
    if (result.success) {
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        if (document.getElementById('current-password')) {
            document.getElementById('current-password').value = '';
        }
        showToast('Mot de passe changé avec succès', 'success');
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

// Apparence
document.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', function() {
        document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
        
        const colorClass = this.classList[1];
        const colorMap = {
            'color-default': '#2563eb',
            'color-blue': '#3b82f6',
            'color-green': '#10b981',
            'color-purple': '#8b5cf6',
            'color-orange': '#f97316',
            'color-pink': '#ec4899',
            'color-red': '#ef4444'
        };
        
        document.documentElement.style.setProperty('--accent', colorMap[colorClass]);
        localStorage.setItem('searchx-accent-color', colorMap[colorClass]);
        showToast('Couleur du thème modifiée', 'success');
    });
});

document.getElementById('theme-toggle').addEventListener('change', function() {
    if (this.checked) {
        document.documentElement.style.setProperty('--primary', '#0a0a0a');
        document.documentElement.style.setProperty('--secondary', '#111111');
        document.documentElement.style.setProperty('--text', '#ffffff');
        document.documentElement.style.setProperty('--text-secondary', '#aaaaaa');
        localStorage.setItem('searchx-theme', 'dark');
        showToast('Thème sombre activé', 'success');
    } else {
        document.documentElement.style.setProperty('--primary', '#f8fafc');
        document.documentElement.style.setProperty('--secondary', '#f1f5f9');
        document.documentElement.style.setProperty('--text', '#1e293b');
        document.documentElement.style.setProperty('--text-secondary', '#64748b');
        localStorage.setItem('searchx-theme', 'light');
        showToast('Thème clair activé', 'success');
    }
});

// Admin functions
async function loadAdminData() {
    if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'admin')) {
        showToast('Permissions admin requises', 'error');
        showPage('dashboard');
        return;
    }
    
    showToast('Chargement des données admin...', 'info');
    
    try {
        const [usersRes, dbsRes, annRes, permsRes] = await Promise.all([
            apiCall('/admin/users'),
            apiCall('/admin/databases'),
            apiCall('/admin/announcements'),
            apiCall('/admin/permissions')
        ]);
        
        if (usersRes.success) {
            renderUsers(usersRes.users);
            document.getElementById('stats-users').textContent = usersRes.users.length;
        }
        if (dbsRes.success) {
            renderDatabases(dbsRes.databases);
            document.getElementById('stats-databases').textContent = dbsRes.databases.length;
        }
        if (annRes.success) {
            renderAnnouncements(annRes.announcements);
            document.getElementById('stats-announcements').textContent = annRes.announcements.length;
        }
        if (permsRes.success) window.permissionsData = permsRes.permissions;
        
        showToast('Données admin chargées', 'success');
        
    } catch (error) {
        console.error('Error loading admin data:', error);
        showToast('Erreur lors du chargement des données admin', 'error');
    }
}

function renderDatabases(databases) {
    const table = document.getElementById('db-table');
    if (!table) return;
    
    table.innerHTML = '';
    
    databases.forEach((db, index) => {
        table.innerHTML += `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="${db.icon || 'fas fa-database'}" style="color: var(--accent);"></i>
                        <div>
                            <div style="font-weight: 600;">${db.name}</div>
                            <div style="font-size: 11px; color: var(--text-secondary);">${db.description || ''}</div>
                        </div>
                    </div>
                </td>
                <td>${db.label}</td>
                <td>${db.filename}.json</td>
                <td>
                    <span class="status-badge ${db.status === 'public' ? 'status-active' : 'status-inactive'}">
                        ${db.status === 'public' ? 'Publique' : 'Privée'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn btn-edit" onclick="editDatabase('${db.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn btn-delete" onclick="deleteDatabase('${db.id}', '${db.name}')">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="action-btn btn-view" onclick="toggleDatabasePrivacy('${db.id}', '${db.name}', '${db.status}')">
                            <i class="fas fa-eye${db.status === 'public' ? '-slash' : ''}"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function renderUsers(users) {
    const table = document.getElementById('users-table');
    if (!table) return;
    
    table.innerHTML = '';
    
    users.forEach(user => {
        table.innerHTML += `
            <tr>
                <td>${user.id.substring(0, 8)}...</td>
                <td>${user.username}</td>
                <td>${user.firstname}</td>
                <td><span class="status-badge status-active">${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span></td>
                <td><span class="status-badge ${user.hasLicense ? 'status-active' : 'status-inactive'}">${user.hasLicense ? 'Active' : 'Inactive'}</span></td>
                <td>${new Date(user.lastActivity).toLocaleString('fr-FR')}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn btn-edit" onclick="editUser('${user.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn ${user.hasLicense ? 'btn-delete' : 'btn-view'}" onclick="toggleUserLicense('${user.id}', '${user.username}', ${user.hasLicense})">
                            <i class="fas fa-${user.hasLicense ? 'ban' : 'check'}"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function renderAnnouncements(announcements) {
    const table = document.getElementById('announcements-table');
    if (!table) return;
    
    table.innerHTML = '';
    
    announcements.forEach(ann => {
        const now = new Date();
        const start = new Date(ann.start);
        const end = new Date(ann.end);
        const isActive = ann.status === 'active' && now >= start && now <= end;
        
        table.innerHTML += `
            <tr>
                <td>${ann.id.substring(0, 8)}...</td>
                <td><strong style="color: var(--accent) !important;">${ann.title}</strong></td>
                <td>${ann.content.substring(0, 50)}${ann.content.length > 50 ? '...' : ''}</td>
                <td>${new Date(ann.start).toLocaleString('fr-FR')}</td>
                <td>${new Date(ann.end).toLocaleString('fr-FR')}</td>
                <td><span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">${isActive ? 'Active' : 'Terminée'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn btn-edit" onclick="editAnnouncement('${ann.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn btn-delete" onclick="deleteAnnouncement('${ann.id}', '${ann.title}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

// FONCTIONS D'ÉDITION CORRIGÉES - OUVRE LES MODALS
function editDatabase(id) {
    openModal('edit-db-modal');
    // Charger les données de la DB
    showToast(`Édition DB ${id} - fonctionnalité en développement`, 'info');
}

function editUser(id) {
    openModal('edit-user-modal');
    // Charger les données de l'utilisateur
    showToast(`Édition utilisateur ${id} - fonctionnalité en développement`, 'info');
}

function editAnnouncement(id) {
    openModal('edit-announcement-modal');
    // Charger les données de l'annonce
    showToast(`Édition annonce ${id} - fonctionnalité en développement`, 'info');
}

// Modal functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

async function addDatabase() {
    const name = document.getElementById('db-name').value;
    const label = document.getElementById('db-label').value;
    const filename = document.getElementById('db-filename').value.toLowerCase();
    const status = document.getElementById('db-status').value;
    
    if (!name || !label || !filename) {
        showToast('Veuillez remplir tous les champs obligatoires', 'error');
        return;
    }
    
    if (!/^[a-z0-9_-]+$/.test(filename)) {
        showToast('Le nom de fichier ne peut contenir que des lettres minuscules, chiffres, tirets et underscores', 'error');
        return;
    }
    
    const result = await apiCall('/admin/databases', 'POST', {
        name, label, filename, status
    });
    
    if (result.success) {
        closeModal('add-db-modal');
        document.getElementById('db-name').value = '';
        document.getElementById('db-label').value = '';
        document.getElementById('db-filename').value = '';
        document.getElementById('db-status').value = 'public';
        
        showToast(`Database "${name}" ajoutée avec succès`, 'success');
        loadAdminData(); // RECHARGE LES DONNÉES
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

async function addUser() {
    const username = document.getElementById('user-add-username').value;
    const firstname = document.getElementById('user-add-firstname').value;
    const password = document.getElementById('user-add-password').value;
    const role = document.getElementById('user-add-role').value;
    const license = document.getElementById('user-add-license').value;
    
    if (!username || !firstname) {
        showToast('Veuillez remplir tous les champs obligatoires', 'error');
        return;
    }
    
    const result = await apiCall('/admin/users', 'POST', {
        username, firstname, password, role, license
    });
    
    if (result.success) {
        closeModal('add-user-modal');
        
        // Sauvegarder l'utilisateur créé pour le message Discord
        currentCreatedUser = result.user;
        
        // Générer le message Discord
        generateDiscordMessage(currentCreatedUser);
        
        // Afficher le modal de succès
        openModal('user-created-modal');
        
        // Réinitialiser le formulaire
        document.getElementById('user-add-username').value = '';
        document.getElementById('user-add-firstname').value = '';
        document.getElementById('user-add-password').value = '';
        document.getElementById('user-add-role').value = 'client';
        document.getElementById('user-add-license').value = 'active';
        
        // Recharger la liste des utilisateurs
        loadAdminData(); // RECHARGE LES DONNÉES
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

function generateDiscordMessage(user) {
    const roleMap = {
        'owner': 'Owner',
        'admin': 'Admin', 
        'client': 'Client'
    };
    
    const discordMessage = `**Ajout de votre compte**

**Votre compte a été ajouté par un administrateur de SearchX.**

> **Role :** ${roleMap[user.role] || user.role}
> **Nom d'utilisateur :** \`${user.username}\`
> **Mot de passe :** \`${user.password}\`

**_Nous vous recommandons de modifier votre mot de passe dans la section paramètre_**

*__Ce message a été généré automatiquement par SearchX__*`;
    
    document.getElementById('discord-message-content').textContent = discordMessage;
    return discordMessage;
}

function copyDiscordMessage() {
    const message = document.getElementById('discord-message-content').textContent;
    navigator.clipboard.writeText(message)
        .then(() => {
            showToast('Message Discord copié !', 'success');
        })
        .catch(err => {
            showToast('Erreur lors de la copie', 'error');
        });
}

function copyCredentials() {
    if (!currentCreatedUser) return;
    
    const credentials = `Nom d'utilisateur: ${currentCreatedUser.username}\nMot de passe: ${currentCreatedUser.password}`;
    navigator.clipboard.writeText(credentials)
        .then(() => {
            showToast('Identifiants copiés !', 'success');
        })
        .catch(err => {
            showToast('Erreur lors de la copie', 'error');
        });
}

async function addAnnouncement() {
    const title = document.getElementById('announcement-title-input').value;
    const content = document.getElementById('announcement-content-input').value;
    const start = document.getElementById('announcement-start-input').value;
    const end = document.getElementById('announcement-end-input').value;
    const status = document.getElementById('announcement-status').value;
    
    if (!title || !content || !start || !end) {
        showToast('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    const result = await apiCall('/admin/announcements', 'POST', {
        title, content, start, end, status
    });
    
    if (result.success) {
        closeModal('add-announcement-modal');
        document.getElementById('announcement-title-input').value = '';
        document.getElementById('announcement-content-input').value = '';
        document.getElementById('announcement-start-input').value = '';
        document.getElementById('announcement-end-input').value = '';
        document.getElementById('announcement-status').value = 'active';
        
        showToast(`Annonce "${title}" créée avec succès`, 'success');
        loadAdminData(); // RECHARGE LES DONNÉES
        
        // Mettre à jour l'annonce active
        const annResult = await apiCall('/announcements');
        if (annResult.success && annResult.announcements.length > 0) {
            showActiveAnnouncement(annResult.announcements);
        }
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

// Gestion des permissions multiples
function openPermissionsModal() {
    openModal('permissions-modal');
    loadPermissionsForRank();
}

async function loadPermissionsForRank() {
    const rank = document.getElementById('permissions-rank').value;
    
    // Si on a déjà chargé les permissions
    if (window.permissionsData) {
        renderPermissions(rank, window.permissionsData);
        return;
    }
    
    // Sinon, les charger depuis l'API
    const result = await apiCall('/admin/permissions');
    if (result.success) {
        window.permissionsData = result.permissions;
        renderPermissions(rank, result.permissions);
    }
}

function renderPermissions(rank, permissionsData) {
    const container = document.getElementById('permissions-container');
    if (!container) return;
    
    const allPermissions = [
        { id: 'search', label: 'Recherche', icon: 'fas fa-search' },
        { id: 'wanted', label: 'Wanted', icon: 'fas fa-exclamation-triangle' },
        { id: 'admin', label: 'Admin Panel', icon: 'fas fa-shield-alt' },
        { id: 'bank', label: 'Banque', icon: 'fas fa-university' },
        { id: 'export', label: 'Export', icon: 'fas fa-download' },
        { id: 'import', label: 'Import', icon: 'fas fa-upload' },
        { id: 'settings', label: 'Paramètres avancés', icon: 'fas fa-cogs' },
        { id: 'logs', label: 'Voir les logs', icon: 'fas fa-history' }
    ];
    
    const userPermissions = permissionsData[rank] || [];
    
    container.innerHTML = allPermissions.map(perm => `
        <div class="permission-checkbox">
            <input type="checkbox" 
                   id="perm-${perm.id}" 
                   value="${perm.id}"
                   ${userPermissions.includes(perm.id) ? 'checked' : ''}>
            <label for="perm-${perm.id}">
                <i class="${perm.icon}"></i> ${perm.label}
            </label>
        </div>
    `).join('');
}

async function saveMultiplePermissions() {
    const rank = document.getElementById('permissions-rank').value;
    const checkboxes = document.querySelectorAll('#permissions-container input[type="checkbox"]');
    const permissions = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
    const result = await apiCall('/admin/permissions', 'POST', {
        rank,
        permissions
    });
    
    if (result.success) {
        showToast(`Permissions mises à jour pour ${rank}`, 'success');
        closeModal('permissions-modal');
        // Recharger les permissions
        const permsRes = await apiCall('/admin/permissions');
        if (permsRes.success) {
            window.permissionsData = permsRes.permissions;
        }
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

// Ancienne fonction (pour compatibilité)
function savePermissions() {
    // Remplacée par la nouvelle interface - rediriger vers le modal
    openPermissionsModal();
}

async function searchUserById() {
    const searchId = document.getElementById('user-search').value;
    
    if (!searchId) {
        showToast('Veuillez entrer un ID ou nom', 'error');
        return;
    }
    
    const result = await apiCall(`/admin/users/search?q=${encodeURIComponent(searchId)}`);
    
    if (result.success && result.user) {
        const user = result.user;
        const message = `Utilisateur trouvé : ${user.firstname} (${user.username})\nGrade : ${user.role}\nLicence : ${user.hasLicense ? 'Active' : 'Inactive'}\nIP : ${user.ip}\nCrée le : ${new Date(user.created).toLocaleString('fr-FR')}`;
        
        showToast('Utilisateur trouvé - voir console', 'success');
        console.log(message);
        alert(message);
    } else {
        showToast('Aucun utilisateur trouvé', 'error');
    }
}

async function showLogs(type) {
    const result = await apiCall(`/admin/logs?type=${type}`);
    
    if (result.success) {
        const typeNames = {
            'general': 'Généraux',
            'admin': 'Administration', 
            'search': 'Recherche',
            'auth': 'Authentification'
        };
        
        document.querySelector('#logs-modal .modal-title').textContent = `Logs ${typeNames[type] || type}`;
        const logsContent = document.getElementById('logs-content');
        
        let content = `
            <div class="info-row" style="background: rgba(255,255,255,0.05); margin-bottom: 10px;">
                <div class="info-label" style="font-weight: bold; width: 150px;">Date</div>
                <div class="info-label" style="font-weight: bold; width: 120px;">Type</div>
                <div class="info-label" style="font-weight: bold; flex: 1;">Message</div>
                <div class="info-label" style="font-weight: bold; width: 120px;">Utilisateur</div>
            </div>
        `;
        
        result.logs.slice(0, 50).forEach(log => {
            content += `
                <div class="info-row" style="margin-bottom: 5px;">
                    <div class="info-value" style="width: 150px; font-size: 12px;">${new Date(log.date).toLocaleString('fr-FR')}</div>
                    <div class="info-value" style="width: 120px;">
                        <span class="status-badge ${log.type === 'Admin' ? 'status-inactive' : log.type === 'Connexion' ? 'status-active' : ''}" style="font-size: 11px;">
                            ${log.type}
                        </span>
                    </div>
                    <div class="info-value" style="flex: 1; font-size: 12px;">${log.message}</div>
                    <div class="info-value" style="width: 120px; font-size: 12px;">${log.user || 'Système'}</div>
                </div>
            `;
        });
        
        logsContent.innerHTML = content;
        openModal('logs-modal');
        
        if (result.logs.length === 0) {
            logsContent.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Aucun log trouvé</div>';
        }
    } else {
        showToast('Erreur lors du chargement des logs', 'error');
    }
}

function exportLogs() {
    const logsContent = document.getElementById('logs-content');
    const rows = Array.from(logsContent.querySelectorAll('.info-row')).slice(1);
    
    if (rows.length === 0) {
        showToast('Aucun log à exporter', 'warning');
        return;
    }
    
    const logsText = rows.map(row => {
        const cells = row.querySelectorAll('.info-value');
        return `${cells[0].textContent}\t${cells[1].textContent}\t${cells[2].textContent}\t${cells[3].textContent}`;
    }).join('\n');
    
    const headers = "Date\tType\tMessage\tUtilisateur\n";
    const fullText = headers + logsText;
    
    const blob = new Blob([fullText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `searchx-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Logs exportés avec succès', 'success');
}

// FONCTIONS ADMIN CORRIGÉES - ACTUALISATION AUTOMATIQUE
async function deleteDatabase(id, name) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer la base de données "${name}" ?\n\nCette action supprimera également le fichier de données.`)) {
        return;
    }
    
    const result = await apiCall(`/admin/databases/${id}`, 'DELETE');
    
    if (result.success) {
        showToast(result.message || `Database "${name}" supprimée`, 'success');
        loadAdminData(); // ACTUALISATION AUTOMATIQUE
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

async function toggleDatabasePrivacy(id, name, currentStatus) {
    const newStatus = currentStatus === 'public' ? 'private' : 'public';
    
    if (!confirm(`Êtes-vous sûr de vouloir changer le statut de "${name}" en ${newStatus === 'public' ? 'publique' : 'privée'} ?`)) {
        return;
    }
    
    const result = await apiCall(`/admin/databases/${id}/status`, 'PUT', {
        status: newStatus
    });
    
    if (result.success) {
        showToast(`Database "${name}" maintenant ${newStatus === 'public' ? 'publique' : 'privée'}`, 'success');
        loadAdminData(); // ACTUALISATION AUTOMATIQUE
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

async function toggleUserLicense(id, username, hasLicense) {
    const action = hasLicense ? 'désactiver' : 'activer';
    const newStatus = !hasLicense;
    
    if (!confirm(`Êtes-vous sûr de vouloir ${action} la licence de "${username}" ?`)) {
        return;
    }
    
    const result = await apiCall(`/admin/users/${id}/license`, 'PUT', {
        hasLicense: newStatus
    });
    
    if (result.success) {
        showToast(`Licence ${hasLicense ? 'désactivée' : 'activée'} pour ${username}`, 'success');
        loadAdminData(); // ACTUALISATION AUTOMATIQUE
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

async function deleteAnnouncement(id, title) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer l'annonce "${title}" ?`)) {
        return;
    }
    
    const result = await apiCall(`/admin/announcements/${id}`, 'DELETE');
    
    if (result.success) {
        showToast(`Annonce "${title}" supprimée`, 'success');
        loadAdminData(); // ACTUALISATION AUTOMATIQUE
        
        // Recharger les annonces actives
        const annResult = await apiCall('/announcements');
        if (annResult.success) {
            showActiveAnnouncement(annResult.announcements);
        }
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

// Wanted page
async function loadWantedData() {
    const container = document.getElementById('wanted-page').querySelector('.settings-section');
    
    // Pour l'instant, afficher un message par défaut
    // Plus tard, tu pourras charger depuis une API
    container.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f59e0b; margin-bottom: 20px;"></i>
            <h3 style="margin-bottom: 10px;">Aucun wanted actif pour le moment</h3>
            <p style="color: var(--text-secondary); margin-bottom: 30px;">
                Aucune personne recherchée n'est actuellement enregistrée dans le système.
            </p>
            <button class="btn btn-outline" onclick="suggestWantedFeature()">
                <i class="fas fa-lightbulb"></i> Suggérer un wanted
            </button>
        </div>
    `;
}

function suggestWantedFeature() {
    showToast('Fonctionnalité "Wanted" en développement', 'info');
}

// Fonctions pour les statistiques admin
async function refreshAdminStats() {
    try {
        const [usersRes, dbsRes, annRes] = await Promise.all([
            apiCall('/admin/users'),
            apiCall('/admin/databases'),
            apiCall('/admin/announcements')
        ]);
        
        if (usersRes.success) {
            document.getElementById('stats-users').textContent = usersRes.users.length;
        }
        if (dbsRes.success) {
            document.getElementById('stats-databases').textContent = dbsRes.databases.length;
        }
        if (annRes.success) {
            document.getElementById('stats-announcements').textContent = annRes.announcements.length;
        }
        
        showToast('Statistiques actualisées', 'success');
    } catch (error) {
        console.error('Error refreshing stats:', error);
        showToast('Erreur lors du chargement des statistiques', 'error');
    }
}

// Gestion des clics sur les modals
window.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Initialisation - CORRECTION ULTIME
document.addEventListener('DOMContentLoaded', async function() {
    // Charger les préférences
    const savedColor = localStorage.getItem('searchx-accent-color');
    if (savedColor) {
        document.documentElement.style.setProperty('--accent', savedColor);
        // Mettre à jour la couleur sélectionnée
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            if (option.style.backgroundColor === savedColor || option.classList.contains('color-default') && savedColor === '#2563eb') {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }
    
    const savedTheme = localStorage.getItem('searchx-theme');
    if (savedTheme === 'light') {
        document.getElementById('theme-toggle').checked = false;
        document.documentElement.style.setProperty('--primary', '#f8fafc');
        document.documentElement.style.setProperty('--secondary', '#f1f5f9');
        document.documentElement.style.setProperty('--text', '#1e293b');
        document.documentElement.style.setProperty('--text-secondary', '#64748b');
    }
    
    // Vérifier la session
    const hasSession = await checkSession();
    
    if (hasSession) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        setTimeout(() => {
            document.getElementById('app').classList.add('active');
        }, 10);
        
        // IMPORTANT: Appeler checkAdminAccess après le chargement
        setTimeout(() => {
            checkAdminAccess();
        }, 100);
        
        showPage('dashboard');
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
    }
});