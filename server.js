const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// In-memory session store for demo (use Redis in production)
const sessions = new Map();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only images are allowed'));
        }
        cb(null, true);
    }
});

// Database connection
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'property_management',
    password: 'dbms1122',
    port: 5432
});

// Middleware to check role
const checkRole = (allowedRoles) => async (req, res, next) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }
        const result = await pool.query(`
            SELECT u.role_id, r.role_name
            FROM Users u
            JOIN Roles r ON u.role_id = r.role_id
            WHERE u.user_id = $1
        `, [userId]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        const { role_name } = result.rows[0];
        if (!allowedRoles.includes(role_name)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        req.user = result.rows[0];
        next();
    } catch (err) {
        console.error('Role check error:', err);
        res.status(500).json({ error: 'Server error during role check' });
    }
};

// Serve the index.html page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Validate session
app.get('/api/session', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }
        const result = await pool.query(`
            SELECT u.user_id, u.name, u.email, u.phone, u.role_id, r.role_name
            FROM Users u
            JOIN Roles r ON u.role_id = r.role_id
            WHERE u.user_id = $1
        `, [userId]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        const user = result.rows[0];
        sessions.set(user.user_id, user);
        res.json(user);
    } catch (err) {
        console.error('Session validation error:', err);
        res.status(500).json({ error: 'Server error during session validation' });
    }
});

// Fetch all properties (with main image)
app.get('/api/properties', async (req, res) => {
    try {
        const { status, search, type, price_min, price_max } = req.query;
        let query = `
            SELECT p.*, pi.image_url
            FROM Properties p
            LEFT JOIN Property_Images pi ON p.property_id = pi.property_id
            WHERE pi.image_id = (
                SELECT MIN(image_id) FROM Property_Images WHERE property_id = p.property_id
            )
        `;
        const params = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND p.status = $${paramIndex++}`;
            params.push(status);
        }
        if (search) {
            query += ` AND (p.title ILIKE $${paramIndex} OR p.address ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (type) {
            query += ` AND EXISTS (
                SELECT 1 FROM ${type.charAt(0).toUpperCase() + type.slice(1)} t
                WHERE t.property_id = p.property_id
            )`;
        }
        if (price_min) {
            query += ` AND p.price >= $${paramIndex++}`;
            params.push(price_min);
        }
        if (price_max) {
            query += ` AND p.price <= $${paramIndex++}`;
            params.push(price_max);
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch properties error:', err);
        res.status(500).json({ error: 'Server error fetching properties' });
    }
});

// Fetch a single property by ID
app.get('/api/properties/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT p.*, pi.image_url
            FROM Properties p
            LEFT JOIN Property_Images pi ON p.property_id = pi.property_id
            WHERE p.property_id = $1
            LIMIT 1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Property not found' });
        }
        const property = result.rows[0];
        let typeQuery;
        if (await pool.query('SELECT 1 FROM Apartment WHERE property_id = $1', [id]).then(r => r.rows.length > 0)) {
            typeQuery = 'SELECT *, $2 AS type FROM Apartment WHERE property_id = $1';
            property.type = 'apartment';
        } else if (await pool.query('SELECT 1 FROM Bungalow WHERE property_id = $1', [id]).then(r => r.rows.length > 0)) {
            typeQuery = 'SELECT *, $2 AS type FROM Bungalow WHERE property_id = $1';
            property.type = 'bungalow';
        } else if (await pool.query('SELECT 1 FROM Commercial_Complex WHERE property_id = $1', [id]).then(r => r.rows.length > 0)) {
            typeQuery = 'SELECT *, $2 AS type FROM Commercial_Complex WHERE property_id = $1';
            property.type = 'commercial';
        } else if (await pool.query('SELECT 1 FROM Land WHERE property_id = $1', [id]).then(r => r.rows.length > 0)) {
            typeQuery = 'SELECT *, $2 AS type FROM Land WHERE property_id = $1';
            property.type = 'land';
        }
        if (typeQuery) {
            const typeResult = await pool.query(typeQuery, [id, property.type]);
            Object.assign(property, typeResult.rows[0]);
        }
        res.json(property);
    } catch (err) {
        console.error('Fetch property error:', err);
        res.status(500).json({ error: 'Server error fetching property' });
    }
});

