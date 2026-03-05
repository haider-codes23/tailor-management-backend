/**
 * Role Constants
 *
 * Single source of truth for valid user roles.
 * Used by the User model, validation schemas, and services.
 * Matches frontend's USER_ROLES in src/mocks/data/mockUser.js.
 */

const VALID_ROLES = [
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

module.exports = { VALID_ROLES };