import type { Book, BookSubject, Subject, Review, User, LibraryItem } from "../generated/prisma/client";

type BookWithSubjects = Book & {
  bookSubjects: (BookSubject & { subject: Subject })[];
};

type ReviewWithUser = Review & { user: User };

type LibraryItemWithBook = LibraryItem & {
  book: BookWithSubjects;
};

export function toBook(b: BookWithSubjects) {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    coverUrl: b.coverUrl ?? null,
    tags: b.bookSubjects.map((bs) => bs.subject.name),
    description: b.description ?? "",
    rating: b.ratingAvg ? Number(b.ratingAvg) : 0,
    reviewCount: b.ratingCount ?? 0,
  };
}

export function toReview(r: ReviewWithUser) {
  return {
    id: r.id,
    reviewer: r.user.name,
    date: r.createdAt.toISOString().split("T")[0],
    rating: r.rating,
    text: r.text ?? "",
    avatarHue: r.user.avatarHue,
  };
}

export function toLibraryBook(item: LibraryItemWithBook) {
  return {
    ...toBook(item.book),
    status: item.status,
    isCurrent: item.isCurrent,
    progressPct: Number(item.progressPct),
    timeLeftMin: item.timeLeftMin ?? null,
  };
}
