const dotenv = require("dotenv");

dotenv.config();

const app = require("./app");
const connectDB = require("./src/config/db");
const { ensureSystemRoles, ensureSuperAdmin } = require("./src/services/bootstrap.service");

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await ensureSystemRoles();
    await ensureSuperAdmin();

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

startServer();
