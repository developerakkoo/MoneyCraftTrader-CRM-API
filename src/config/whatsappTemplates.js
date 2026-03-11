const buildTemplateDefinitions = () => {
  const templates = [
    {
      name:
        process.env.WATI_WEBINAR_TEMPLATE_NAME ||
        "moneycraft_webinar_registration_confirmation",
      displayName: "Webinar Registration Confirmation",
      category: "webinar",
      description: "Confirmation message for webinar registration.",
      variables: [
        { key: "name", label: "Lead Name", required: true, source: "lead.name" },
        { key: "webinar_title", label: "Webinar Title", required: true, source: "webinar.title" },
        { key: "email", label: "Lead Email", required: true, source: "lead.email" },
        { key: "event_date", label: "Event Date", required: true, source: "webinar.eventDateLabel" },
        { key: "event_time", label: "Event Time", required: true, source: "webinar.eventTimeLabel" },
        { key: "platform", label: "Platform", required: true, source: "webinar.platformLabel" },
        { key: "webinar_link", label: "Webinar Link", required: true, source: "webinar.webinarLinkLabel" },
      ],
    },
    {
      name:
        process.env.WATI_WEBINAR_REMINDER_TEMPLATE_NAME ||
        "moneycraft_webinar_dynamic_reminder",
      displayName: "Webinar Reminder",
      category: "webinar",
      description: "Reminder message before the webinar starts.",
      variables: [
        { key: "name", label: "Lead Name", required: true, source: "lead.name" },
        {
          key: "reminder_time",
          label: "Reminder Window",
          required: true,
          source: null,
          defaultValue: "1 hour",
        },
        { key: "webinar_name", label: "Webinar Title", required: true, source: "webinar.title" },
        { key: "date", label: "Event Date", required: true, source: "webinar.eventDateLabel" },
        { key: "time", label: "Event Time", required: true, source: "webinar.timeOnlyLabel" },
        { key: "platform", label: "Platform", required: true, source: "webinar.modeLabel" },
        { key: "webinar_link", label: "Webinar Link", required: true, source: "webinar.webinarLinkLabel" },
      ],
    },
  ];

  if (process.env.WATI_LEAD_FOLLOWUP_TEMPLATE_NAME) {
    templates.push({
      name: process.env.WATI_LEAD_FOLLOWUP_TEMPLATE_NAME,
      displayName: "Lead Follow Up",
      category: "lead",
      description: "Generic follow-up message for a lead.",
      variables: [
        { key: "name", label: "Lead Name", required: true, source: "lead.name" },
        { key: "city", label: "City", required: false, source: "lead.city" },
        {
          key: "custom_message",
          label: "Custom Message",
          required: true,
          source: null,
          defaultValue: "",
        },
      ],
    });
  }

  return templates.reduce((result, template) => {
    if (!result.some((item) => item.name === template.name)) {
      result.push(template);
    }
    return result;
  }, []);
};

module.exports = {
  buildTemplateDefinitions,
};
