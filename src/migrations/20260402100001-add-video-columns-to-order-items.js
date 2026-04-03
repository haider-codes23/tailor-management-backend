"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // video_data — YouTube URL, upload metadata, video history
    await queryInterface.addColumn("order_items", "video_data", {
      type: Sequelize.JSONB,
      allowNull: true,
      comment:
        "{youtubeUrl, youtubeVideoId, uploadedBy, uploadedByName, uploadedAt, originalFileName, originalFileSize, videoHistory: []}",
    });

    // re_video_request — Sales request for QA to re-upload video
    await queryInterface.addColumn("order_items", "re_video_request", {
      type: Sequelize.JSONB,
      allowNull: true,
      comment:
        "{requestedBy, requestedByName, requestedAt, sections: [], notes: {}}",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("order_items", "re_video_request");
    await queryInterface.removeColumn("order_items", "video_data");
  },
};