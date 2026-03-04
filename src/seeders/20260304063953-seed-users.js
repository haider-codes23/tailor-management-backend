"use strict";

const bcrypt = require("bcryptjs");
const crypto = require("crypto");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const mockUsers = [
      {
        name: "Admin User",
        email: "admin@tailor.com",
        password: "admin123",
        role: "ADMIN",
        phone: "+92 300 1234567",
        is_active: true,
        permissions: JSON.stringify([
          "users.view", "users.create", "users.edit", "users.delete",
          "inventory.view", "inventory.create", "inventory.edit", "inventory.delete", "inventory.stock_in", "inventory.stock_out",
          "products.view", "products.create", "products.edit", "products.delete", "products.manage_bom",
          "measurements.view", "measurements.edit",
          "orders.view", "orders.create", "orders.edit", "orders.delete", "orders.manage_customer_forms", "orders.approve_customer_forms",
          "production.view", "production.manage", "production.assign_tasks", "production.approve_packets",
          "procurement.view", "procurement.manage",
          "qa.view", "qa.approve", "qa.request_rework",
          "dispatch.view", "dispatch.manage",
          "reports.view", "fabrication.view", "fabrication.create_bom", "fabrication.edit_bom",
          "dyeing.view", "dyeing.accept", "dyeing.start", "dyeing.complete", "dyeing.view_all",
          "production.assign_head", "production.send_to_qa",
          "sales.view_approval_queue", "sales.send_to_client", "sales.mark_client_approved",
          "qa.reject", "qa.upload_video", "qa.send_to_sales", "qa.view_sales_requests",
          "sales.view", "sales.upload_screenshots", "sales.request_revideo", "sales.request_alteration", "sales.cancel_order", "sales.approve_payments", "sales.start_from_scratch",
        ]),
      },
      {
        name: "Sarah Sales",
        email: "sales@tailor.com",
        password: "sales123",
        role: "SALES",
        phone: "+92 300 2234567",
        is_active: true,
        permissions: JSON.stringify([
          "orders.view", "orders.create", "orders.manage_customer_forms", "orders.approve_customer_forms",
          "inventory.view", "products.view", "sales.view_approval_queue", "sales.send_to_client",
          "sales.mark_client_approved", "sales.view", "sales.upload_screenshots", "sales.request_revideo",
          "sales.request_alteration", "sales.cancel_order", "sales.approve_payments", "sales.start_from_scratch",
        ]),
      },
      {
        name: "Mike Supervisor",
        email: "supervisor@tailor.com",
        password: "super123",
        role: "PRODUCTION_HEAD",
        phone: "+92 300 3234567",
        is_active: true,
        permissions: JSON.stringify([
          "orders.view", "production.view", "production.manage", "production.assign_tasks", "production.approve_packets", "production.send_to_qa",
          "inventory.view", "products.view",
        ]),
      },
      {
        name: "John Worker",
        email: "john_worker@tailor.com",
        password: "worker123",
        role: "WORKER",
        phone: "+92 300 4234567",
        is_active: true,
        permissions: JSON.stringify([
          "production.view", "production.start_task", "production.complete_task", "orders.view",
        ]),
      },
      {
        name: "Lisa Purchaser",
        email: "purchaser@tailor.com",
        password: "purchase123",
        role: "PURCHASER",
        phone: "+92 300 5234567",
        is_active: true,
        permissions: JSON.stringify([
          "procurement.view", "procurement.manage", "inventory.view", "inventory.stock_in", "orders.view",
        ]),
      },
      {
        name: "David QA",
        email: "qa@tailor.com",
        password: "qa1234",
        role: "QA",
        phone: "+92 300 6234567",
        is_active: true,
        permissions: JSON.stringify([
          "orders.view", "qa.view", "qa.approve", "qa.request_rework", "products.view", "qa.add_video_link",
          "qa.reject", "qa.upload_video", "qa.send_to_sales", "qa.view_sales_requests",
        ]),
      },
      {
        name: "Micheal",
        email: "micheal_worker@tailor.com",
        password: "worker123",
        role: "WORKER",
        phone: "+92 300 0000000",
        is_active: false,
        permissions: JSON.stringify(["production.view"]),
      },
      {
        name: "Fatima Khan",
        email: "fatima@tailor.com",
        password: "fatima123",
        role: "SALES",
        phone: "+92 300 8234567",
        is_active: true,
        permissions: JSON.stringify(["orders.view", "orders.create", "orders.manage_customer_forms", "orders.approve_customer_forms", "inventory.view", "products.view"]),
      },
      {
        name: "Ali Hassan",
        email: "ali@tailor.com",
        password: "ali123",
        role: "SALES",
        phone: "+92 300 9234567",
        is_active: true,
        permissions: JSON.stringify(["orders.view", "orders.create", "orders.manage_customer_forms", "orders.approve_customer_forms", "inventory.view", "products.view"]),
      },
      {
        name: "Zainab Ahmed",
        email: "zainab@tailor.com",
        password: "zainab123",
        role: "SALES",
        phone: "+92 300 1034567",
        is_active: true,
        permissions: JSON.stringify(["orders.view", "orders.create", "orders.manage_customer_forms", "orders.approve_customer_forms", "inventory.view", "products.view"]),
      },
      {
        name: "Bilal Sheikh",
        email: "bilal@tailor.com",
        password: "bilal123",
        role: "PRODUCTION_HEAD",
        phone: "+92 300 1134567",
        is_active: true,
        permissions: JSON.stringify(["orders.view", "production.view", "production.manage", "production.assign_tasks", "production.approve_packets", "production.send_to_qa", "inventory.view", "products.view"]),
      },
      {
        name: "Hira Malik",
        email: "hira@tailor.com",
        password: "hira123",
        role: "PRODUCTION_HEAD",
        phone: "+92 300 1234568",
        is_active: true,
        permissions: JSON.stringify(["orders.view", "production.view", "production.manage", "production.assign_tasks", "production.approve_packets", "production.send_to_qa", "inventory.view", "products.view"]),
      },
      {
        name: "Ahmad Fabrication",
        email: "fabrication@tailor.com",
        password: "fabric123",
        role: "FABRICATION",
        phone: "+92 300 1334567",
        is_active: true,
        permissions: JSON.stringify(["fabrication.view", "fabrication.create_bom", "fabrication.edit_bom", "inventory.view", "products.view"]),
      },
      {
        name: "Imran Shah",
        email: "imran_dyeing@tailor.com",
        password: "password123",
        role: "DYEING",
        phone: null,
        is_active: true,
        permissions: JSON.stringify(["dyeing.view", "dyeing.accept", "dyeing.start", "dyeing.complete", "orders.view", "inventory.view", "products.view"]),
      },
      {
        name: "Tariq Ahmed",
        email: "tariq_dyeing@tailor.com",
        password: "password123",
        role: "DYEING",
        phone: null,
        is_active: true,
        permissions: JSON.stringify(["dyeing.view", "dyeing.accept", "dyeing.start", "dyeing.complete", "orders.view", "inventory.view", "products.view"]),
      },
      {
        name: "Usman Ali",
        email: "usman@tailor.com",
        password: "usman123",
        role: "WORKER",
        phone: "+92 300 2001111",
        is_active: true,
        permissions: JSON.stringify(["production.view", "production.start_task", "production.complete_task", "orders.view"]),
      },
      {
        name: "Kamran Shah",
        email: "kamran@tailor.com",
        password: "kamran123",
        role: "WORKER",
        phone: "+92 300 2002222",
        is_active: true,
        permissions: JSON.stringify(["production.view", "production.start_task", "production.complete_task", "orders.view"]),
      },
      {
        name: "Nadeem Akhtar",
        email: "nadeem@tailor.com",
        password: "nadeem123",
        role: "WORKER",
        phone: "+92 300 2003333",
        is_active: true,
        permissions: JSON.stringify(["production.view", "production.start_task", "production.complete_task", "orders.view"]),
      },
      {
        name: "Tariq Mehmood",
        email: "tariq@tailor.com",
        password: "tariq123",
        role: "WORKER",
        phone: "+92 300 2004444",
        is_active: true,
        permissions: JSON.stringify(["production.view", "production.start_task", "production.complete_task", "orders.view"]),
      },
      {
        name: "Waseem Khan",
        email: "waseem@tailor.com",
        password: "waseem123",
        role: "WORKER",
        phone: "+92 300 2005555",
        is_active: true,
        permissions: JSON.stringify(["production.view", "production.start_task", "production.complete_task", "orders.view"]),
      },
      {
        name: "Tom Dispatch",
        email: "dispatch@tailor.com",
        password: "dispatch123",
        role: "DISPATCH",
        phone: "+92 300 1134567",
        is_active: true,
        permissions: JSON.stringify(["orders.view", "dispatch.view", "dispatch.manage"]),
      },
    ];

    const usersToInsert = [];
    for (const u of mockUsers) {
      const passwordHash = await bcrypt.hash(u.password, 12);
      usersToInsert.push({
        id: crypto.randomUUID(),
        name: u.name,
        email: u.email,
        password_hash: passwordHash,
        role: u.role,
        phone: u.phone,
        permissions: u.permissions, // JSON string for bulkInsert
        is_active: u.is_active,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    await queryInterface.bulkInsert("users", usersToInsert, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("users", null, {});
  },
};
