import type { VersionItem } from "@/domain/weddings";

/** Where a version is edited: card versions in the card editor, website versions in the website editor. */
export const versionHref = (weddingId: string, item: VersionItem, versionId: string) =>
  `/hochzeiten/${weddingId}/${item === "website" ? "website" : "karten"}/${versionId}`;
