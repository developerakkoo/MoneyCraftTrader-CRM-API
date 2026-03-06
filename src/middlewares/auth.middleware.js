const User = require("../models/user.model");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { verifyToken } = require("../utils/jwt");

const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HttpError(401, "Authentication token is required");
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyToken(token);

  const user = await User.findById(payload.userId).populate("role");
  if (!user || !user.isActive) {
    throw new HttpError(401, "User is not authorized");
  }

  req.user = user;
  next();
});

module.exports = {
  authenticate,
};
