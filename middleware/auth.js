const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'kaiacards_secret_key_change_in_production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

class AuthMiddleware {
  static async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  }

  static async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  static generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  static adminAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = AuthMiddleware.verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = decoded;
    next();
  }

  static async loginAdmin(password) {
    if (password === ADMIN_PASSWORD) {
      return AuthMiddleware.generateToken({ 
        role: 'admin', 
        timestamp: Date.now() 
      });
    }
    return null;
  }
}

module.exports = AuthMiddleware;