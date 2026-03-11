const asyncHandler = require("../utils/asyncHandler");
const whatsappService = require("../services/whatsapp.services");

const listTemplates = asyncHandler(async (_req, res) => {
  const templates = await whatsappService.listTemplates();

  res.status(200).json({
    success: true,
    data: templates,
  });
});

const getTemplateDetails = asyncHandler(async (req, res) => {
  const template = await whatsappService.getTemplateDetails(req.params.name, req.query);

  res.status(200).json({
    success: true,
    data: template,
  });
});

const sendTemplate = asyncHandler(async (req, res) => {
  const result = await whatsappService.sendTemplate(req.body, req.user);

  res.status(200).json({
    success: true,
    data: result,
  });
});

module.exports = {
  getTemplateDetails,
  listTemplates,
  sendTemplate,
};
