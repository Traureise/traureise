import type {
  Clock,
  FileStorage,
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
  appUrl: string;
};
