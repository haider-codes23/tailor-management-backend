/**
 * User Model
 *
 * Sequelize model for the `users` table.
 * Handles password hashing via hooks, safe JSON serialization,
 * and email-based lookups.
 */

const { DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs");
const { VALID_ROLES } = require("../constants/roles");

const SALT_ROUNDS = 12;

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
            // Virtual field — accepts plain password, never stored in DB.
            // The beforeCreate/beforeUpdate hooks hash it into password_hash.
            password: {
                type: DataTypes.VIRTUAL,
                validate: {
                    len: {
                        args: [6, 128],
                        msg: "Password must be between 6 and 128 characters",
                    },
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
                        args: [VALID_ROLES],
                        msg: `Role must be one of: ${VALID_ROLES.join(", ")}`,
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
    // Hooks — automatic password hashing
    // ===========================================================================

    /**
     * Before creating a user, hash the virtual `password` field
     * into `password_hash`. This keeps hashing logic out of services.
     */
       User.beforeValidate(async (user) => {
        if (user.password) {
            user.password_hash = await bcrypt.hash(user.password, SALT_ROUNDS);
        }
    });

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
     * Excludes password_hash, refresh_token_hash, and the virtual password field.
     * @returns {Object}
     */
    User.prototype.toSafeJSON = function () {
        const values = this.toJSON();
        delete values.password_hash;
        delete values.refresh_token_hash;
        delete values.password;
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
     * Hash a plain-text password (standalone utility)
     * Kept for backward compatibility with authService seeder usage.
     * Prefer using the virtual `password` field + hooks for new code.
     * @param {string} plainPassword
     * @returns {Promise<string>}
     */
    User.hashPassword = async function (plainPassword) {
        return bcrypt.hash(plainPassword, SALT_ROUNDS);
    };

    return User;
};