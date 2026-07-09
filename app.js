console.log("hell mode in backend server ") 

const express = require('express');
const app = express();
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

app.use(express.json()) 
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173', 
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'https://api.razorpay.com',
    'https://checkout.razorpay.com',
    'https://*.razorpay.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
        const duration = Date.now() - startedAt;
        if (duration > 1000) {
            console.warn(`${req.method} ${req.originalUrl} completed with ${res.statusCode} in ${duration}ms`);
        }
    });

    next();
});

const connectDB = require('./src/utilis/DBconnection');
connectDB();

const getDatabaseStatus = () => {
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    return states[mongoose.connection.readyState] || "unknown";
};

app.get("/", (req, res) => {
    res.json({
        ok: true,
        service: "PlotPerfect backend",
        port: Number(process.env.PORT || 3400),
        database: getDatabaseStatus(),
    });
});

app.use((req, res, next) => {
    if (mongoose.connection.readyState === 1) {
        return next();
    }

    return res.status(503).json({
        message: "Database is not connected. Please check MongoDB Atlas/network access and try again.",
        database: getDatabaseStatus(),
    });
});

// USER
const userRoute = require('./src/routes/UserRoute');
app.use("/user", userRoute);

// AUTH TOKENS
const authRoute = require('./src/routes/AuthRoutes');
app.use("/auth", authRoute);

// PROPERTY
const propertyRoutes = require("./src/routes/PropertyRoute");
app.use("/property", propertyRoutes);

// PROPERTY IMAGE
const propertyImageRoutes = require('./src/routes/PropertyImageRoutes');
app.use("/propertyimage", propertyImageRoutes);

// PAYMENT
const paymentRoute = require("./src/routes/paymentRoute");
const imageProxyRoute = require("./src/routes/imageProxy");
app.use("/payment", paymentRoute);
app.use("/images", imageProxyRoute);

// SALE REQUESTS
const saleRequestRoute = require("./src/routes/SaleRequestRoute");
app.use("/sale-requests", saleRequestRoute);

// FAVORITE
const favoriteRoute = require("./src/routes/FavoriteRoute");
app.use("/favorite", favoriteRoute);

// VISIT
const { authenticate } = require('./src/middlewares/AuthMiddleware');
const visitRoutes = require('./src/routes/VisitRoutes');
app.use('/visits', authenticate, visitRoutes);
//  INQUIRY (ONLY ONE)
const inquiryRoute = require("./src/routes/InquriyRoute");
app.use("/inquiries", inquiryRoute);

// REVIEW
const reviewRoute = require("./src/routes/ReviewRoute");
app.use("/review", reviewRoute);

//  SUPPORT
const supportRoutes = require("./src/routes/SupportRoutes");
app.use("/support", supportRoutes);

//agent stats
const agentRoutes = require("./src/routes/AgentRoutes");
app.use("/agent", agentRoutes);

// threads
const threadRoutes = require("./src/routes/ThreadRoute");
app.use("/threads", threadRoutes);

// notifications
const notificationRoutes = require("./src/routes/NotificationRoute");
app.use("/notifications", notificationRoutes);

const PORT = Number(process.env.PORT || 3400);
app.listen(PORT,()=> {
    console.log(`server is running ${PORT}`);   
})
