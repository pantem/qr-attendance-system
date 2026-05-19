const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'No autorizado, token falló' });
    }
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
      req.adminId = decoded.id;
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'No autorizado, token inválido' });
    }
  } else {
    res.status(401).json({ message: 'No autorizado, no hay token' });
  }
};

module.exports = { protect };
