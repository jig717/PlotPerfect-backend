const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const MONGO_TIMEOUT_MS = 5000;

let cachedPromise = null;

const getShortMongoError = (err) => {
    const cause = err?.cause;
    return cause?.code || err?.code || cause?.message || err?.message || "Unknown MongoDB error";
};

const connectDB = async () => {
    const mongoUrl = process.env.MONGO_CLOUD_URL;

    if (!mongoUrl) {
        console.error("MongoDB connection failed: MONGO_CLOUD_URL is missing in .env");
        return;
    }

    if (mongoose.connection.readyState === 1) {
        return mongoose;
    }

    if (!cachedPromise) {
        cachedPromise = mongoose.connect(mongoUrl, {
            serverSelectionTimeoutMS: MONGO_TIMEOUT_MS,
            connectTimeoutMS: MONGO_TIMEOUT_MS,
        }).then((m) => {
            console.log("Connected to MongoDB");
            return m;
        }).catch((err) => {
            cachedPromise = null;
            console.error(`MongoDB connection failed: ${getShortMongoError(err)}`);
            throw err;
        });
    }

    try {
        await cachedPromise;
    } catch (error) {
        console.error("Failed to connect to MongoDB", error);
    }
};

mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected. Check your internet connection, Atlas IP whitelist, and cluster status.");
    cachedPromise = null;
});

mongoose.connection.on("error", (err) => {
    console.error(`MongoDB connection error: ${getShortMongoError(err)}`);
    cachedPromise = null;
});

module.exports = connectDB;
