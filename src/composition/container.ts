import "server-only";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { DeleteAccount, ExportAccount, WeddingsBlockingDeletion } from "@/application/account";
import {
  GetCurrentUser,
  Logout,
  RequestMagicLink,
  UpdateProfile,
  VerifyMagicLink,
} from "@/application/auth";
import { GetPricing, HandlePaymentWebhook, ListPurchases, ListWeddingPlans, StartCheckout } from "@/application/billing";
import type { Deps } from "@/application/deps";
import type { BillingSettings, FileStorage, PaymentProvider } from "@/application/ports";
import { FflateArchiveWriter } from "@/infrastructure/archive/zip";
import { FflateSpreadsheets } from "@/infrastructure/spreadsheets";
import { CreemPaymentProvider } from "@/infrastructure/payments/creem";
import { DrizzleBillingRepository } from "@/infrastructure/repositories/billing";
import { GetEventIcs, GetPublicWebsite, GetWeddingIcs } from "@/application/public";
import {
  DecideGuestRequest,
  DeleteHousehold,
  DeletePoll,
  ExportGuestsCsv,
  GetGuestFormPreview,
  GetGuestPage,
  RunGuestJobs,
  SaveHousehold,
  SavePoll,
  SaveRsvpSettings,
  SubmitGuestResponse,
  GetCoupleAnswerForm,
  SaveCoupleAnswer,
} from "@/application/guests";
import { DownloadGuestTemplate, ImportGuests, PlanGuestImport, PreviewGuestImport } from "@/application/guest-import";
import { createGuestMailTemplates } from "@/infrastructure/mail/guest-templates";
import {
  ExportCard,
  GetCardEditor,
  GetCardPreview,
  GetEngagementPage,
  GetHouseholdPage,
  GetUnsubscribe,
  MarkCardsOpened,
  MarkCardsSent,
  MarkEngagementShared,
  RunMailJobs,
  SaveCard,
  SendCardEmails,
  SendReminders,
  SetCardExcluded,
  ShareCard,
  Unsubscribe,
} from "@/application/cards";
import { SatoriCardRenderer } from "@/infrastructure/cards/renderer";
import { createCardMailTemplates, createCardTexts } from "@/infrastructure/mail/card-templates";
import { createSiteTexts } from "@/infrastructure/site-texts";
import { DrizzleCardRepository } from "@/infrastructure/repositories/cards";
import { DrizzleGuestRepository } from "@/infrastructure/repositories/guests";
import { AddEvent, DeleteEvent, ListEvents, UpdateEvent } from "@/application/schedule";
import { AddBlock, AddSection, DeleteBlock, DeleteSection, MoveBlock, MoveSection, UpdateBlock, UpdateSection } from "@/application/sections";
import { GetUpload, UploadImage } from "@/application/uploads";
import { AddVersion, AssignVersion, DeleteVersion, RenameVersion } from "@/application/versions";
import {
  AcceptInvitation,
  ChangeMemberRole,
  InviteMember,
  LeaveWedding,
  ListMembers,
  RemoveMember,
  SetContactPerson,
  WithdrawInvitation,
} from "@/application/members";
import { CreateWedding, DeleteWedding, GetRecentWedding, GetWeddingFrame, GetWeddingHome, ListWeddings, MarkWeddingUsed, UpdateWeddingDetails, UpdateWeddingSlug } from "@/application/weddings";
import { GetWebsiteForOwner, SelectTheme, SetCoverImage, SetPublished, UpdateDesign, UpdateHome, UpdateSlug } from "@/application/websites";
import { createDatabase } from "@/infrastructure/db/client";
import { SharpImageProcessor } from "@/infrastructure/images/sharp";
import { createInvitationTemplate } from "@/infrastructure/mail/invitation-template";
import { createMagicLinkTemplate } from "@/infrastructure/mail/magic-link-template";
import { SmtpMailer } from "@/infrastructure/mail/smtp";
import { DrizzleMagicLinkRepository, DrizzleSessionRepository, PostgresRateLimiter } from "@/infrastructure/repositories/auth";
import { DrizzleUploadRepository } from "@/infrastructure/repositories/uploads";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { DrizzleInvitationRepository, DrizzleWeddingRepository } from "@/infrastructure/repositories/weddings";
import { LocalFileStorage } from "@/infrastructure/storage/local";
import { S3FileStorage } from "@/infrastructure/storage/s3";
import { adjustableClock, cryptoTokens, hmacGuestLinks, systemClock } from "@/infrastructure/system";
import { FsThemeCatalog } from "@/infrastructure/themes/fs-catalog";
import { appSecret, billingProblems, loadConfig, type AppConfig } from "./config";

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

