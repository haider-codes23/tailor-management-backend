/**
 * Role Permission Templates
 *
 * Predefined permission sets for each role.
 * Matches frontend's ROLE_TEMPLATES in src/lib/permissions.js.
 *
 * When an admin selects a role during user creation, these permissions
 * are auto-populated as a starting point that can be customized.
 */

const ROLE_TEMPLATES = {
    ADMIN: {
        label: "Administrator (Full Access)",
        permissions: [
            // User Management
            "users.view", "users.create", "users.edit", "users.delete",
            // Inventory
            "inventory.view", "inventory.create", "inventory.edit",
            "inventory.delete", "inventory.stock_in", "inventory.stock_out",
            // Products & BOM
            "products.view", "products.create", "products.edit",
            "products.delete", "products.manage_bom",
            // Measurements
            "measurements.view", "measurements.edit",
            // Orders
            "orders.view", "orders.create", "orders.edit", "orders.delete",
            "orders.manage_customer_forms", "orders.approve_customer_forms",
            // Fabrication
            "fabrication.view", "fabrication.create_bom", "fabrication.edit_bom",
            // Production
            "production.view", "production.manage", "production.assign_tasks",
            "production.approve_packets", "production.assign_head",
            "production.send_to_qa", "production.start_task", "production.complete_task",
            // Procurement
            "procurement.view", "procurement.manage",
            // QA
            "qa.view", "qa.approve", "qa.request_rework",
            "qa.reject", "qa.upload_video", "qa.send_to_sales", "qa.view_sales_requests",
            "qa.add_video_link",
            // Dyeing
            "dyeing.view", "dyeing.accept", "dyeing.start",
            "dyeing.complete", "dyeing.view_all",
            // Dispatch
            "dispatch.view", "dispatch.manage",
            // Sales Approval
            "sales.view_approval_queue", "sales.send_to_client",
            "sales.mark_client_approved", "sales.request_alteration",
            "sales.request_revideo", "sales.cancel_order", "sales.approve_payments",
            "sales.view", "sales.upload_screenshots", "sales.start_from_scratch",
            // Reports
            "reports.view",
        ],
    },

    SALES: {
        label: "Sales Representative",
        permissions: [
            "orders.view", "orders.create", "order.edit",
            "production.view", "production.manage", "production.assign_tasks", "users.view",
            "orders.manage_customer_forms", "orders.approve_customer_forms",
            "inventory.view", "products.view",
            "sales.view_approval_queue", "sales.send_to_client",
            "sales.mark_client_approved", "sales.request_alteration",
            "sales.request_revideo", "sales.cancel_order", "sales.approve_payments",
        ],
    },

    FABRICATION: {
        label: "Fabrication (Bespoke)",
        permissions: [
            "fabrication.view", "fabrication.create_bom", "fabrication.edit_bom",
            "inventory.view", "products.view",
        ],
    },

    PRODUCTION_HEAD: {
        label: "Production Head",
        permissions: [
            "orders.view", "production.view", "production.manage",
            "production.assign_tasks", "production.approve_packets",
            "production.send_to_qa", "inventory.view", "products.view",
        ],
    },

    PACKET_CREATOR: {
        label: "Packet Creator",
        permissions: [
            "orders.view", "production.view", "inventory.view", "products.view",
            "fabrication.view", "fabrication.create_bom", "fabrication.edit_bom",
        ],
    },

    DYEING: {
        label: "Dyeing Department",
        permissions: [
            "dyeing.view", "dyeing.accept", "dyeing.start", "dyeing.complete",
            "orders.view", "inventory.view", "products.view",
            // Allow dyeing users to assign production heads after dyeing completes
            "production.view", "production.assign_head",
        ],
    },

    WORKER: {
        label: "Production Worker",
        permissions: [
            "production.view", "production.start_task", "production.complete_task",
            "orders.view",
        ],
    },

    QA: {
        label: "Quality Assurance",
        permissions: [
            "orders.view", "qa.view", "qa.approve", "qa.request_rework",
            "qa.reject", "qa.upload_video", "qa.send_to_sales",
            "qa.view_sales_requests", "qa.add_video_link", "products.view",
        ],
    },

    PURCHASER: {
        label: "Purchaser",
        permissions: [
            "procurement.view", "procurement.manage",
            "inventory.view", "inventory.stock_in", "orders.view",
        ],
    },

    DISPATCH: {
        label: "Dispatch Manager",
        permissions: [
            "orders.view", "dispatch.view", "dispatch.manage",
        ],
    },

    CUSTOM: {
        label: "Custom Role (Select Permissions Manually)",
        permissions: [],
    },
};

module.exports = { ROLE_TEMPLATES };