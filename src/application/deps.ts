import type {
  CardMailTemplates,
  CardRenderer,
  CardRepository,
  CardTexts,
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
  WeddingRepository,
} from "./ports";

/** Everything use cases may depend on. Wired in src/composition/container.ts. */
export type Deps = {
  users: UserRepository;
  magicLinks: MagicLinkRepository;
  sessions: SessionRepository;
  rateLimiter: RateLimiter;
  weddings: WeddingRepository;
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
  cards: CardRepository;
  cardRenderer: CardRenderer;
  cardMail: CardMailTemplates;
  cardTexts: CardTexts;
  /** Emails per job run, and the pause between two (rate limit for the SMTP server). */
  mailRate: { batchSize: number; intervalMs: number };
  appUrl: string;
};
