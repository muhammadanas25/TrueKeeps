import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("image_url"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const themes = pgTable("themes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  pageCount: integer("page_count").notNull().default(20),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  themeId: varchar("theme_id"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectPages = pgTable("project_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  pageNumber: integer("page_number").notNull(),
  layoutId: text("layout_id"),
  backgroundUrl: text("background_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pagePhotos = pgTable("page_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pageId: varchar("page_id").notNull(),
  photoUrl: text("photo_url").notNull(),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  width: real("width").notNull().default(100),
  height: real("height").notNull().default(100),
  rotation: real("rotation").notNull().default(0),
  zIndex: integer("z_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const uploadedPhotos = pgTable("uploaded_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  projectId: varchar("project_id"),
  /** Servable URL of the original (media-store public URL; legacy rows may hold data: URLs) */
  url: text("url").notNull(),
  originalFilename: text("original_filename").notNull(),
  /** Media-store object key of the original; null for legacy data-URL rows */
  storageKey: text("storage_key"),
  /** Servable URL of the ~400px thumbnail derivative (set async by the image pipeline) */
  thumbUrl: text("thumb_url"),
  /** Servable URL of the ~1200px preview derivative (set async by the image pipeline) */
  previewUrl: text("preview_url"),
  /** Pixel dimensions of the (EXIF-rotated) original; set async by the image pipeline */
  width: integer("width"),
  height: integer("height"),
  sizeBytes: integer("size_bytes"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});

export const insertThemeSchema = createInsertSchema(themes).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectPageSchema = createInsertSchema(projectPages).omit({
  id: true,
  createdAt: true,
});

export const insertPagePhotoSchema = createInsertSchema(pagePhotos).omit({
  id: true,
  createdAt: true,
});

export const insertUploadedPhotoSchema = createInsertSchema(uploadedPhotos).omit({
  id: true,
  uploadedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertTheme = z.infer<typeof insertThemeSchema>;
export type Theme = typeof themes.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProjectPage = z.infer<typeof insertProjectPageSchema>;
export type ProjectPage = typeof projectPages.$inferSelect;
export type InsertPagePhoto = z.infer<typeof insertPagePhotoSchema>;
export type PagePhoto = typeof pagePhotos.$inferSelect;
export type InsertUploadedPhoto = z.infer<typeof insertUploadedPhotoSchema>;
export type UploadedPhoto = typeof uploadedPhotos.$inferSelect;
