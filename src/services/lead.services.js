const mongoose = require("mongoose");
const Lead = require("../models/lead.model");
const LeadActivity = require("../models/leadActivity.model");
const LeadNote = require("../models/leadNote.model");
const User = require("../models/user.model");
const HttpError = require("../utils/httpError");
const { LEAD_STATUSES } = require("../constants/lead");
const { PERMISSIONS } = require("../constants/permissions");

const buildLeadFilters = (query) => {
  const filters = {};

  if (query.status) {
    filters.status = query.status;
  }

  if (query.source) {
    filters.source = query.source;
  }

  if (query.assignedTo) {
    filters.assignedTo = query.assignedTo === "unassigned" ? null : query.assignedTo;
  }

  if (query.dateFrom || query.dateTo) {
    filters.createdAt = {};

    if (query.dateFrom) {
      filters.createdAt.$gte = new Date(query.dateFrom);
    }

    if (query.dateTo) {
      filters.createdAt.$lte = new Date(query.dateTo);
    }
  }

  if (query.search) {
    const searchRegex = new RegExp(query.search.trim(), "i");
    filters.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
    ];
  }

  return filters;
};

const buildLeadSort = (sortBy = "createdAt", sortOrder = "desc") => {
  const allowedSortFields = ["createdAt", "updatedAt", "name", "status"];
  const field = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
  const order = sortOrder === "asc" ? 1 : -1;

  return { [field]: order };
};

const createLeadActivity = async ({ leadId, userId, action, meta = {} }) => {
  return LeadActivity.create({
    lead: leadId,
    user: userId || null,
    action,
    meta,
  });
};

const validateLeadAssignee = async (assignedTo) => {
  if (!assignedTo) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
    throw new HttpError(400, "Invalid assignee id");
  }

  const user = await User.findById(assignedTo).populate("role");
  if (!user || !user.isActive) {
    throw new HttpError(404, "Assignee not found");
  }

  const assigneePermissions = user.role?.permissions || [];
  if (!assigneePermissions.includes(PERMISSIONS.LEAD_VIEW)) {
    throw new HttpError(400, "Assignee must have lead access permission");
  }

  return user;
};

const createLead = async (payload) => {
  const existingLead = await Lead.findOne({ phone: payload.phone.trim() });
  if (existingLead) {
    throw new HttpError(409, "Lead already exists with this phone number");
  }

  const lead = await Lead.create({
    name: payload.name,
    email: payload.email,
    phone: payload.phone.trim(),
    city: payload.city || "",
    source: payload.source || "checkout",
    status: "New",
  });

  await createLeadActivity({
    leadId: lead._id,
    action: "lead_created",
    meta: {
      source: lead.source,
      status: lead.status,
    },
  });

  return lead;
};

const listLeads = async (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const filters = buildLeadFilters(query);
  const sort = buildLeadSort(query.sortBy, query.sortOrder);

  const [items, total] = await Promise.all([
    Lead.find(filters)
      .populate("assignedTo", "name email")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
    Lead.countDocuments(filters),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getLeadDetail = async (leadId) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new HttpError(400, "Invalid lead id");
  }

  const lead = await Lead.findById(leadId).populate("assignedTo", "name email");
  if (!lead) {
    throw new HttpError(404, "Lead not found");
  }

  const [notes, activities] = await Promise.all([
    LeadNote.find({ lead: leadId })
      .populate("user", "name email")
      .sort({ createdAt: -1 }),
    LeadActivity.find({ lead: leadId })
      .populate("user", "name email")
      .sort({ createdAt: -1 }),
  ]);

  return { lead, notes, activities };
};

const updateLead = async (leadId, updates, actor) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new HttpError(400, "Invalid lead id");
  }

  const lead = await Lead.findById(leadId);
  if (!lead) {
    throw new HttpError(404, "Lead not found");
  }

  const activityJobs = [];

  if (updates.status !== undefined) {
    if (!LEAD_STATUSES.includes(updates.status)) {
      throw new HttpError(400, "Invalid lead status");
    }

    if (updates.status !== lead.status) {
      activityJobs.push(
        createLeadActivity({
          leadId,
          userId: actor._id,
          action: "status_changed",
          meta: {
            previousStatus: lead.status,
            currentStatus: updates.status,
          },
        })
      );
      lead.status = updates.status;
    }
  }

  if (updates.assignedTo !== undefined) {
    const assignee = await validateLeadAssignee(updates.assignedTo);
    const previousAssignee = lead.assignedTo ? String(lead.assignedTo) : null;
    const nextAssignee = assignee ? String(assignee._id) : null;

    if (previousAssignee !== nextAssignee) {
      activityJobs.push(
        createLeadActivity({
          leadId,
          userId: actor._id,
          action: "lead_assigned",
          meta: {
            previousAssignedTo: previousAssignee,
            currentAssignedTo: nextAssignee,
          },
        })
      );
      lead.assignedTo = assignee ? assignee._id : null;
    }
  }

  await lead.save();
  await Promise.all(activityJobs);

  return Lead.findById(leadId).populate("assignedTo", "name email");
};

const addLeadNote = async (leadId, userId, body) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new HttpError(400, "Invalid lead id");
  }

  const lead = await Lead.findById(leadId);
  if (!lead) {
    throw new HttpError(404, "Lead not found");
  }

  const note = await LeadNote.create({
    lead: leadId,
    user: userId,
    body,
  });

  await createLeadActivity({
    leadId,
    userId,
    action: "note_added",
    meta: {
      noteId: note._id,
    },
  });

  return LeadNote.findById(note._id).populate("user", "name email");
};

module.exports = {
  addLeadNote,
  createLead,
  getLeadDetail,
  listLeads,
  updateLead,
};