// Add a new property (Admin, Owner, or User)
app.post('/api/properties', upload.array('images', 5), async (req, res) => {
    const { owner_id, title, price, status, address, type, details } = req.body;
    try {
        // Parse details (sent as JSON string)
        const parsedDetails = typeof details === 'string' ? JSON.parse(details) : details;

        // Validate inputs
        if (!owner_id || !title || !price || !status || !address || !type) {
            return res.status(400).json({ error: 'Missing required fields: owner_id, title, price, status, address, type' });
        }
        if (!['apartment', 'bungalow', 'commercial', 'land'].includes(type)) {
            return res.status(400).json({ error: 'Invalid property type' });
        }
        if (price <= 0) {
            return res.status(400).json({ error: 'Price must be positive' });
        }
        if (!['available', 'rented'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Verify owner exists
        const ownerCheck = await pool.query('SELECT 1 FROM Users WHERE user_id = $1', [owner_id]);
        if (ownerCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid owner_id' });
        }

        // Validate type-specific details
        if (type === 'apartment') {
            const { rooms, bathrooms, carpet_area } = parsedDetails;
            if (!rooms || !bathrooms || !carpet_area || rooms <= 0 || bathrooms <= 0 || carpet_area <= 0) {
                return res.status(400).json({ error: 'Apartment requires valid rooms, bathrooms, and carpet_area' });
            }
        } else if (type === 'bungalow') {
            const { bedrooms, bathrooms, total_area } = parsedDetails;
            if (!bedrooms || !bathrooms || !total_area || bedrooms <= 0 || bathrooms <= 0 || total_area <= 0) {
                return res.status(400).json({ error: 'Bungalow requires valid bedrooms, bathrooms, and total_area' });
            }
        } else if (type === 'commercial') {
            const { floors, total_area } = parsedDetails;
            if (!floors || !total_area || floors <= 0 || total_area <= 0) {
                return res.status(400).json({ error: 'Commercial requires valid floors and total_area' });
            }
        } else if (type === 'land') {
            const { area } = parsedDetails;
            if (!area || area <= 0) {
                return res.status(400).json({ error: 'Land requires valid area' });
            }
        }

        // Insert into Properties
        const propertyQuery = `
            INSERT INTO Properties (owner_id, title, price, status, address)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const propertyValues = [owner_id, title, price, status, address];
        const propertyResult = await pool.query(propertyQuery, propertyValues);
        const propertyId = propertyResult.rows[0].property_id;

        // Insert type-specific details
        let typeQuery, typeValues;
        if (type === 'apartment') {
            const { rooms, bathrooms, kitchen, carpet_area, super_built_up, floor_number } = parsedDetails;
            typeQuery = `
                INSERT INTO Apartment (property_id, rooms, bathrooms, kitchen, carpet_area, super_built_up, floor_number)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `;
            typeValues = [propertyId, rooms, bathrooms, kitchen, carpet_area, super_built_up, floor_number];
        } else if (type === 'bungalow') {
            const { bedrooms, bathrooms, kitchen, garden, parking, total_area } = parsedDetails;
            typeQuery = `
                INSERT INTO Bungalow (property_id, bedrooms, bathrooms, kitchen, garden, parking, total_area)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `;
            typeValues = [propertyId, bedrooms, bathrooms, kitchen, garden, parking, total_area];
        } else if (type === 'commercial') {
            const { floors, total_area, parking_space, lift_available } = parsedDetails;
            typeQuery = `
                INSERT INTO Commercial_Complex (property_id, floors, total_area, parking_space, lift_available)
                VALUES ($1, $2, $3, $4, $5)
            `;
            typeValues = [propertyId, floors, total_area, parking_space, lift_available];
        } else if (type === 'land') {
            const { area, zone } = parsedDetails;
            typeQuery = `
                INSERT INTO Land (property_id, area, zone)
                VALUES ($1, $2, $3)
            `;
            typeValues = [propertyId, area, zone];
        }
        if (typeQuery) {
            await pool.query(typeQuery, typeValues);
        }

        // Insert image URLs
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const imageUrl = `/uploads/${file.filename}`;
                await pool.query(`
                    INSERT INTO Property_Images (property_id, image_url)
                    VALUES ($1, $2)
                `, [propertyId, imageUrl]);
            }
        }

        res.json(propertyResult.rows[0]);
    } catch (err) {
        console.error('Add property error:', err);
        res.status(500).json({ error: 'Server error adding property' });
    }
});

// Delete a property (Admin, Owner)
app.delete('/api/properties/:id', checkRole(['Admin', 'Owner']), async (req, res) => {
    try {
        const { id } = req.params;
        // Delete images first
        const images = await pool.query('SELECT image_url FROM Property_Images WHERE property_id = $1', [id]);
        for (const { image_url } of images.rows) {
            const filePath = path.join(__dirname, 'public', image_url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        await pool.query('DELETE FROM Property_Images WHERE property_id = $1', [id]);

        // Delete type-specific data
        await pool.query('DELETE FROM Apartment WHERE property_id = $1', [id]);
        await pool.query('DELETE FROM Bungalow WHERE property_id = $1', [id]);
        await pool.query('DELETE FROM Commercial_Complex WHERE property_id = $1', [id]);
        await pool.query('DELETE FROM Land WHERE property_id = $1', [id]);

        // Delete property
        const result = await pool.query('DELETE FROM Properties WHERE property_id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Property not found' });
        }
        res.json({ message: 'Property deleted' });
    } catch (err) {
        console.error('Delete property error:', err);
        res.status(500).json({ error: 'Server error deleting property' });
    }
});

// Fetch all users (Admin, Owner)
app.get('/api/users', checkRole(['Admin', 'Owner']), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.user_id, u.name, u.email, u.phone, r.role_name
            FROM Users u
            JOIN Roles r ON u.role_id = r.role_id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch users error:', err);
        res.status(500).json({ error: 'Server error fetching users' });
    }
});

// Promote/demote user (Owner only)
app.patch('/api/users/:id/role', checkRole(['Owner']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role_name } = req.body;
        if (!['User', 'Admin'].includes(role_name)) {
            return res.status(400).json({ error: 'Invalid role: must be User or Admin' });
        }
        const roleResult = await pool.query('SELECT role_id FROM Roles WHERE role_name = $1', [role_name]);
        if (roleResult.rows.length === 0) {
            return res.status(400).json({ error: 'Role not found' });
        }
        const role_id = roleResult.rows[0].role_id;

        // Check if user exists and is not an Owner
        const userResult = await pool.query('SELECT role_id FROM Users WHERE user_id = $1', [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (userResult.rows[0].role_id === 1) {
            return res.status(400).json({ error: 'Cannot modify Owner role' });
        }

        // Update role
        await pool.query('UPDATE Users SET role_id = $1 WHERE user_id = $2', [role_id, id]);

        // Update session if user is logged in
        if (sessions.has(id)) {
            const user = sessions.get(id);
            user.role_name = role_name;
            sessions.set(id, user);
        }

        res.json({ message: `User role updated to ${role_name}` });
    } catch (err) {
        console.error('Update user role error:', err);
        res.status(500).json({ error: 'Server error updating user role' });
    }
});

// Fetch user's listings
app.get('/api/users/:id/listings', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT p.*, pi.image_url
            FROM Properties p
            LEFT JOIN Property_Images pi ON p.property_id = pi.property_id
            WHERE p.owner_id = $1
            AND pi.image_id = (
                SELECT MIN(image_id) FROM Property_Images WHERE property_id = p.property_id
            )
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch user listings error:', err);
        res.status(500).json({ error: 'Server error fetching user listings' });
    }
});

// Fetch apartments
app.get('/api/apartments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, a.*, pi.image_url
            FROM Properties p
            JOIN Apartment a ON p.property_id = a.property_id
            LEFT JOIN Property_Images pi ON p.property_id = pi.property_id
            WHERE pi.image_id = (
                SELECT MIN(image_id) FROM Property_Images WHERE property_id = p.property_id
            )
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch apartments error:', err);
        res.status(500).json({ error: 'Server error fetching apartments' });
    }
});

// Fetch bungalows
app.get('/api/bungalows', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, b.*, pi.image_url
            FROM Properties p
            JOIN Bungalow b ON p.property_id = b.property_id
            LEFT JOIN Property_Images pi ON p.property_id = pi.property_id
            WHERE pi.image_id = (
                SELECT MIN(image_id) FROM Property_Images WHERE property_id = p.property_id
            )
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch bungalows error:', err);
        res.status(500).json({ error: 'Server error fetching bungalows' });
    }
});

// Fetch commercial complexes
app.get('/api/commercial', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, c.*, pi.image_url
            FROM Properties p
            JOIN Commercial_Complex c ON p.property_id = c.property_id
            LEFT JOIN Property_Images pi ON p.property_id = pi.property_id
            WHERE pi.image_id = (
                SELECT MIN(image_id) FROM Property_Images WHERE property_id = p.property_id
            )
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch commercial error:', err);
        res.status(500).json({ error: 'Server error fetching commercial properties' });
    }
});

// Fetch land
app.get('/api/land', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, l.*, pi.image_url
            FROM Properties p
            JOIN Land l ON p.property_id = l.property_id
            LEFT JOIN Property_Images pi ON p.property_id = pi.property_id
            WHERE pi.image_id = (
                SELECT MIN(image_id) FROM Property_Images WHERE property_id = p.property_id
            )
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch land error:', err);
        res.status(500).json({ error: 'Server error fetching land' });
    }
});

// Fetch property images
app.get('/api/properties/:id/images', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT image_id, image_url
            FROM Property_Images
            WHERE property_id = $1
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch property images error:', err);
        res.status(500).json({ error: 'Server error fetching property images' });
    }
});

// Fetch user by ID
app.get('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT u.user_id, u.name, u.email, u.phone, r.role_name
            FROM Users u
            JOIN Roles r ON u.role_id = r.role_id
            WHERE u.user_id = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Fetch user error:', err);
        res.status(500).json({ error: 'Server error fetching user' });
    }
});

// Fetch reviews for a property
app.get('/api/properties/:id/reviews', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT review_id, user_id, rating, comment
            FROM Reviews
            WHERE property_id = $1
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch reviews error:', err);
        res.status(500).json({ error: 'Server error fetching reviews' });
    }
});

// Submit a review
app.post('/api/reviews', async (req, res) => {
    const { property_id, user_id, rating, comment } = req.body;
    try {
        const query = `
            INSERT INTO Reviews (property_id, user_id, rating, comment)
            VALUES ($1, $2, $3, $4) RETURNING *
        `;
        const values = [property_id, user_id, rating, comment];
        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Submit review error:', err);
        res.status(500).json({ error: 'Server error submitting review' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { name, email } = req.body;
    try {
        const result = await pool.query(`
            SELECT u.user_id, u.name, u.email, u.phone, u.role_id, r.role_name
            FROM Users u
            JOIN Roles r ON u.role_id = r.role_id
            WHERE u.name = $1 AND u.email = $2
        `, [name, email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = result.rows[0];
        sessions.set(user.user_id, user);
        res.json(user);
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Signup
app.post('/api/signup', async (req, res) => {
    const { name, email, user_id, phone, role_id = 2 } = req.body;
    try {
        if (role_id === 1) {
            return res.status(403).json({ error: 'Owner role can only be assigned via database' });
        }
        const query = `
            INSERT INTO Users (user_id, name, email, phone, role_id)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const values = [user_id, name, email, phone, role_id];
        const result = await pool.query(query, values);
        const user = result.rows[0];
        const roleResult = await pool.query('SELECT role_name FROM Roles WHERE role_id = $1', [user.role_id]);
        user.role_name = roleResult.rows[0].role_name;
        sessions.set(user.user_id, user);
        res.json(user);
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Server error during signup' });
    }
});

// Record a transaction
app.post('/api/transactions', async (req, res) => {
    const { buyer_id, property_id, amount, date } = req.body;
    try {
        const query = `
            INSERT INTO Transactions (buyer_id, property_id, amount, date)
            VALUES ($1, $2, $3, $4) RETURNING *
        `;
        const values = [buyer_id, property_id, amount, date || new Date()];
        const result = await pool.query(query, values);
        await pool.query(`
            UPDATE Properties
            SET status = 'sold'
            WHERE property_id = $1
        `, [property_id]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Record transaction error:', err);
        res.status(500).json({ error: 'Server error recording transaction' });
    }
});

// Start server
app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));