function createPayments(config: AppConfig): PaymentProvider | null {
  if (!config.BILLING_ENABLED || billingProblems(config).length > 0) return null;
  return new CreemPaymentProvider({ apiUrl: config.CREEM_API_URL, apiKey: config.CREEM_API_KEY!, webhookSecret: config.CREEM_WEBHOOK_SECRET! });
}

function billingSettings(config: AppConfig, payments: PaymentProvider | null): BillingSettings {
  return {
    enabled: payments !== null,
    offers: [
      { tier: "rsvp", priceCents: config.PRICE_RSVP_EUR * 100, productId: config.CREEM_PRODUCT_RSVP ?? null },
      { tier: "invitations", priceCents: config.PRICE_INVITATIONS_EUR * 100, productId: config.CREEM_PRODUCT_INVITATIONS ?? null },
      { tier: "complete", priceCents: config.PRICE_COMPLETE_EUR * 100, productId: config.CREEM_PRODUCT_COMPLETE ?? null },
    ],
    unlockedTiers: config.BILLING_TEST_UNLOCK_TIERS,
  };
}

/** Composition root: the only place that knows which adapter implements which port. */
function build() {
  const config = loadConfig();
  const { db } = createDatabase(config.DATABASE_URL);
  const themes = new FsThemeCatalog(path.resolve(config.THEMES_DIR));
  const payments = createPayments(config);
  const deps: Deps = {
    users: new DrizzleUserRepository(db),
    magicLinks: new DrizzleMagicLinkRepository(db),
    sessions: new DrizzleSessionRepository(db),
    rateLimiter: new PostgresRateLimiter(db),
    weddings: new DrizzleWeddingRepository(db),
    invitations: new DrizzleInvitationRepository(db),
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
    invitationMail: createInvitationTemplate(),
    themes,
    clock: config.TEST_HOOKS ? adjustableClock : systemClock,
    tokens: cryptoTokens,
    billing: billingSettings(config, payments),
    billingRepo: new DrizzleBillingRepository(db),
    payments,
    archive: new FflateArchiveWriter(),
    spreadsheets: new FflateSpreadsheets(),
    guests: new DrizzleGuestRepository(db),
    guestLinks: hmacGuestLinks(appSecret(config)),
    guestMail: createGuestMailTemplates(),
    cards: new DrizzleCardRepository(db),
    cardRenderer: new SatoriCardRenderer(path.resolve(config.CARD_FONTS_DIR)),
    cardMail: createCardMailTemplates(),
    cardTexts: createCardTexts(),
    siteTexts: createSiteTexts(),
    mailRate: { batchSize: config.MAIL_BATCH_SIZE, intervalMs: config.MAIL_SEND_INTERVAL_MS },
    appUrl: config.APP_URL.replace(/\/$/, ""),
  };

  return {
    config,
    themes,
    appUrl: deps.appUrl,
    billingEnabled: deps.billing.enabled,
    clock: deps.clock,
    /** Only with TEST_HOOKS=true: moves the clock (tests of deadlines and retention). */
    testHooks: config.TEST_HOOKS ? { setClockOffset: (ms: number) => adjustableClock.setOffset(ms) } : null,
    sourceCodeUrl: config.SOURCE_CODE_URL,
    /** The operator's legal pages that exist, in footer order; linked, never rendered by Traureise. */
    legalLinks: (
      [
        ["imprint", config.IMPRINT_URL],
        ["privacy", config.PRIVACY_URL],
        ["terms", config.TERMS_URL],
      ] as const
    ).flatMap(([page, href]) => (href ? [{ page, href }] : [])),
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
    createWedding: new CreateWedding(deps),
    listWeddings: new ListWeddings(deps),
    getRecentWedding: new GetRecentWedding(deps),
    getWeddingHome: new GetWeddingHome(deps),
    getWeddingFrame: new GetWeddingFrame(deps),
    markWeddingUsed: new MarkWeddingUsed(deps),
    updateWeddingDetails: new UpdateWeddingDetails(deps),
    updateWeddingSlug: new UpdateWeddingSlug(deps),
    deleteWedding: new DeleteWedding(deps),
    listMembers: new ListMembers(deps),
    changeMemberRole: new ChangeMemberRole(deps),
    removeMember: new RemoveMember(deps),
    leaveWedding: new LeaveWedding(deps),
    setContactPerson: new SetContactPerson(deps),
    inviteMember: new InviteMember(deps),
    withdrawInvitation: new WithdrawInvitation(deps),
    acceptInvitation: new AcceptInvitation(deps),
    addVersion: new AddVersion(deps),
    renameVersion: new RenameVersion(deps),
    deleteVersion: new DeleteVersion(deps),
    assignVersion: new AssignVersion(deps),
    getWebsiteForOwner: new GetWebsiteForOwner(deps),
    updateHome: new UpdateHome(deps),
    updateSlug: new UpdateSlug(deps),
    setPublished: new SetPublished(deps),
    setCoverImage: new SetCoverImage(deps),
    selectTheme: new SelectTheme(deps),
    updateDesign: new UpdateDesign(deps),
    listEvents: new ListEvents(deps),
    addEvent: new AddEvent(deps),
    updateEvent: new UpdateEvent(deps),
    deleteEvent: new DeleteEvent(deps),
    addSection: new AddSection(deps),
    updateSection: new UpdateSection(deps),
    deleteSection: new DeleteSection(deps),
    moveSection: new MoveSection(deps),
    addBlock: new AddBlock(deps),
    updateBlock: new UpdateBlock(deps),
    deleteBlock: new DeleteBlock(deps),
    moveBlock: new MoveBlock(deps),
    uploadImage: new UploadImage(deps),
    getUpload: new GetUpload(deps),
    getPublicWebsite: new GetPublicWebsite(deps),
    getEventIcs: new GetEventIcs(deps),
    getWeddingIcs: new GetWeddingIcs(deps),
    exportAccount: new ExportAccount(deps),
    deleteAccount: new DeleteAccount(deps),
    weddingsBlockingDeletion: new WeddingsBlockingDeletion(deps),
    getPricing: new GetPricing(deps),
    listWeddingPlans: new ListWeddingPlans(deps),
    listPurchases: new ListPurchases(deps),
    startCheckout: new StartCheckout(deps),
    handlePaymentWebhook: new HandlePaymentWebhook(deps),
    getGuestPage: new GetGuestPage(deps),
    saveHousehold: new SaveHousehold(deps),
    deleteHousehold: new DeleteHousehold(deps),
    saveRsvpSettings: new SaveRsvpSettings(deps),
    savePoll: new SavePoll(deps),
    deletePoll: new DeletePoll(deps),
    decideGuestRequest: new DecideGuestRequest(deps),
    exportGuestsCsv: new ExportGuestsCsv(deps),
    downloadGuestTemplate: new DownloadGuestTemplate(deps),
    previewGuestImport: new PreviewGuestImport(deps),
    planGuestImport: new PlanGuestImport(deps),
    importGuests: new ImportGuests(deps),
    getGuestFormPreview: new GetGuestFormPreview(deps),
    submitGuestResponse: new SubmitGuestResponse(deps),
    getCoupleAnswerForm: new GetCoupleAnswerForm(deps),
    saveCoupleAnswer: new SaveCoupleAnswer(deps),
    runGuestJobs: new RunGuestJobs(deps),
    getCardEditor: new GetCardEditor(deps),
    saveCard: new SaveCard(deps),
    exportCard: new ExportCard(deps),
    markEngagementShared: new MarkEngagementShared(deps),
    getHouseholdPage: new GetHouseholdPage(deps),
    getCardPreview: new GetCardPreview(deps),
    markCardsOpened: new MarkCardsOpened(deps),
    getEngagementPage: new GetEngagementPage(deps),
    shareCard: new ShareCard(deps),
    setCardExcluded: new SetCardExcluded(deps),
    markCardsSent: new MarkCardsSent(deps),
    sendCardEmails: new SendCardEmails(deps),
    sendReminders: new SendReminders(deps),
    /** A fresh instance per run: it caches contexts and images for that run only. */
    runMailJobs: (options: { weddingId?: string; automatic?: boolean } = {}) => new RunMailJobs(deps).execute(options),
    getUnsubscribe: new GetUnsubscribe(deps),
    unsubscribe: new Unsubscribe(deps),
  };
}

let instance: ReturnType<typeof build> | undefined;

export function container() {
  instance ??= build();
  return instance;
}
