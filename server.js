const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();

const File = require('./models/File');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files locally
app.use(express.static('public'));

// ------------------------
// MongoDB connection cache
// ------------------------
const connectDB = require('./db');
connectDB(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ------------------------
// Multer setup (Vercel-friendly limit 4.5MB)
// ------------------------
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 4.5 * 1024 * 1024 } });

// ------------------------
// Routes
// ------------------------
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Backend running' }));

// Upload file endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const { filename, expiry, uploadType } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename is required' });

    const existingFile = await File.findOne({ filename: filename.toLowerCase(), expiresAt: { $gt: new Date() } });
    if (existingFile) return res.status(409).json({ error: 'Filename already exists' });

    let fileData = {};
    if (uploadType === 'text') {
      const { textContent } = req.body;
      if (!textContent) return res.status(400).json({ error: 'Text content is required' });

      fileData = {
        filename: filename.toLowerCase(),
        originalName: `${filename}.txt`,
        contentType: 'text/plain',
        textContent,
        size: textContent.length,
        uploadType: 'text',
        expiresAt: new Date(Date.now() + getExpiryMs(expiry))
      };
    } else {
      if (!req.file) return res.status(400).json({ error: 'File is required' });
      fileData = {
        filename: filename.toLowerCase(),
        originalName: req.file.originalname,
        contentType: req.file.mimetype,
        fileData: req.file.buffer,
        size: req.file.size,
        uploadType: 'file',
        expiresAt: new Date(Date.now() + getExpiryMs(expiry))
      };
    }

    const file = new File(fileData);
    await file.save();

    res.json({ success: true, message: `Uploaded ${fileData.originalName} successfully!`, filename: fileData.originalName });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// TODO: Add remaining endpoints like /api/upload-text, /api/retrieve/:filename, /api/download/:filename, /api/view/:filename, /api/cleanup, /api/files

// ------------------------
// Helper functions
// ------------------------
function getExpiryMs(expiry) {
  const expiryMap = { '10': 10 * 60 * 1000, '60': 60 * 60 * 1000, '1440': 24 * 60 * 60 * 1000 };
  return expiryMap[expiry] || expiryMap['60'];
}

// ------------------------
// Optional local cleanup (won’t run reliably on Vercel)
// ------------------------
if (!process.env.VERCEL) {
  setInterval(async () => {
    try {
      const result = await File.deleteMany({ expiresAt: { $lt: new Date() } });
      if (result.deletedCount > 0) console.log(`🧹 Cleaned up ${result.deletedCount} expired files`);
    } catch (error) {
      console.error('Auto cleanup error:', error);
    }
  }, 60 * 60 * 1000);
}

// ------------------------
// Export app for Vercel
// ------------------------
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}/api`));
}

module.exports = app;
