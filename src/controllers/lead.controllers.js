const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const pick = require("../utils/pick");
const leadService = require("../services/lead.services");

const createLead = asyncHandler(async (req, res) => {
  const { name, email, phone, city, source } = req.body;

  if (!name || !email || !phone) {
    throw new HttpError(400, "Name, email and phone are required");
  }

  const lead = await leadService.createLead({
    name,
    email,
    phone,
    city,
    source,
  });

  res.status(201).json({
    success: true,
    data: lead,
  });
});

const listLeads = asyncHandler(async (req, res) => {
  const result = await leadService.listLeads(req.query);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
});

const getLeadById = asyncHandler(async (req, res) => {
  const result = await leadService.getLeadDetail(req.params.id);

  res.status(200).json({
    success: true,
    data: result,
  });
});

const updateLead = asyncHandler(async (req, res) => {
  const updates = pick(req.body, ["status", "assignedTo"]);
  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, "No valid fields provided for update");
  }

  const lead = await leadService.updateLead(req.params.id, updates, req.user);

  res.status(200).json({
    success: true,
    data: lead,
  });
});

const addLeadNote = asyncHandler(async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) {
    throw new HttpError(400, "Note body is required");
  }

  const note = await leadService.addLeadNote(req.params.id, req.user._id, body.trim());

  res.status(201).json({
    success: true,
    data: note,
  });
});

module.exports = {
  addLeadNote,
  createLead,
  getLeadById,
  listLeads,
  updateLead,
};
