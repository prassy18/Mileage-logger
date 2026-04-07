const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'trip-logger-db.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PIN = process.env.PIN;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!PIN) {
    console.error('ERROR: PIN environment variable is required.');
    console.error('Set it in Container Manager: e.g., PIN=1234567890');
    process.exit(1);
}

// Ensure directories exist
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

// Weekly Sunday backup
function runWeeklyBackup() {
    if (!fs.existsSync(DB_FILE)) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const dest = path.join(BACKUPS_DIR, `trip-logger-db-${dateStr}.json`);
    fs.copyFileSync(DB_FILE, dest);
    // Keep only the last 8 backups
    const backups = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith('trip-logger-db-') && f.endsWith('.json'))
        .sort();
    backups.slice(0, -8).forEach(f => fs.unlinkSync(path.join(BACKUPS_DIR, f)));
    console.log(`Weekly backup saved: ${dest}`);
}

function scheduleWeeklyBackup() {
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + ((7 - now.getDay()) % 7 || 7));
    nextSunday.setHours(2, 0, 0, 0); // 2am Sunday
    const msUntilSunday = nextSunday - now;
    setTimeout(() => {
        runWeeklyBackup();
        setInterval(runWeeklyBackup, 7 * 24 * 60 * 60 * 1000);
    }, msUntilSunday);
    console.log(`Next backup scheduled for ${nextSunday.toISOString()}`);
}

scheduleWeeklyBackup();

// Initialize empty db if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
        trips: [],
        fuelLogs: [],
        serviceLogs: [],
        customLocations: [],
        vehicleDetails: {},
        insuranceLogs: [],
        appSettings: {}
    }, null, 2));
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser(SESSION_SECRET));

// --- Auth ---

function requireAuth(req, res, next) {
    if (req.signedCookies.session === 'valid') return next();
    res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/login', (req, res) => {
    const { pin } = req.body;
    if (!pin || String(pin) !== String(PIN)) {
        return res.status(401).json({ error: 'Incorrect PIN' });
    }
    res.cookie('session', 'valid', {
        signed: true,
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax'
    });
    res.json({ success: true });
});

// Health check (no auth required — used by Docker/Web Station)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/api/auth-check', requireAuth, (req, res) => {
    res.json({ authenticated: true });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('session');
    res.json({ success: true });
});

// --- Data API ---

app.get('/api/data', requireAuth, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        res.json(data);
    } catch (e) {
        res.json({
            trips: [], fuelLogs: [], serviceLogs: [],
            customLocations: [], vehicleDetails: {},
            insuranceLogs: [], appSettings: {}
        });
    }
});

app.put('/api/data', requireAuth, (req, res) => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save data' });
    }
});

app.get('/api/backup', requireAuth, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        data.version = '2.0';
        data.exportDate = new Date().toISOString();
        const dateStr = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Disposition', `attachment; filename="trip_logger_backup_${dateStr}.json"`);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

app.post('/api/restore', requireAuth, (req, res) => {
    try {
        const backup = req.body;
        if (!backup || typeof backup.trips === 'undefined') {
            return res.status(400).json({ error: 'Invalid backup format' });
        }
        const data = {
            trips: backup.trips || [],
            fuelLogs: backup.fuelLogs || [],
            serviceLogs: backup.serviceLogs || [],
            customLocations: backup.customLocations || [],
            vehicleDetails: backup.vehicleDetails || {},
            insuranceLogs: backup.insuranceLogs || [],
            appSettings: backup.appSettings || {}
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to restore data' });
    }
});

// --- Photo API ---

const validDocTypes = ['license-front', 'license-back', 'jaya-license-front', 'jaya-license-back', 'rc-book-front', 'rc-book-back', 'insurance'];

const storage = multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${req.params.docType}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (!validDocTypes.includes(req.params.docType)) {
            return cb(new Error('Invalid document type'));
        }
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
    }
});

app.post('/api/photo/:docType', requireAuth, (req, res) => {
    upload.single('photo')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Remove old files with different extensions for this docType
        const files = fs.readdirSync(UPLOADS_DIR);
        files.forEach(f => {
            if (f.startsWith(req.params.docType + '.') && f !== req.file.filename) {
                fs.unlinkSync(path.join(UPLOADS_DIR, f));
            }
        });
        res.json({ success: true });
    });
});

app.get('/api/photo/:docType', requireAuth, (req, res) => {
    if (!validDocTypes.includes(req.params.docType)) {
        return res.status(400).json({ error: 'Invalid document type' });
    }
    const files = fs.readdirSync(UPLOADS_DIR);
    const file = files.find(f => f.startsWith(req.params.docType + '.'));
    if (!file) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(UPLOADS_DIR, file));
});

app.delete('/api/photo/:docType', requireAuth, (req, res) => {
    if (!validDocTypes.includes(req.params.docType)) {
        return res.status(400).json({ error: 'Invalid document type' });
    }
    const files = fs.readdirSync(UPLOADS_DIR);
    files.forEach(f => {
        if (f.startsWith(req.params.docType + '.')) {
            fs.unlinkSync(path.join(UPLOADS_DIR, f));
        }
    });
    res.json({ success: true });
});

// List which document types have been uploaded
app.get('/api/photos', requireAuth, (req, res) => {
    const files = fs.readdirSync(UPLOADS_DIR);
    const uploaded = {};
    validDocTypes.forEach(type => {
        uploaded[type] = files.some(f => f.startsWith(type + '.'));
    });
    res.json(uploaded);
});

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Trip Logger running on port ${PORT}`);
});
