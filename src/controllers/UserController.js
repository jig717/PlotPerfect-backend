const bcrypt = require('bcrypt');
const sendMail = require('../utilis/MailUtili');
const UserSchema = require('../models/UserModel');
const jwt = require('jsonwebtoken');
const mongoose = require("mongoose");
const uploadToCloudinary = require("../utilis/UploadeToCloudinary");
const { JWT_SECRET } = process.env;

const normalizeUserForClient = (userDoc) => {
    const user = userDoc?.toObject ? userDoc.toObject() : userDoc;
    if (!user) return user;

    const profileUrl = user.profileImage || user.profile_image || user.avatar || user.image || "";
    user.profileImage = profileUrl;
    user.profile_image = profileUrl;
    user.avatar = profileUrl;
    user.image = profileUrl;
    return user;
};

const createUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const existingUser = await UserSchema.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await UserSchema.create({
            name,
            email,
            password: hashedPassword,
            role
        });

        user.password = undefined;
        await sendMail(
            user.email,
            "Welcome to PlotPerfect",
            "welcome.html",
            {
                userName: user.name,
                email: user.email,
                role: user.role,
                loginUrl: "http://localhost:5173/login"
            }
        );

       const token = jwt.sign(
        { _id: user._id, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
        );  
    
        res.status(201).json({
            message: "User created successfully",
            data: user,
            token,
            role: user.role
        });

    } catch (error) {
        res.status(500).json({
            message: "Error while creating user",
            error: error.message
        });
    }
};


const getAllUsers = async (req, res) => {
    try {
        const users = await UserSchema.find();
        res.status(200).json({
            message: "users fetched successfully",
            data: users
        });
    } catch (error) {
        res.status(500).json({
            message: "error while fetching users",
            err: error.message
        });
    }
};


const getUserById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                message: "Invalid user id"
            });
        }

        const user = await UserSchema.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.status(200).json({
            message: "User fetched successfully",
            data: user
        });

    } catch (error) {
        res.status(500).json({
            message: "error while fetching user",
            err: error.message
        });
    }
};

const getProfile = async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }

        const user = await UserSchema.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const userData = normalizeUserForClient(user);

        res.status(200).json({
            message: "Profile fetched successfully",
            data: userData,
            profileImage: userData.profileImage,
            profile_image: userData.profile_image,
            avatar: userData.avatar
        });
    } catch (error) {
        res.status(500).json({
            message: "Error while fetching profile",
            error: error.message
        });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }

        const body = req.body || {};
        const { password, role, _id, ...updateData } = body;

        const incomingProfileImage = body.profileImage || body.profile_image || body.avatar || body.image;
        if (!updateData.profileImage && incomingProfileImage) {
            updateData.profileImage = incomingProfileImage;
        }

        const uploadedFile = Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : null;
        if (uploadedFile?.buffer) {
            const uploadResult = await uploadToCloudinary(uploadedFile.buffer);
            updateData.profileImage = uploadResult.secure_url;
        }

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const user = await UserSchema.findByIdAndUpdate(
            userId,
            updateData,
            { returnDocument: "after", runValidators: true }
        );

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const userData = normalizeUserForClient(user);

        res.status(200).json({
            message: "Profile updated successfully",
            data: userData,
            profileImage: userData.profileImage,
            profile_image: userData.profile_image,
            avatar: userData.avatar
        });
    } catch (error) {
        res.status(500).json({
            message: "Error while updating profile",
            error: error.message
        });
    }
};

const updateUser = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                message: "Invalid user id"
            });
        }

        const { password, ...updateData } = req.body;

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const user = await UserSchema.findByIdAndUpdate(
            req.params.id,
            updateData,
            { returnDocument: "after" }
        );

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.status(200).json({
            message: "User updated successfully",
            data: user
        });

    } catch (error) {
        res.status(500).json({
            message: "error while updating user",
            err: error.message
        });
    }
};

const deleteUser = async (req, res) => {
    try {
        const user = await UserSchema.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.status(200).json({
            message: "User deleted successfully",
            data: user
        });

    } catch (error) {
        res.status(500).json({
            message: "error while deleting user",
            err: error.message
        });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await UserSchema.findOne({ email }).select('+password');
        if (!user) {
            return res.status(400).json({
                message: "Invalid email or password"
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(400).json({
                message: "Invalid email or password"
            });
        }
        const token = jwt.sign(
        { _id: user._id, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
        );
        
        user.password = undefined;
        const userData = normalizeUserForClient(user);

        res.status(200).json({
            message: "Login successful",
            data: userData,
            profileImage: userData.profileImage,
            profile_image: userData.profile_image,
            avatar: userData.avatar,
            token,
            role: userData.role
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Error while logging in",
            error: error.message
        });
    }
};

module.exports = {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    loginUser,
    getProfile,
    updateProfile
};
