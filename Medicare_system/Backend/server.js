import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { createServer } from "http";
import { Server } from "socket.io";
import cron from "node-cron";
import connectDB from "./config/db.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

// Models
import Chat from "./models/chat.js";
import Appointment from "./models/appointment.js";

// Utils
import { sendReminders } from "./utils/reminder.js";

dotenv.config();

// Connect to database
connectDB();

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// CORS middleware
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://medicare-system.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));



// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/admin", adminRoutes);

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const mongoose = (await import("mongoose")).default;
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";

    res.status(dbStatus === "connected" ? 200 : 503).json({
      status: "OK",
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        name: mongoose.connection.name || "unknown",
      },
    });
  } catch (error) {
    res.status(503).json({ status: "ERROR", error: error.message });
  }
});

// Metrics endpoint
app.get("/metrics", (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: new Date().toISOString(),
  });
});

// Root
app.get("/", (req, res) => {
  res.send("Medicare backend is running...");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: "Validation Error",
      errors: Object.values(err.errors).map(e => e.message),
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  res.status(500).json({
    message: process.env.NODE_ENV === "production" ? "Something went wrong!" : err.message,
  });
});

// 404 handler (catch-all)
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Socket.io authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }

    const jwt = (await import("jsonwebtoken")).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const User = (await import("./models/user.js")).default;
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return next(new Error("User not found"));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error("Authentication error"));
  }
});

// Socket.io connection handling
io.on("connection", async (socket) => {
  console.log(`User ${socket.user.name} connected with socket ID: ${socket.id}`);

  // Join user-specific room for notifications
  socket.join(`user_${socket.user._id}`);

  // Join chat rooms for user's chats
  Chat.find({ participants: socket.user._id }).then(chats => {
    chats.forEach(chat => {
      socket.join(`chat_${chat._id}`);
    });
  });

  // Handle joining a specific chat room
  socket.on("join_chat", (chatId) => {
    socket.join(`chat_${chatId}`);
  });

  // Handle leaving a specific chat room
  socket.on("leave_chat", (chatId) => {
    socket.leave(`chat_${chatId}`);
  });

  // Handle sending message
  socket.on("send_message", async (data) => {
    try {
      const { chatId, content } = data;

      const chat = await Chat.findById(chatId);
      if (!chat || !chat.participants.includes(socket.user._id)) {
        socket.emit("error", { message: "Not authorized" });
        return;
      }

      const message = {
        sender: socket.user._id,
        content,
        timestamp: new Date(),
      };

      chat.messages.push(message);
      chat.lastMessage = new Date();
      await chat.save();

      const populatedChat = await Chat.findById(chat._id)
        .populate("participants", "name email role")
        .populate("messages.sender", "name email role");

      // Emit to all participants in the chat room
      io.to(`chat_${chatId}`).emit("new_message", {
        chatId,
        message: populatedChat.messages[populatedChat.messages.length - 1],
      });

      // Also emit to update chat lists
      populatedChat.participants.forEach(participant => {
        io.to(`user_${participant._id}`).emit("chat_updated", {
          chat: {
            _id: populatedChat._id,
            participants: populatedChat.participants,
            lastMessage: populatedChat.lastMessage,
            messages: [populatedChat.messages[populatedChat.messages.length - 1]],
          },
        });
      });
    } catch (error) {
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`User ${socket.user.name} disconnected`);
  });
});

// Schedule appointment reminders every hour
cron.schedule('0 * * * *', async () => {
  try {
    console.log('Checking for appointment reminders...');
    const appointments = await Appointment.find({ status: 'confirmed' })
      .populate('patient', 'name email')
      .populate('doctor', 'name email');
    sendReminders(appointments);
  } catch (error) {
    console.error('Error sending reminders:', error);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});

export { io };
export default app;
