import type {
  ArchiveWriter,
  BillingRepository,
  BillingSettings,
  PaymentProvider,
  Clock,
  FileStorage,
  GuestLinks,
  GuestMailTemplates,
  GuestRepository,
  ImageProcessor,
  MagicLinkMailTemplate,
  MagicLinkRepository,
  Mailer,
  RateLimiter,
  SessionRepository,
  ThemeCatalog,
  TokenGenerator,
  UploadRepository,
  UserRepository,
  WebsiteRepository,
} from "./ports";

/** Everything use cases may depend on. Wired in src/composition/container.ts. */
export type Deps = {
  users: UserRepository;
  magicLinks: MagicLinkRepository;
  sessions: SessionRepository;
  rateLimiter: RateLimiter;
  websites: WebsiteRepository;
  uploads: UploadRepository;
  storage: FileStorage;
  images: ImageProcessor;
  mailer: Mailer;
  mailTemplate: MagicLinkMailTemplate;
  themes: ThemeCatalog;
  clock: Clock;
  tokens: TokenGenerator;
  billing: BillingSettings;
  billingRepo: BillingRepository;
  /** Set only when billing is enabled and configured. */
  payments: PaymentProvider | null;
  archive: ArchiveWriter;
  guests: GuestRepository;
  guestLinks: GuestLinks;
  guestMail: GuestMailTemplates;
  appUrl: string;
};
