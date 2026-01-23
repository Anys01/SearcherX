const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const DATA_DIR = path.join(__dirname, 'data');
const DB_DIR = path.join(__dirname, 'db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Middleware de vérification admin
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ 
            success: false, 
            error: 'Non autorisé' 
        });
    }
    
    // Format: "Bearer {token}"
    const token = authHeader.split(' ')[1];
    
    // Décoder le token (simplifié - en vrai utiliser JWT)
    try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
        if (decoded.role !== 'admin' && decoded.role !== 'owner') {
            return res.status(403).json({ 
                success: false, 
                error: 'Permissions admin requises' 
            });
        }
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ 
            success: false, 
            error: 'Token invalide' 
        });
    }
}

// Fonctions utilitaires
async function readJSON(file) {
    try {
        const data = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

async function writeJSON(file, data) {
    await fs.writeFile(
        path.join(DATA_DIR, file),
        JSON.stringify(data, null, 2),
        'utf8'
    );
}

// Initialisation
async function initDataFiles() {
    const files = ['users.json', 'announcements.json', 'logs.json', 'permissions.json'];
    
    for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        try {
            await fs.access(filePath);
        } catch {
            let defaultData = [];
            
            if (file === 'users.json') {
                const hashedPassword = await bcrypt.hash('admin123', 10);
                defaultData = [{
                    id: uuidv4(),
                    username: 'admin',
                    password: hashedPassword,
                    firstname: 'Admin',
                    role: 'admin',
                    hasLicense: true,
                    created: new Date().toISOString(),
                    lastActivity: new Date().toISOString(),
                    ip: '127.0.0.1'
                }];
            } else if (file === 'announcements.json') {
                defaultData = [{
                    id: uuidv4(),
                    title: 'Bienvenue sur SEARCHX',
                    content: 'Plateforme de recherche avancée opérationnelle. Explorez +500 databases.',
                    start: new Date().toISOString(),
                    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 jours
                    status: 'active',
                    createdBy: 'system',
                    createdAt: new Date().toISOString()
                }];
            } else if (file === 'permissions.json') {
                defaultData = {
                    owner: ['search', 'wanted', 'admin', 'bank', 'export', 'import', 'settings', 'logs'],
                    admin: ['search', 'wanted', 'admin', 'export', 'logs'],
                    client: ['search']
                };
            }
            
            await writeJSON(file, defaultData);
            console.log(`✅ ${file} initialisé`);
        }
    }
    
    // Créer le dossier db s'il n'existe pas
    await fs.mkdir(DB_DIR, { recursive: true });
    
    // Créer databases.json s'il n'existe pas
    const dbConfigPath = path.join(DB_DIR, 'databases.json');
    try {
        await fs.access(dbConfigPath);
    } catch {
        const defaultDBs = [
            {
                id: uuidv4(),
                name: "Bouygues",
                label: "Source #1",
                filename: "boursous",
                icon: "fas fa-phone",
                description: "Base de données télécom",
                status: 'public',
                category: 'télécom',
                recordCount: 1,
                lastUpdate: new Date().toISOString()
            }
        ];
        await fs.writeFile(dbConfigPath, JSON.stringify(defaultDBs, null, 2));
        console.log('✅ databases.json initialisé');
        
        // Créer un fichier de données exemple
        const sampleData = [{
            "NOM": "EXEMPLE USER",
            "EMAIL": "exemple@email.com",
            "TÉLÉPHONE": "0600000000",
            "ADRESSE": "Paris, France"
        }];
        await fs.writeFile(
            path.join(DB_DIR, 'boursous.json'),
            JSON.stringify(sampleData, null, 2)
        );
    }
}

// Charger les DB depuis le dossier
async function loadDatabasesFromFolder() {
    try {
        const dbConfigPath = path.join(DB_DIR, 'databases.json');
        let databases = [];
        
        try {
            const configData = await fs.readFile(dbConfigPath, 'utf8');
            databases = JSON.parse(configData);
        } catch (error) {
            console.log('⚠️ databases.json non trouvé, création...');
            databases = [];
        }
        
        // Scanner les fichiers .json dans le dossier db
        const files = await fs.readdir(DB_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'databases.json');
        
        for (const file of jsonFiles) {
            const filename = file.replace('.json', '');
            const exists = databases.some(db => db.filename === filename);
            
            if (!exists) {
                // Compter les enregistrements
                let recordCount = 0;
                try {
                    const data = await fs.readFile(path.join(DB_DIR, file), 'utf8');
                    const records = JSON.parse(data);
                    recordCount = Array.isArray(records) ? records.length : 0;
                } catch (error) {
                    console.error(`Erreur lecture ${file}:`, error.message);
                }
                
                databases.push({
                    id: uuidv4(),
                    name: filename.charAt(0).toUpperCase() + filename.slice(1),
                    label: `Source #${databases.length + 1}`,
                    filename: filename,
                    icon: "fas fa-database",
                    description: `Base de données ${filename}`,
                    status: 'public',
                    category: 'général',
                    recordCount: recordCount,
                    lastUpdate: new Date().toISOString(),
                    autoAdded: true
                });
            }
        }
        
        // Mettre à jour le fichier de configuration
        await fs.writeFile(dbConfigPath, JSON.stringify(databases, null, 2));
        
        return databases;
    } catch (error) {
        console.error('Erreur chargement DB:', error);
        return [];
    }
}

// Routes API

// 1. Authentification avec token
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await readJSON('users.json');
        
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        
        if (!user) {
            return res.json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.json({ success: false, error: 'Mot de passe incorrect' });
        }
        
        // Mettre à jour la dernière activité
        user.lastActivity = new Date().toISOString();
        await writeJSON('users.json', users);
        
        // Générer un token (simplifié)
        const tokenData = {
            id: user.id,
            username: user.username,
            role: user.role,
            exp: Date.now() + 24 * 60 * 60 * 1000 // 24h
        };
        const token = Buffer.from(JSON.stringify(tokenData)).toString('base64');
        
        // Ajouter un log
        const logs = await readJSON('logs.json');
        logs.unshift({
            id: uuidv4(),
            date: new Date().toISOString(),
            type: 'Connexion',
            message: `Utilisateur ${user.username} connecté`,
            user: user.username,
            ip: req.ip
        });
        await writeJSON('logs.json', logs);
        
        // Retourner l'utilisateur sans le mot de passe + token
        const { password: _, ...userWithoutPassword } = user;
        res.json({ 
            success: true, 
            user: userWithoutPassword,
            token: token
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 2. Recherche améliorée
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q?.toLowerCase();
        if (!query || query.length < 3) {
            return res.json({ success: false, error: 'Requête trop courte (min. 3 caractères)' });
        }
        
        const databases = await loadDatabasesFromFolder();
        const results = [];
        
        for (const db of databases) {
            // Vérifier les permissions
            if (db.status === 'private') {
                const authHeader = req.headers.authorization;
                if (!authHeader) continue;
                
                try {
                    const token = authHeader.split(' ')[1];
                    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
                    if (decoded.role !== 'admin' && decoded.role !== 'owner') {
                        continue;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            try {
                const dataPath = path.join(DB_DIR, `${db.filename}.json`);
                const data = await fs.readFile(dataPath, 'utf8');
                const records = JSON.parse(data);
                
                if (!Array.isArray(records)) continue;
                
                records.forEach(record => {
                    let matchFound = false;
                    
                    for (const key in record) {
                        const value = String(record[key]).toLowerCase();
                        if (value.includes(query)) {
                            matchFound = true;
                            break;
                        }
                    }
                    
                    if (matchFound) {
                        results.push({
                            dbId: db.id,
                            dbName: db.name,
                            dbLabel: db.label,
                            dbIcon: db.icon,
                            record: record
                        });
                    }
                });
            } catch (error) {
                console.error(`Erreur lecture ${db.filename}:`, error.message);
            }
        }
        
        // Log de recherche
        const logs = await readJSON('logs.json');
        logs.unshift({
            id: uuidv4(),
            date: new Date().toISOString(),
            type: 'Recherche',
            message: `Recherche: "${query}" - ${results.length} résultats`,
            user: req.headers['x-user'] || 'guest',
            ip: req.ip
        });
        await writeJSON('logs.json', logs);
        
        res.json({ success: true, results, query, count: results.length });
        
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 3. Obtenir les databases
app.get('/api/databases', async (req, res) => {
    try {
        const databases = await loadDatabasesFromFolder();
        res.json({ success: true, databases });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 4. Obtenir les annonces - CORRECTION
app.get('/api/announcements', async (req, res) => {
    try {
        const announcements = await readJSON('announcements.json');
        const now = new Date();
        
        const activeAnnouncements = announcements.filter(ann => {
            const start = new Date(ann.start);
            const end = new Date(ann.end);
            return ann.status === 'active' && now >= start && now <= end;
        });
        
        res.json({ success: true, announcements: activeAnnouncements });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Routes Admin

// 5. Obtenir tous les utilisateurs
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await readJSON('users.json');
        const safeUsers = users.map(({ password, ...user }) => user);
        res.json({ success: true, users: safeUsers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 6. Ajouter un utilisateur
app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { username, firstname, password, role, license } = req.body;
        const users = await readJSON('users.json');
        
        if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
            return res.json({ success: false, error: 'Nom d\'utilisateur déjà utilisé' });
        }
        
        // Générer un mot de passe aléatoire si non fourni
        let finalPassword = password;
        let generatedPassword = null;
        
        if (!finalPassword || finalPassword.trim() === '') {
            generatedPassword = generateRandomPassword(12);
            finalPassword = generatedPassword;
        }
        
        const hashedPassword = await bcrypt.hash(finalPassword, 10);
        
        const newUser = {
            id: uuidv4(),
            username,
            firstname,
            password: hashedPassword,
            role: role || 'client',
            hasLicense: license === 'active',
            created: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            ip: req.ip
        };
        
        users.push(newUser);
        await writeJSON('users.json', users);
        
        // Log
        const logs = await readJSON('logs.json');
        logs.unshift({
            id: uuidv4(),
            date: new Date().toISOString(),
            type: 'Admin',
            message: `Utilisateur "${username}" créé`,
            user: req.user.username,
            ip: req.ip
        });
        await writeJSON('logs.json', logs);
        
        res.json({ 
            success: true, 
            user: {
                id: newUser.id,
                username: newUser.username,
                firstname: newUser.firstname,
                role: newUser.role,
                password: generatedPassword || password
            }
        });
        
    } catch (error) {
        console.error('Add user error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ROUTE CORRIGÉE: Modifier le statut de licence d'un utilisateur
app.put('/api/admin/users/:id/license', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { hasLicense } = req.body;
        const users = await readJSON('users.json');
        
        const userIndex = users.findIndex(u => u.id === id);
        if (userIndex === -1) {
            return res.json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        users[userIndex].hasLicense = hasLicense;
        users[userIndex].lastActivity = new Date().toISOString();
        
        await writeJSON('users.json', users);
        
        // Log
        const logs = await readJSON('logs.json');
        logs.unshift({
            id: uuidv4(),
            date: new Date().toISOString(),
            type: 'Admin',
            message: `Licence ${hasLicense ? 'activée' : 'désactivée'} pour ${users[userIndex].username}`,
            user: req.user.username,
            ip: req.ip
        });
        await writeJSON('logs.json', logs);
        
        res.json({ 
            success: true, 
            message: `Licence ${hasLicense ? 'activée' : 'désactivée'}`,
            user: {
                id: users[userIndex].id,
                username: users[userIndex].username,
                hasLicense: users[userIndex].hasLicense
            }
        });
        
    } catch (error) {
        console.error('Toggle license error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 7. Obtenir les databases (admin)
app.get('/api/admin/databases', requireAdmin, async (req, res) => {
    try {
        const databases = await loadDatabasesFromFolder();
        res.json({ success: true, databases });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 8. Ajouter une database
app.post('/api/admin/databases', requireAdmin, async (req, res) => {
    try {
        const { name, label, filename, status, description, category } = req.body;
        const dbConfigPath = path.join(DB_DIR, 'databases.json');
        
        let databases = [];
        try {
            const data = await fs.readFile(dbConfigPath, 'utf8');
            databases = JSON.parse(data);
        } catch (error) {
            databases = [];
        }
        
        const newDatabase = {
            id: uuidv4(),
            name,
            label,
            filename: filename.toLowerCase(),
            icon: "fas fa-database",
            description: description || `Base de données ${name}`,
            status: status || 'public',
            category: category || 'général',
            recordCount: 0,
            lastUpdate: new Date().toISOString(),
            createdBy: req.user.username
        };
        
        databases.push(newDatabase);
        await fs.writeFile(dbConfigPath, JSON.stringify(databases, null, 2));
        
        // Créer un fichier vide pour cette DB
        const dbFilePath = path.join(DB_DIR, `${filename.toLowerCase()}.json`);
        await fs.writeFile(dbFilePath, JSON.stringify([], null, 2));
        
        // Log
        const logs = await readJSON('logs.json');
        logs.unshift({
            id: uuidv4(),
            date: new Date().toISOString(),
            type: 'Admin',
            message: `Database "${name}" ajoutée`,
            user: req.user.username,
            ip: req.ip
        });
        await writeJSON('logs.json', logs);
        
        res.json({ success: true, database: newDatabase });
        
    } catch (error) {
        console.error('Add database error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 9. Supprimer une database
app.delete('/api/admin/databases/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const dbConfigPath = path.join(DB_DIR, 'databases.json');
        
        let databases = [];
        try {
            const data = await fs.readFile(dbConfigPath, 'utf8');
            databases = JSON.parse(data);
        } catch (error) {
            return res.json({ success: false, error: 'Base de données non trouvée' });
        }
        
        const dbIndex = databases.findIndex(db => db.id === id);
        if (dbIndex === -1) {
            return res.json({ success: false, error: 'Base de données non trouvée' });
        }
        
        const deletedDB = databases[dbIndex];
        
        // Supprimer le fichier de données
        const dbFilePath = path.join(DB_DIR, `${deletedDB.filename}.json`);
        try {
            await fs.unlink(dbFilePath);
        } catch (error) {
            console.log(`Fichier ${deletedDB.filename}.json non trouvé, suppression ignorée`);
        }
        
        // Retirer de la configuration
        databases.splice(dbIndex, 1);
        await fs.writeFile(dbConfigPath, JSON.stringify(databases, null, 2));
        
        // Log
        const logs = await readJSON('logs.json');
        logs.unshift({
            id: uuidv4(),
            date: new Date().toISOString(),
            type: 'Admin',
            message: `Database "${deletedDB.name}" supprimée`,
            user: req.user.username,
            ip: req.ip
        });
        await writeJSON('logs.json', logs);
        
        res.json({ success: true, message: `Database "${deletedDB.name}" supprimée` });
        
    } catch (error) {
        console.error('Delete database error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ROUTE CORRIGÉE: Modifier le statut d'une database
app.put('/api/admin/databases/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const dbConfigPath = path.join(DB_DIR, 'databases.json');
        
        let databases = [];
        try {
            const data = await fs.readFile(dbConfigPath, 'utf8');
            databases = JSON.parse(data);
        } catch (error) {
            return res.json({ success: false, error: 'Base de données non trouvée' });
        }
        
        const dbIndex = databases.findIndex(db => db.id === id);
        if (dbIndex === -1) {
            return res.json({ success: false, error: 'Base de données non trouvée' });
        }
        
        databases[dbIndex].status = status;
        databases[dbIndex].lastUpdate = new Date().toISOString();
        
        await fs.writeFile(dbConfigPath, JSON.stringify(databases, null, 2));
        
        // Log
        const logs = await readJSON('logs.json');
        logs.unshift({
            id: uuidv4(),
            date: new Date().toISOString(),
            type: 'Admin',
            message: `Database "${databases[dbIndex].name}" changée en ${status}`,
            user: req.user.username,
            ip: req.ip
        });
        await writeJSON('logs.json', logs);
        
        res.json({ 
            success: true, 
            message: `Database maintenant ${status}`,
            database: databases[dbIndex]
        });
        
    } catch (error) {
        console.error('Toggle database status error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 10. Obtenir les annonces (admin) - CORRECTION
app.get('/api/admin/announcements', requireAdmin, async (req, res) => {
    try {
        const announcements = await readJSON('announcements.json');
        // Trier par date de création (plus récent en premier)
        announcements.sort((a, b) => new Date(b.createdAt || b.start) - new Date(a.createdAt || a.start));
        res.json({ success: true, announcements });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 11. Ajouter une annonce - CORRECTION
app.post('/api/admin/announcements', requireAdmin, async (req, res) => {
    try {
        const { title, content, start, end, status } = req.body;
        
        if (!title || !content) {
            return res.json({ success: false, error: 'Titre et contenu requis' });
        }
        
        const announcements = await readJSON('announcements.json');
        
        const newAnnouncement = {
            id: uuidv4(),
            title,
            content,
            start: start || new Date().toISOString(),
            end: end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: status || "active",
            createdBy: req.user.username,
            createdAt: new Date().toISOString()
        };
        
        announcements.unshift(newAnnouncement); // Ajouter au début
        await writeJSON('announcements.json', announcements);
        
        // Log
        const logs = await readJSON('logs.json');
        logs.unshift({
            id: uuidv4(),
            date: new Date().toISOString(),
            type: 'Admin',
            message: `Annonce "${title}" créée`,
            user: req.user.username,
            ip: req.ip
        });
        await writeJSON('logs.json', logs);
        
        res.json({ success: true, announcement: newAnnouncement });
        
    } catch (error) {
        console.error('Add announcement error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ROUTE CORRIGÉE: Supprimer une annonce
app.delete('/api/admin/announcements/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const announcements = await readJSON('announcements.json');
        
        const announcementIndex = announcements.findIndex(ann => ann.id === id);
        if (announcementIndex === -1) {
            return res.json({ success: false, error: 'Annonce non trouvée' });
        }
        
        const deletedAnnouncement = announcements[announcementIndex];
        
        // Retirer l'annonce
        announcements.splice(announcementIndex, 1);
        await writeJSON('announcements.json', announcements);
        
        // Log
        const logs = await readJSON('logs.json');
        logs.unshift({
            id: uuidv4(),
            date: new Date().toISOString(),
            type: 'Admin',
            message: `Annonce "${deletedAnnouncement.title}" supprimée`,
            user: req.user.username,
            ip: req.ip
        });
        await writeJSON('logs.json', logs);
        
        res.json({ 
            success: true, 
            message: `Annonce "${deletedAnnouncement.title}" supprimée`,
            id: deletedAnnouncement.id
        });
        
    } catch (error) {
        console.error('Delete announcement error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 12. Obtenir les permissions
app.get('/api/admin/permissions', requireAdmin, async (req, res) => {
    try {
        const permissions = await readJSON('permissions.json');
        res.json({ success: true, permissions });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 13. Mettre à jour les permissions (multiples)
app.post('/api/admin/permissions', requireAdmin, async (req, res) => {
    try {
        const { rank, permissions } = req.body;
        
        if (!rank || !permissions || !Array.isArray(permissions)) {
            return res.json({ success: false, error: 'Données invalides' });
        }
        
        const permsData = await readJSON('permissions.json');
        permsData[rank] = permissions;
        
        await writeJSON('permissions.json', permsData);
        
        // Log
        const logs = await readJSON('logs.json');
        logs.unshift({
            id: uuidv4(),
            date: new Date().toISOString(),
            type: 'Admin',
            message: `Permissions modifiées pour ${rank}: ${permissions.join(', ')}`,
            user: req.user.username,
            ip: req.ip
        });
        await writeJSON('logs.json', logs);
        
        res.json({ success: true, message: `Permissions mises à jour pour ${rank}` });
        
    } catch (error) {
        console.error('Permissions error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 14. Obtenir les logs
app.get('/api/admin/logs', requireAdmin, async (req, res) => {
    try {
        const type = req.query.type || 'all';
        let logs = await readJSON('logs.json');
        
        if (type === 'admin') {
            logs = logs.filter(log => log.type === 'Admin');
        } else if (type === 'search') {
            logs = logs.filter(log => log.type === 'Recherche');
        } else if (type === 'auth') {
            logs = logs.filter(log => log.type === 'Connexion' || log.type === 'Déconnexion');
        }
        
        // Trier par date (plus récent en premier)
        logs.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({ success: true, logs, count: logs.length });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 15. Changer le mot de passe
app.post('/api/change-password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ success: false, error: 'Non autorisé' });
        }
        
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
        const users = await readJSON('users.json');
        const user = users.find(u => u.id === decoded.id);
        
        if (!user) {
            return res.json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.json({ success: false, error: 'Mot de passe actuel incorrect' });
        }
        
        if (newPassword.length < 6) {
            return res.json({ success: false, error: 'Le mot de passe doit contenir au moins 6 caractères' });
        }
        
        user.password = await bcrypt.hash(newPassword, 10);
        user.lastActivity = new Date().toISOString();
        
        await writeJSON('users.json', users);
        
        res.json({ success: true, message: 'Mot de passe changé avec succès' });
        
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// 16. Vérifier la session - CORRECTION
app.get('/api/check-session', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.json({ success: false, error: 'Non connecté' });
        }
        
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
        
        // Vérifier l'expiration
        if (decoded.exp < Date.now()) {
            return res.json({ success: false, error: 'Session expirée' });
        }
        
        const users = await readJSON('users.json');
        const user = users.find(u => u.id === decoded.id);
        
        if (!user) {
            return res.json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        // Mettre à jour la dernière activité
        user.lastActivity = new Date().toISOString();
        await writeJSON('users.json', users);
        
        const { password, ...userWithoutPassword } = user;
        res.json({ 
            success: true, 
            user: userWithoutPassword,
            token: token
        });
        
    } catch (error) {
        console.error('Session check error:', error);
        res.json({ success: false, error: 'Session invalide' });
    }
});

// Route pour rechercher un utilisateur
app.get('/api/admin/users/search', requireAdmin, async (req, res) => {
    try {
        const query = req.query.q?.toLowerCase();
        if (!query) {
            return res.json({ success: false, error: 'Requête vide' });
        }
        
        const users = await readJSON('users.json');
        const user = users.find(u => 
            u.id.includes(query) || 
            u.username.toLowerCase().includes(query) ||
            u.firstname.toLowerCase().includes(query)
        );
        
        if (!user) {
            return res.json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        const { password, ...userWithoutPassword } = user;
        res.json({ success: true, user: userWithoutPassword });
        
    } catch (error) {
        console.error('Search user error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Route de déconnexion (pour les logs)
app.post('/api/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
            
            const logs = await readJSON('logs.json');
            logs.unshift({
                id: uuidv4(),
                date: new Date().toISOString(),
                type: 'Déconnexion',
                message: `Utilisateur ${decoded.username} déconnecté`,
                user: decoded.username,
                ip: req.ip
            });
            await writeJSON('logs.json', logs);
        }
        
        res.json({ success: true, message: 'Déconnecté' });
    } catch (error) {
        res.json({ success: false, error: 'Erreur serveur' });
    }
});

// Fonction utilitaire pour générer un mot de passe aléatoire
function generateRandomPassword(length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Route pour servir le frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// MODIFIER la fonction startServer()
async function startServer() {
    try {
        // Créer les dossiers nécessaires
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(DB_DIR, { recursive: true });
        
        // Initialiser les fichiers
        await initDataFiles();
        
        // Démarrer le serveur
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 SEARCHX DÉMARRÉ SUR LE PORT ${PORT}`);
            console.log(`🌐 ACCÈS EXTERNE : http://VOTRE_IP_YORKHOST:${PORT}`);
            console.log(`🌐 OU : http://VOTRE_DOMAINE:${PORT}`);
        });
        
    } catch (error) {
        console.error('❌ Erreur démarrage:', error);
        process.exit(1);
    }
}

startServer();