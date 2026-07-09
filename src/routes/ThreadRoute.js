const router = require("express").Router();
const { authenticate } = require("../middlewares/AuthMiddleware");
const {
  createThread,
  getMyThreads,
  getThreadById,
  getThreadMessages,
  sendMessage,
  markThreadRead,
  updateThread,
  getThreadByInquiryId,
} = require("../controllers/ThreadController");

router.use(authenticate);

router.post("/", createThread);
router.get("/", getMyThreads);
router.get("/inquiry/:inquiryId", getThreadByInquiryId);
router.get("/:id", getThreadById);
router.get("/:id/messages", getThreadMessages);
router.post("/:id/messages", sendMessage);
router.post("/:id/read", markThreadRead);
router.patch("/:id", updateThread);

module.exports = router;
