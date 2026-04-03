/**
 * QaReview Model
 *
 * Tracks individual QA review actions per section per round.
 * Each approve/reject creates a new row for audit history.
 * Also stores video upload data at the order-item level.
 *
 * Maps to the `qa_reviews` table created in migration 17.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QaReview = sequelize.define(
    "QaReview",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      section_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      round: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        comment: "PENDING, APPROVED, REJECTED",
      },
      // Review details
      reviewed_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      reviewed_by_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Rejection details
      rejection_reason_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      rejection_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Video data
      video_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      video_uploaded_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      video_uploaded_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      video_file_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      video_file_size: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      video_duration: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      // Re-video request
      re_video_request: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: "qa_reviews",
      timestamps: true,
      underscored: true,
    }
  );

  QaReview.associate = (models) => {
    QaReview.belongsTo(models.OrderItem, {
      foreignKey: "order_item_id",
      as: "orderItem",
    });
    QaReview.belongsTo(models.User, {
      foreignKey: "reviewed_by",
      as: "reviewer",
    });
    QaReview.belongsTo(models.User, {
      foreignKey: "video_uploaded_by",
      as: "videoUploader",
    });
  };

  return QaReview;
};