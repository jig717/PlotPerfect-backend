const express = require('express');
const router = express.Router();
const { getImage } = require('../controllers/ImageProxyController.js');

router.get('/:filename', getImage);

module.exports = router;

