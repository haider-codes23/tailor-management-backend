"use strict";

/**
 * Backfills the `shopify.manage` permission for the admin user.
 *
 * Needed because:
 *   - shopifyRoutes.js previously used `requirePermission("admin")`,
 *     which is a string nobody had → 403 for everyone.
 *   - The route was changed to `requirePermission("shopify.manage")`.
 *   - The seeder + ROLE_TEMPLATES were updated, but existing admin rows
 *     in already-seeded databases (local + Render) still lack this perm.
 *
 * This migration is idempotent — re-running it is a no-op.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE users
      SET permissions = permissions::jsonb || '["shopify.manage"]'::jsonb,
          updated_at  = NOW()
      WHERE email = 'admin@tailor.com'
        AND NOT (permissions::jsonb ? 'shopify.manage');
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE users
      SET permissions = (permissions::jsonb - 'shopify.manage'),
          updated_at  = NOW()
      WHERE email = 'admin@tailor.com'
        AND (permissions::jsonb ? 'shopify.manage');
    `);
  },
};