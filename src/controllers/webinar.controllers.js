const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const webinarService = require("../services/webinar.services");

const createWebinar = asyncHandler(async (req, res) => {
  const webinar = await webinarService.createWebinar(req.body, req.user._id);

  res.status(201).json({
    success: true,
    data: webinar,
  });
});

const listWebinars = asyncHandler(async (req, res) => {
  const result = await webinarService.listWebinars(req.query);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
});

const getWebinarById = asyncHandler(async (req, res) => {
  const webinar = await webinarService.getWebinarByIdOrThrow(req.params.id);

  res.status(200).json({
    success: true,
    data: webinar,
  });
});

const updateWebinar = asyncHandler(async (req, res) => {
  if (Object.keys(req.body || {}).length === 0) {
    throw new HttpError(400, "No fields provided for update");
  }

  const webinar = await webinarService.updateWebinar(req.params.id, req.body, req.user._id);

  res.status(200).json({
    success: true,
    data: webinar,
  });
});

const updateWebinarStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) {
    throw new HttpError(400, "Status is required");
  }

  const webinar = await webinarService.updateWebinarStatus(req.params.id, status, req.user._id);

  res.status(200).json({
    success: true,
    data: webinar,
  });
});

module.exports = {
  createWebinar,
  getWebinarById,
  listWebinars,
  updateWebinar,
  updateWebinarStatus,
};
