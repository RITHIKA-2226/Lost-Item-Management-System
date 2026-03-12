const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const db = require("./db"); // Import our database file

const app = express();

app.use(express.json());
app.use(cors());

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// Configure Multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

// JWT Secret Key (in production, this should be an environment variable)
const JWT_SECRET = "your_super_secret_jwt_key_here";

// Middleware to authenticate JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Forbidden" });
        req.user = user;
        next();
    });
}

// ----- API ENDPOINTS -----

// 1. Register User
app.post("/api/register", async (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', 
            [name, email, hashedPassword], 
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: "Email already registered" });
                    }
                    return res.status(500).json({ error: "Database error" });
                }
                res.status(201).json({ message: "Registration successful", userId: this.lastID });
            }
        );
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// 2. Login User
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user) return res.status(400).json({ error: "Invalid email or password" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid email or password" });

        // Generate JWT
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ message: "Login successful", token, email: user.email, name: user.name });
    });
});

// 3. Report Item (Handles both Lost and Found based on 'type' in body)
app.post("/api/items", authenticateToken, upload.single('image'), (req, res) => {
    const { type, itemName, description, location, date, status } = req.body;
    
    // Fallback to anonymous if no user but auth token passed
    const user_email = req.user ? req.user.email : 'anonymous';
    
    // the uploaded file path
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!type || !itemName || !description || !location || !date) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const itemStatus = status || (type === 'lost' ? 'Lost' : 'Found');

    db.run(
        'INSERT INTO items (type, itemName, description, location, date, status, user_email, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [type, itemName, description, location, date, itemStatus, user_email, image_url],
        function(err) {
            if (err) return res.status(500).json({ error: "Database error" });
            res.status(201).json({ message: "Item reported successfully", itemId: this.lastID, image_url });
        }
    );
});

// 4. Get Items (For Search Page)
app.get("/api/items", (req, res) => {
    const { search, location } = req.query;
    
    let query = 'SELECT * FROM items WHERE 1=1';
    let params = [];

    if (search) {
        query += ' AND (itemName LIKE ? OR description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    if (location) {
        query += ' AND location LIKE ?';
        params.push(`%${location}%`);
    }
    
    // Order by newest first
    query += ' ORDER BY created_at DESC';

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// 5. Delete an Item
app.delete("/api/items/:id", authenticateToken, (req, res) => {
    const itemId = req.params.id;
    const userEmail = req.user.email;
    
    db.get('SELECT * FROM items WHERE id = ?', [itemId], (err, item) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!item) return res.status(404).json({ error: "Item not found" });
        if (item.user_email !== userEmail) return res.status(403).json({ error: "Forbidden: You don't own this item" });

        db.run('DELETE FROM items WHERE id = ?', [itemId], (err) => {
            if (err) return res.status(500).json({ error: "Database error" });
            res.json({ message: "Item deleted successfully" });
        });
    });
});

// 6. Update an Item (Status, etc.)
app.put("/api/items/:id", authenticateToken, (req, res) => {
    const itemId = req.params.id;
    const userEmail = req.user.email;
    const { status } = req.body;

    db.get('SELECT * FROM items WHERE id = ?', [itemId], (err, item) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!item) return res.status(404).json({ error: "Item not found" });
        if (item.user_email !== userEmail) return res.status(403).json({ error: "Forbidden: You don't own this item" });

        db.run('UPDATE items SET status = ? WHERE id = ?', [status, itemId], (err) => {
            if (err) return res.status(500).json({ error: "Database error" });
            res.json({ message: "Item updated successfully" });
        });
    });
});

// 7. Send a Message
app.post("/api/messages", authenticateToken, (req, res) => {
    const { receiver_email, item_id, message } = req.body;
    const sender_email = req.user.email;

    if (!receiver_email || !item_id || !message) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    db.run(
        'INSERT INTO messages (sender_email, receiver_email, item_id, message) VALUES (?, ?, ?, ?)',
        [sender_email, receiver_email, item_id, message],
        function(err) {
            if (err) return res.status(500).json({ error: "Database error" });
            res.status(201).json({ message: "Message sent successfully", messageId: this.lastID });
        }
    );
});

// 8. Get Messages for logged-in user
app.get("/api/messages", authenticateToken, (req, res) => {
    const userEmail = req.user.email;
    
    // We select message details and join with items to get the item name
    const query = `
        SELECT m.*, i.itemName 
        FROM messages m
        LEFT JOIN items i ON m.item_id = i.id
        WHERE m.receiver_email = ? 
        ORDER BY m.created_at DESC
    `;
    
    db.all(query, [userEmail], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// ----- FRONTEND ROUTING -----
app.use(express.static(__dirname)); // Serve HTML files
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.listen(3000, () => {
    console.log("Server running on port 3000");
});