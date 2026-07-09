const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const RECONNECT_DELAY_MS = 5000;
const MONGO_TIMEOUT_MS = 5000;

let reconnectTimer = null;
let isConnecting = false;

const getShortMongoError = (err) => {
    const cause = err?.cause;
    return cause?.code || err?.code || cause?.message || err?.message || "Unknown MongoDB error";
};

const scheduleReconnect = () => {
    if (reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectDB();
    }, RECONNECT_DELAY_MS);
};

const connectDB = async () => {
    const mongoUrl = process.env.MONGO_CLOUD_URL;

    if (!mongoUrl) {
        console.error("MongoDB connection failed: MONGO_CLOUD_URL or MONGO_URI is missing in .env");
        return;
    }

    if (mongoose.connection.readyState === 1) {
        return;
    }

    if (isConnecting || mongoose.connection.readyState === 2) {
        return;
    }

    try {
        isConnecting = true;
        await mongoose.connect(mongoUrl, {
            serverSelectionTimeoutMS: MONGO_TIMEOUT_MS,
            connectTimeoutMS: MONGO_TIMEOUT_MS,
        });
        console.log("Connected to MongoDB");
    } catch (err) {
        console.error(`MongoDB connection failed: ${getShortMongoError(err)}`);
        scheduleReconnect();
    } finally {
        isConnecting = false;
    }
};

mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected. Check your internet connection, Atlas IP whitelist, and cluster status.");
    scheduleReconnect();
});

mongoose.connection.on("error", (err) => {
    console.error(`MongoDB connection error: ${getShortMongoError(err)}`);
});

module.exports = connectDB;
