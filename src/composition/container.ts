import "server-only";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { GetCurrentUser, Logout, RequestMagicLink, UpdateProfile, VerifyMagicLink } from "@/application/auth";
import type { Deps } from "@/application/deps";
import type { FileStorage } from "@/application/ports";
import { GetEventIcs, GetPublicWebsite } from "@/application/public";
import { AddItem, DeleteItem, MoveItem, UpdateItem, UpdateSection } from "@/application/sections";
import { GetUpload, UploadImage } from "@/application/uploads";
import {
  CreateWebsite,
  DeleteWebsite,
  GetWebsiteForOwner,
  ListWebsites,
  SelectTheme,
  SetCoverImage,
  UpdateDesign,
  UpdateHome,
  UpdateSlug,
} from "@/application/websites";
import { createDatabase } from "@/infrastructure/db/client";
import { SharpImageProcessor } from "@/infrastructure/images/sharp";
import { createMagicLinkTemplate } from "@/infrastructure/mail/magic-link-template";
import { SmtpMailer } from "@/infrastructure/mail/smtp";
import { DrizzleMagicLinkRepository, DrizzleSessionRepository, PostgresRateLimiter } from "@/infrastructure/repositories/auth";
import { DrizzleUploadRepository } from "@/infrastructure/repositories/uploads";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { LocalFileStorage } from "@/infrastructure/storage/local";
import { S3FileStorage } from "@/infrastructure/storage/s3";
import { cryptoTokens, systemClock } from "@/infrastructure/system";
import { FsThemeCatalog } from "@/infrastructure/themes/fs-catalog";
import { loadConfig, type AppConfig } from "./config";

function createStorage(config: AppConfig): FileStorage {
  if (config.STORAGE_DRIVER === "s3") {
    if (!config.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    const client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION ?? "auto",
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials:
        config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
    return new S3FileStorage(client, config.S3_BUCKET);
  }
  return new LocalFileStorage(path.resolve(config.STORAGE_LOCAL_DIR));
}

/** Composition root: the only place that knows which adapter implements which port. */
function build() {
  const config = loadConfig();
  const { db } = createDatabase(config.DATABASE_URL);
  const themes = new FsThemeCatalog(path.resolve(config.THEMES_DIR));
  const deps: Deps = {
    users: new DrizzleUserRepository(db),
    magicLinks: new DrizzleMagicLinkRepository(db),
    sessions: new DrizzleSessionRepository(db),
    rateLimiter: new PostgresRateLimiter(db),
    websites: new DrizzleWebsiteRepository(db),
    uploads: new DrizzleUploadRepository(db),
    storage: createStorage(config),
    images: new SharpImageProcessor(),
    mailer: new SmtpMailer({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      user: config.SMTP_USER,
      password: config.SMTP_PASSWORD,
      from: config.MAIL_FROM,
    }),
    mailTemplate: createMagicLinkTemplate(),
    themes,
    clock: systemClock,
    tokens: cryptoTokens,
    appUrl: config.APP_URL.replace(/\/$/, ""),
  };

  return {
    config,
    themes,
    appUrl: deps.appUrl,
    async healthCheck(): Promise<boolean> {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
    requestMagicLink: new RequestMagicLink(deps),
    verifyMagicLink: new VerifyMagicLink(deps),
    getCurrentUser: new GetCurrentUser(deps),
    logout: new Logout(deps),
    updateProfile: new UpdateProfile(deps),
    createWebsite: new CreateWebsite(deps),
    listWebsites: new ListWebsites(deps),
    getWebsiteForOwner: new GetWebsiteForOwner(deps),
    updateHome: new UpdateHome(deps),
    updateSlug: new UpdateSlug(deps),
    setCoverImage: new SetCoverImage(deps),
    selectTheme: new SelectTheme(deps),
    updateDesign: new UpdateDesign(deps),
    deleteWebsite: new DeleteWebsite(deps),
    updateSection: new UpdateSection(deps),
    addItem: new AddItem(deps),
    updateItem: new UpdateItem(deps),
    deleteItem: new DeleteItem(deps),
    moveItem: new MoveItem(deps),
    uploadImage: new UploadImage(deps),
    getUpload: new GetUpload(deps),
    getPublicWebsite: new GetPublicWebsite(deps),
    getEventIcs: new GetEventIcs(deps),
  };
}

let instance: ReturnType<typeof build> | undefined;

export function container() {
  instance ??= build();
  return instance;
}
