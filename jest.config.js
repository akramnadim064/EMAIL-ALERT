module.exports = {
  reporters: [
    "default",
    ["jest-html-reporter", {
      pageTitle: "Test Report on Mail Notify via Whatsapp",
      outputPath: "./test-report.html",
      includeFailureMsg: true
    }]
  ]
};
