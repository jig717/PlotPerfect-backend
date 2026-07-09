const express = require("express");
const router = express.Router();

const {
  createToken,
  getUserTokens
} = require("../controllers/AuthController")

router.post("/", createToken);
router.get("/:userId", getUserTokens);

module.exports = router;