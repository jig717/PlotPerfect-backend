const AuthToken = require("../models/AuthTokenModel");

const createToken = async (req, res) => {
  try {
    const token = await AuthToken.create(req.body);
    res.status(201).json({
      message: "Token created",
      data: token
    });

  } catch (error) {
    res.status(500).json({
      message: "Error creating token",
      error: error.message
    });
  }
};

const getUserTokens = async (req, res) => {
  try {
    const tokens = await AuthToken.find({ user_id: req.params.userId });
    res.json(tokens);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching tokens",
      error: error.message
    });
  }
};

module.exports = {
  createToken,
  getUserTokens
};
