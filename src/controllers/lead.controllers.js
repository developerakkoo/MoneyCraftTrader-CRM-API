const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const pick = require("../utils/pick");
const leadService = require("../services/lead.services");

const EventEmitter = require('events');
const leadEvents = new EventEmitter();

const streamLeadEvents = asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onNewLead = (lead) => {
    res.write(`event: new-lead\ndata: ${JSON.stringify(lead)}\n\n`);
  };

  leadEvents.on('new-lead', onNewLead);

  req.on('close', () => {
    leadEvents.removeListener('new-lead', onNewLead);
  });
});

const createLead = asyncHandler(async (req, res) => {
  const { name, email, phone, city, source, webinarId, webinarTitle } = req.body;

  if (!name || !email || !phone) {
    throw new HttpError(400, "Name, email and phone are required");
  }

  const lead = await leadService.createLead({
    name,
    email,
    phone,
    city,
    source,
    webinarId,
    webinarTitle,
  });

  if (lead.isDuplicate) {
    return res.status(200).json({
      success: true,
      duplicate: true,
      existingLeadId: lead.existingLeadId,
    });
  }

  leadEvents.emit('new-lead', lead);

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
  const result = await leadService.getLeadDetail(req.params.id, req.user._id);

  res.status(200).json({
    success: true,
    data: result,
  });
});

const updateLead = asyncHandler(async (req, res) => {
  const updates = pick(req.body, ["status", "assignedTo", "priority", "followUpDate"]);
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

const getLeadStats = asyncHandler(async (req, res) => {
  const stats = await leadService.getLeadStats();
  res.status(200).json({
    success: true,
    data: stats,
  });
});

const exportLeads = asyncHandler(async (req, res) => {
  const csv = await leadService.exportLeads();
  res.header("Content-Type", "text/csv");
  res.attachment("leads.csv");
  return res.send(csv);
});

const deleteLead = asyncHandler(async (req, res) => {
  await leadService.deleteLead(req.params.id);
  res.status(200).json({ success: true });
});

const deleteLeadsAdmin = asyncHandler(async (req, res) => {
  const { leadIds, name, deleteAll } = req.body;

  const result = await leadService.deleteLeadsAdmin({
    leadIds,
    name,
    deleteAll,
  });

  res.status(200).json({
    success: true,
    message: "Leads deleted successfully",
    data: result,
  });
});

module.exports = {
  addLeadNote,
  createLead,
  deleteLead,
  deleteLeadsAdmin,
  getLeadById,
  listLeads,
  updateLead,
  getLeadStats,
  exportLeads,
  streamLeadEvents,
};
