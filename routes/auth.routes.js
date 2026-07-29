'use strict';
const express = require('express');
const controller = require('../controllers/auth.controller');

const router = express.Router();

router.get('/login', controller.loginPage);
router.post('/login', controller.login);
router.get('/logout', controller.logout);
router.post('/logout', controller.logout);

module.exports = router;
