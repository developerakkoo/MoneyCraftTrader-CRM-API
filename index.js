const path = require("path");
const dotenv = require("dotenv");

// Load .env; if MONGODB_URI is still missing, try loading from 'env' (template in repo)
dotenv.config();
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.resolve(__dirname, "env") });
}

const app = require("./app");
const connectDB = require("./src/config/db");
const { ensureSystemRoles, ensureSuperAdmin } = require("./src/services/bootstrap.service");
const { startWebinarReminderScheduler } = require("./src/services/webinarReminder.service");
const http = require("http");

const PORT = Number(process.env.PORT) || 5001;

const startServer = async () => {
  try {
    await connectDB();
    await ensureSystemRoles();
    await ensureSuperAdmin();
    startWebinarReminderScheduler();

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

startServer();
