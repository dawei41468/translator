// packages/db/src/schema.ts
import { pgTable, uuid, varchar, timestamp, text, numeric, integer, boolean, index, json } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const businessUnits = pgTable("business_units", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 50 }).unique().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  businessUnit: varchar("business_unit", { length: 50 }).notNull(),
  role: varchar("role", { length: 20 }).default("user"),
  language: varchar("language", { length: 10 }).default("en"),
  isActive: boolean("is_active").default(true).notNull(),
  enableConflictEmails: boolean("enable_conflict_emails").default(true).notNull(),
  enableCommentEmails: boolean("enable_comment_emails").default(true).notNull(),
  enableQuoteExpiringEmails: boolean("enable_quote_expiring_emails").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Projects table — the main entity multiple teams might pursue
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectName: varchar("project_name", { length: 500 }).notNull(),
  endClient: varchar("end_client", { length: 500 }),
  tenderNumber: varchar("tender_number", { length: 255 }),
  estimatedValueUsd: numeric("estimated_value_usd", { precision: 12, scale: 2 }),
  location: varchar("location", { length: 255 }),
  description: text("description"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => sql`now()`),
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  // Indexes for fast fuzzy/conflict searches
  projectNameIdx: index("projects_project_name_idx").on(table.projectName),
  endClientIdx: index("projects_end_client_idx").on(table.endClient),
  tenderNumberIdx: index("projects_tender_number_idx").on(table.tenderNumber),
}));

// Leads table — one team's pursuit of a project
export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  ownerBusinessUnit: varchar("owner_business_unit", { length: 50 }).notNull(), // redundant for fast queries
  quotedPriceUsd: numeric("quoted_price_usd", { precision: 12, scale: 2 }),
  quoteValidityDate: timestamp("quote_validity_date"),
  status: varchar("status", { length: 50 }).default("active"), // active | won | lost | withdrawn
  notes: text("notes"),
  contactPersonName: varchar("contact_person_name", { length: 255 }),
  contactPersonEmail: varchar("contact_person_email", { length: 255 }),
  contactPersonPhone: varchar("contact_person_phone", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => sql`now()`),
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  projectIdx: index("leads_project_idx").on(table.projectId),
  ownerIdx: index("leads_owner_idx").on(table.ownerUserId),
  buStatusIdx: index("idx_leads_owner_bu_status").on(table.ownerBusinessUnit, table.status).where(sql`deleted_at IS NULL`),
  createdAtIdx: index("idx_leads_created_at").on(table.createdAt).where(sql`deleted_at IS NULL`),
}));

// Comments — internal discussion thread per project
// @ts-ignore - self-referencing table
export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  // @ts-ignore - self-referencing
  parentId: uuid("parent_id").references(() => comments.id, { onDelete: "cascade" }), // for threaded replies
  path: text("path").notNull(), // e.g., "1", "1.2", "1.2.3" for threading order
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => sql`now()`),
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  projectIdx: index("comments_project_idx").on(table.projectId),
  authorIdx: index("comments_author_idx").on(table.authorId),
  pathIdx: index("comments_path_idx").on(table.path),
}));

// Files — uploaded PDF quotes and other documents
export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }), // optional — can be project-level too
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  fileType: varchar("file_type", { length: 20 }).default("project").notNull(), // 'quote' | 'project'
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileUrl: text("file_url").notNull(), // Cloudflare R2 signed URL or public URL
  r2Key: text("r2_key").notNull(), // Cloudflare R2 object key
  mimeType: varchar("mime_type", { length: 100 }).default("application/pdf"),
  sizeBytes: integer("size_bytes"),
  virusStatus: varchar("virus_status", { length: 20 }).default("pending"), // pending | clean | infected
  uploadedByUserId: uuid("uploaded_by_user_id")
    .notNull()
    .references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => sql`now()`),
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  projectIdx: index("files_project_idx").on(table.projectId),
  leadIdx: index("files_lead_idx").on(table.leadId),
  fileTypeIdx: index("files_file_type_idx").on(table.fileType),
}));

// Notifications — in-app notifications for users
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // e.g., 'conflict', 'comment'
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => sql`now()`),
}, (table) => ({
  userIdx: index("notifications_user_idx").on(table.userId),
  readIdx: index("notifications_read_idx").on(table.read),
  projectIdx: index("notifications_project_idx").on(table.projectId),
}));

// Audit Logs — comprehensive audit trail for accountability and business intelligence
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Foundation: Who did what when (accountability)
  userId: uuid("user_id").references(() => users.id),
  userBusinessUnit: varchar("user_business_unit", { length: 50 }),
  userRole: varchar("user_role", { length: 20 }),
  action: varchar("action", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }), // 'user', 'project', 'lead', 'file'
  targetId: varchar("target_id", { length: 255 }),
  targetBusinessUnit: varchar("target_business_unit", { length: 50 }),
  previousValues: json("previous_values"),
  newValues: json("new_values"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  endpoint: varchar("endpoint", { length: 255 }),

  // Mission: Business intelligence (company-first metrics)
  metadata: json("metadata").notNull(), // Flexible for business context
  severity: varchar("severity", { length: 20 }).default('info'), // 'info', 'warning', 'positive'
  groupProfitImpact: numeric("group_profit_impact", { precision: 15, scale: 2 }),
  coordinationScore: numeric("coordination_score", { precision: 5, scale: 2 }),

  // When
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Indexes for foundation queries (accountability)
  userIdx: index("audit_logs_user_idx").on(table.userId),
  actionIdx: index("audit_logs_action_idx").on(table.action),
  createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),

  // Indexes for mission queries (business intelligence)
  severityIdx: index("audit_logs_severity_idx").on(table.severity),
  undercuttingIdx: index("audit_logs_undercutting_idx").on(
    table.action, table.createdAt
  ).where(sql`${table.action} = 'UNDERCUTTING_DETECTED'`),
  coordinationIdx: index("audit_logs_coordination_idx").on(
    table.action, table.groupProfitImpact
  ).where(sql`${table.action} = 'COORDINATION_SUCCESS'`),

  // Cross-BU monitoring
  crossBuIdx: index("audit_logs_cross_bu_idx").on(
    table.userBusinessUnit, table.targetBusinessUnit
  ),
}));

// Relations
export const projectsRelations = relations(projects, ({ many }) => ({
  leads: many(leads),
  comments: many(comments),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  project: one(projects, {
    fields: [leads.projectId],
    references: [projects.id],
  }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  project: one(projects, {
    fields: [files.projectId],
    references: [projects.id],
  }),
  lead: one(leads, {
    fields: [files.leadId],
    references: [leads.id],
  }),
  uploader: one(users, {
    fields: [files.uploadedByUserId],
    references: [users.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  project: one(projects, {
    fields: [comments.projectId],
    references: [projects.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));