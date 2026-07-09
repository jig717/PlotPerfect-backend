const router = require("express").Router();
const { authenticate } = require("../middlewares/AuthMiddleware");
const upload = require("../middlewares/UploadMiddleware");
const { createUser, getAllUsers, getUserById, updateUser, deleteUser, loginUser, getProfile, updateProfile } = require("../controllers/UserController");

router.post("/register", createUser);
router.post("/login", loginUser);
router.get("/profile", authenticate, getProfile);
router.put("/profile", authenticate, upload.any(), updateProfile);
router.get("/all", getAllUsers);
router.get("/:id", getUserById);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
