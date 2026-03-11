const mongoose = require("mongoose");
const Lead = require("../models/lead.model");
const LeadActivity = require("../models/leadActivity.model");
const LeadNote = require("../models/leadNote.model");
const User = require("../models/user.model");
const HttpError = require("../utils/httpError");
const { LEAD_STATUSES } = require("../constants/lead");
const { PERMISSIONS } = require("../constants/permissions");
const { logDebug, logError, logWarn } = require("../utils/logger");
const webinarNotificationService = require("./webinarNotification.services");

const buildLeadFilters = (query) => {
  const filters = {};

  if (query.status) {
    filters.status = query.status;
  }

  if (query.priority) {
    filters.priority = query.priority;
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

  if (query.followUp === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    filters.followUpDate = { $gte: start, $lte: end };
  } else if (query.followUp === "overdue") {
    const now = new Date();
    filters.followUpDate = { $lt: now };
    filters.status = { $nin: ["Converted", "Lost"] };
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

const buildNotificationSummary = (channels) => {
  const entries = Object.values(channels);

  if (entries.every((channel) => channel.status === "not_applicable")) {
    return {
      status: "not_applicable",
      provider: "multi",
      reason: null,
      response: channels,
      ...channels,
    };
  }

  if (entries.some((channel) => channel.status === "sent")) {
    return {
      status: "sent",
      provider: "multi",
      reason: null,
      response: channels,
      ...channels,
    };
  }

  if (entries.some((channel) => channel.status === "failed")) {
    return {
      status: "failed",
      provider: "multi",
      reason: entries.find((channel) => channel.status === "failed")?.reason || null,
      response: channels,
      ...channels,
    };
  }

  return {
    status: "skipped",
    provider: "multi",
    reason: entries.find((channel) => channel.reason)?.reason || null,
    response: channels,
    ...channels,
  };
};

const createLead = async (payload) => {
  let notification = buildNotificationSummary({
    whatsapp: {
      status: "not_applicable",
      provider: "wati",
      reason: null,
      response: null,
    },
    email: {
      status: "not_applicable",
      provider: "sendgrid",
      reason: null,
      response: null,
    },
  });

  const existingLead = await Lead.findOne({
    $or: [
      { phone: payload.phone.trim() },
      { email: payload.email.toLowerCase().trim() }
    ]
  });
  if (existingLead) {
    return {
      isDuplicate: true,
      existingLeadId: existingLead._id
    };
  }

  const webinar = await webinarNotificationService.findWebinarForLead({
    webinarId: payload.webinarId,
    webinarTitle: payload.webinarTitle,
  });

  const lead = await Lead.create({
    name: payload.name.trim(),
    email: payload.email.toLowerCase().trim(),
    phone: payload.phone.trim(),
    city: payload.city || "",
    source: payload.source || "checkout",
    webinar: webinar?._id || null,
    webinarTitle: webinar?.title || (payload.webinarTitle || "").trim(),
    status: "New",
  });

  await createLeadActivity({
    leadId: lead._id,
    action: "lead_created",
    meta: {
      source: lead.source,
      status: lead.status,
      webinarId: lead.webinar,
      webinarTitle: lead.webinarTitle,
    },
  });

  if ((lead.source || "").toLowerCase() === "checkout" && webinar) {
    logDebug("lead-registration", "Attempting webinar confirmation notification", {
      leadId: lead._id,
      webinarId: webinar._id,
      phone: lead.phone,
      webinarTitle: webinar.title,
    });

    try {
      const notificationResult =
        await webinarNotificationService.sendWebinarRegistrationConfirmation({
          lead,
          webinar,
        });

      logDebug("lead-registration", "Webinar confirmation notification completed", {
        leadId: lead._id,
        webinarId: webinar._id,
        whatsapp: notificationResult.whatsapp || null,
        email: notificationResult.email || null,
      });

      notification = buildNotificationSummary({
        whatsapp: {
          status: notificationResult.whatsapp?.failed
            ? "failed"
            : notificationResult.whatsapp?.skipped
              ? "skipped"
              : "sent",
          provider: "wati",
          reason: notificationResult.whatsapp?.reason || null,
          response: notificationResult.whatsapp?.data || null,
        },
        email: {
          status: notificationResult.email?.failed
            ? "failed"
            : notificationResult.email?.skipped
              ? "skipped"
              : "sent",
          provider: "sendgrid",
          reason: notificationResult.email?.reason || null,
          response: notificationResult.email?.data || null,
        },
      });

      await createLeadActivity({
        leadId: lead._id,
        action:
          notification.whatsapp.status === "sent" || notification.email.status === "sent"
            ? "webinar_confirmation_sent"
            : "webinar_confirmation_skipped",
        meta: {
          webinarId: webinar._id,
          webinarTitle: webinar.title,
          notifications: notification,
        },
      });
    } catch (error) {
      logError("lead-registration", "Webinar confirmation notification failed", {
        leadId: lead._id,
        webinarId: webinar._id,
        error: error.message,
        details: error.errors || null,
      });

      notification = buildNotificationSummary({
        whatsapp: {
          status: "failed",
          provider: "wati",
          reason: error.message,
          response: error.errors || null,
        },
        email: {
          status: "failed",
          provider: "sendgrid",
          reason: error.message,
          response: error.errors || null,
        },
      });

      await createLeadActivity({
        leadId: lead._id,
        action: "webinar_confirmation_failed",
        meta: {
          webinarId: webinar._id,
          webinarTitle: webinar.title,
          notifications: notification,
          error: error.message,
          details: error.errors || null,
        },
      });
    }
  } else if ((lead.source || "").toLowerCase() === "checkout" && lead.webinarTitle) {
    logWarn("lead-registration", "Skipping webinar confirmation because webinar could not be matched", {
      leadId: lead._id,
      webinarTitle: lead.webinarTitle,
    });

    notification = buildNotificationSummary({
      whatsapp: {
        status: "skipped",
        provider: "wati",
        reason: "No scheduled webinar matched the provided webinar title",
        response: null,
      },
      email: {
        status: "skipped",
        provider: "sendgrid",
        reason: "No scheduled webinar matched the provided webinar title",
        response: null,
      },
    });

    await createLeadActivity({
      leadId: lead._id,
      action: "webinar_confirmation_skipped",
      meta: {
        webinarTitle: lead.webinarTitle,
        reason: "No scheduled webinar matched the provided webinar title",
      },
    });
  }

  const createdLead = await Lead.findById(lead._id)
    .populate("assignedTo", "name email")
    .populate("webinar", "title eventDate startTime durationMinutes mode platform webinarLink location");

  const leadObject = createdLead.toObject();
  leadObject.notification = notification;

  return leadObject;
};

const listLeads = async (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const filters = buildLeadFilters(query);
  const sort = buildLeadSort(query.sortBy, query.sortOrder);

  const [items, total] = await Promise.all([
    Lead.find(filters)
      .populate("assignedTo", "name email")
      .populate("webinar", "title eventDate startTime durationMinutes mode platform webinarLink location")
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

const getLeadDetail = async (leadId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new HttpError(400, "Invalid lead id");
  }

  const lead = await Lead.findById(leadId)
    .populate("assignedTo", "name email")
    .populate("webinar", "title eventDate startTime durationMinutes mode platform webinarLink location");
  if (!lead) {
    throw new HttpError(404, "Lead not found");
  }

  if (userId) {
    await createLeadActivity({
      leadId,
      userId,
      action: "lead_opened",
    });
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

  if (updates.priority !== undefined) {
    if (!["hot", "warm", "cold"].includes(updates.priority)) {
      throw new HttpError(400, "Invalid priority");
    }
    if (updates.priority !== lead.priority) {
      activityJobs.push(
        createLeadActivity({
          leadId,
          userId: actor._id,
          action: "priority_changed",
          meta: {
            previousPriority: lead.priority,
            currentPriority: updates.priority,
          },
        })
      );
      lead.priority = updates.priority;
    }
  }

  if (updates.followUpDate !== undefined) {
    activityJobs.push(
      createLeadActivity({
        leadId,
        userId: actor._id,
        action: "followup_scheduled",
        meta: {
          previousDate: lead.followUpDate,
          currentDate: updates.followUpDate,
        },
      })
    );
    lead.followUpDate = updates.followUpDate;
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

  return Lead.findById(leadId)
    .populate("assignedTo", "name email")
    .populate("webinar", "title eventDate startTime durationMinutes mode platform webinarLink location");
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

const getLeadStats = async () => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const followUpFilter = {
    followUpDate: {
      $gte: startOfToday,
      $lt: endOfToday,
    },
  };

  const [totalLeads, newLeadsToday, convertedLeads, lostLeads, followupsToday, followupLeadsToday] = await Promise.all([
    Lead.countDocuments(),
    Lead.countDocuments({ createdAt: { $gte: startOfToday } }),
    Lead.countDocuments({ status: "Converted" }),
    Lead.countDocuments({ status: "Lost" }),
    Lead.countDocuments(followUpFilter),
    Lead.find(followUpFilter)
      .select("name followUpDate")
      .sort({ followUpDate: 1, name: 1 })
      .lean(),
  ]);

  return {
    total_leads: totalLeads,
    new_leads_today: newLeadsToday,
    converted_leads: convertedLeads,
    lost_leads: lostLeads,
    followups_today: followupsToday,
    followup_leads_today: followupLeadsToday.map((lead) => ({
      id: lead._id,
      name: lead.name,
      followUpDate: lead.followUpDate,
    })),
  };
};

const exportLeads = async () => {
  const leads = await Lead.find().populate("assignedTo", "name").sort({ createdAt: -1 });

  let csv = "Name,Email,Phone,City,Source,Status,Priority,AssignedTo,FollowUpDate,CreatedAt\n";
  for (const lead of leads) {
    const row = [
      `"${(lead.name || "").replace(/"/g, '""')}"`,
      `"${(lead.email || "").replace(/"/g, '""')}"`,
      `"${(lead.phone || "").replace(/"/g, '""')}"`,
      `"${(lead.city || "").replace(/"/g, '""')}"`,
      `"${(lead.source || "").replace(/"/g, '""')}"`,
      `"${lead.status || ""}"`,
      `"${lead.priority || ""}"`,
      `"${lead.assignedTo ? lead.assignedTo.name : "Unassigned"}"`,
      `"${lead.followUpDate ? lead.followUpDate.toISOString() : ""}"`,
      `"${lead.createdAt.toISOString()}"`
    ];
    csv += row.join(",") + "\n";
  }
  return csv;
};

const deleteLeadsAndRelations = async (leadIds) => {
  await Promise.all([
    LeadActivity.deleteMany({ lead: { $in: leadIds } }),
    LeadNote.deleteMany({ lead: { $in: leadIds } }),
    Lead.deleteMany({ _id: { $in: leadIds } }),
  ]);
};

const deleteLead = async (leadId) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new HttpError(400, "Invalid lead id");
  }

  const lead = await Lead.findById(leadId);
  if (!lead) {
    throw new HttpError(404, "Lead not found");
  }

  await deleteLeadsAndRelations([lead._id]);
};

const deleteLeadsAdmin = async ({ leadIds, name, deleteAll }) => {
  const hasLeadIds = Array.isArray(leadIds) && leadIds.length > 0;
  const hasName = typeof name === "string" && name.trim();

  if (!deleteAll && !hasLeadIds && !hasName) {
    throw new HttpError(
      400,
      "Provide deleteAll=true, a leadIds array, or a name to delete leads"
    );
  }

  let filters = {};

  if (deleteAll) {
    filters = {};
  } else if (hasLeadIds) {
    const invalidLeadId = leadIds.find((leadId) => !mongoose.Types.ObjectId.isValid(leadId));
    if (invalidLeadId) {
      throw new HttpError(400, `Invalid lead id: ${invalidLeadId}`);
    }

    filters = {
      _id: { $in: leadIds },
    };
  } else if (hasName) {
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filters = {
      name: new RegExp(`^${escapedName}$`, "i"),
    };
  }

  const leads = await Lead.find(filters).select("_id name email phone");
  if (leads.length === 0) {
    throw new HttpError(404, "No leads found matching the delete criteria");
  }

  const matchedLeadIds = leads.map((lead) => lead._id);
  await deleteLeadsAndRelations(matchedLeadIds);

  return {
    deletedCount: matchedLeadIds.length,
    deletedLeadIds: matchedLeadIds,
    deletedLeads: leads,
  };
};

module.exports = {
  addLeadNote,
  createLead,
  deleteLead,
  deleteLeadsAdmin,
  getLeadDetail,
  listLeads,
  updateLead,
  getLeadStats,
  exportLeads,
};
