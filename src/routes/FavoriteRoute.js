const router = require("express").Router();
const { authenticate } = require("../middlewares/AuthMiddleware");

const {
  addToFavorite,
  getUserFavorite,
  removeFavorite
} = require("../controllers/FavoriteController");

router.post("/", authenticate, addToFavorite);
router.get("/:userId", authenticate, getUserFavorite);
router.delete("/:id", authenticate, removeFavorite);

module.exports = router;