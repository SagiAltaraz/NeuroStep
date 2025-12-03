const express = require('express');
const router = express.Router();
const { askFromOpenAI } = require('../controllers/chatassistant');

router.post('/askAI', askFromOpenAI);

module.exports = router;
