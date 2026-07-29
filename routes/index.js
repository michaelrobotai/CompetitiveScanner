'use strict';
const express = require('express');
const authRoutes = require('./auth.routes');
const pageRoutes = require('./pages.routes');
const apiRoutes = require('./api');

const router = express.Router();

router.use('/api/v1', apiRoutes);
router.use('/', authRoutes);
router.use('/', pageRoutes);

module.exports = router;
