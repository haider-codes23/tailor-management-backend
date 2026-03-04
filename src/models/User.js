/**
 * User Model
 *
 * Sequelize model for the `users` table.
 * Handles password hashing, safe JSON serialization,
 * and email-based lookups.
 */

const { DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

/**
 * Valid user roles — matches frontend's USER_ROLES constant
 */
const USER_ROLES = [
    "ADMIN",
    "SALES",
    "FABRICATION",
    "PRODUCTION_HEAD",
    "PACKET_CREATOR",
    "DYEING",
    "WORKER",
    "QA",
    "PURCHASER",
    "DISPATCH",
    "CUSTOM",
];

module.exports = (sequelize) => {
    const User = sequelize.define(
        "User",
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },
            name: {
                type: DataTypes.STRING(255),
                allowNull: false,
                validate: {
                    notEmpty: { msg: "Name is required" },
                },
            },
            email: {
                type: DataTypes.STRING(255),
                allowNull: false,
                unique: {
                    msg: "Email already in use",
                },
                validate: {
                    isEmail: { msg: "Must be a valid email address" },
                    notEmpty: { msg: "Email is required" },
                },
            },
            password_hash: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            role: {
                type: DataTypes.STRING(50),
                allowNull: false,
                defaultValue: "CUSTOM",
                validate: {
                    isIn: {
                        args: [USER_ROLES],
                        msg: `Role must be one of: ${USER_ROLES.join(", ")}`,
                    },
                },
            },
            phone: {
                type: DataTypes.STRING(50),
                allowNull: true,
            },
            permissions: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: [],
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            refresh_token_hash: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            last_login_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "users",
            timestamps: true,
            underscored: true,
        }
    );

    // ===========================================================================
    // Instance Methods
    // ===========================================================================

    /**
     * Compare a plain-text password against the stored hash
     * @param {string} plainPassword - The password to check
     * @returns {Promise<boolean>}
     */
    User.prototype.validPassword = async function (plainPassword) {
        return bcrypt.compare(plainPassword, this.password_hash);
    };

    /**
     * Return user data safe for sending to the frontend.
     * Excludes password_hash and refresh_token_hash.
     * @returns {Object}
     */
    User.prototype.toSafeJSON = function () {
        const values = this.toJSON();
        delete values.password_hash;
        delete values.refresh_token_hash;
        return values;
    };

    // ===========================================================================
    // Class Methods
    // ===========================================================================

    /**
     * Find an active user by email (case-insensitive)
     * @param {string} email
     * @returns {Promise<User|null>}
     */
    User.findByEmail = async function (email) {
        return this.findOne({
            where: sequelize.where(
                sequelize.fn("LOWER", sequelize.col("email")),
                email.toLowerCase()
            ),
        });
    };

    /**
     * Hash a plain-text password
     * @param {string} plainPassword
     * @returns {Promise<string>}
     */
    User.hashPassword = async function (plainPassword) {
        return bcrypt.hash(plainPassword, SALT_ROUNDS);
    };

    return User;
};
