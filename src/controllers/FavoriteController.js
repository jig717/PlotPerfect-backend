const Favorite = require("../models/FavoriteModel");
const mongoose = require("mongoose"); 

// ADD TO FAVORITE
const addToFavorite = async (req, res) => {
  try {
    const { userId, propertyId } = req.body;
    if (!userId || !propertyId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId or propertyId",
      });
    }
    const existing = await Favorite.findOne({
      user: userId,
      property: propertyId,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Already in favorites",
      });
    }
    const newFav = await Favorite.create({
    user: userId,
    property: propertyId
    });

    res.status(201).json({
      success: true,
      message: "Added to favorites",
      data: newFav,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding favorite",
      error: error.message,
    });
  }
};

// GET USER FAVORITES
const getUserFavorite = async (req, res) => {
  try {
    const favorites = await Favorite
      .find({ user: req.params.userId })
      .populate("property");

    res.status(200).json({
      success: true,
      message: "Favorites fetched",
      data: favorites,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching favorites",
      error: error.message,
    });
  }
};


// REMOVE FAVORITE
const removeFavorite = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate if id is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid favorite ID format",
      });
    }

    const deleted = await Favorite.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Favorite not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Removed successfully",
    });

  } catch (error) {
    console.error("Remove favorite error:", error);
    res.status(500).json({
      success: false,
      message: "Error removing favorite",
      error: error.message,
    });
  }
};

module.exports = {
  addToFavorite,
  getUserFavorite,
  removeFavorite,
};